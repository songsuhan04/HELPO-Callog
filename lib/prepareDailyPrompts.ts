import type { SupabaseClient } from "@supabase/supabase-js";
import { selectDailyQuestions } from "./dailyQuestions";
import { generateTopics } from "./dailyTopic";
import { RETENTION } from "./retention";

// 그날 쓸 안부 질문과 녹음 주제를 새벽에 미리 준비해 daily_prompt에 넣는다.
//
// 두 단계로 나눈다.
//
//  1단계 — 질문. 질문 표에서 코드가 고른다(lib/dailyQuestions.ts). AI를 부르지 않으므로
//          어르신이 몇 명이든 한 번에 끝난다. 전원이 여기서 준비된다.
//  2단계 — 주제(말하기 안부에 띄우는 한 줄). 이쪽은 Gemini가 최근 답변을 보고 쓴다.
//          느리고 한도가 있어서, 실행 시간 안에서 되는 만큼만 한다. 못 한 어르신은 화면이
//          고정 주제 목록을 쓴다.
//
// 예전에는 질문도 Gemini가 만들었고, 한 어르신의 질문과 주제를 한 묶음으로 처리했다.
// 그래서 AI가 느리거나 거절하면 질문까지 같이 밀렸다. 실측:
//  - 동시 호출이 많던 때(어르신 6명 × 2건)는 분당 한도에 걸려 질문의 61%가 고정 문항으로
//    떨어졌다(10/28~11/11).
//  - 동시 호출을 줄이자 실패는 16%로 내려갔지만, 시간 안에 처리되는 어르신이 하루 1~6명
//    (전체 16명)으로 줄었다(11/12~11/16). 나머지는 화면을 열 때 AI를 기다려야 했다.
// 어느 쪽으로 조절해도 한쪽이 나빠졌다. 질문을 AI에서 떼어내야 풀리는 문제였다.
// 근거: 2회차 기술 멘토링(2026-11-12) — "질문 수와 범위는 사람이 정하기".
//
// 말투를 AI로 더 다양하게 하고 싶어지면 2단계에 얹는다 — 1단계가 고른 질문의 문장만 바꾸고,
// 개수가 달라지거나 실패하면 원래 문장을 그대로 둔다. 1단계에는 넣지 않는다.

// 한 번 실행에서 처리할 최대 어르신 수 — 크론 실행 시간이 무한정 늘어나지 않게 하는 안전장치
const MAX_ELDERS_PER_RUN = 200;
// 주제 개인화에 참고할 최근 안부 답변 수
const RECENT_ANSWER_LIMIT = 8;
// 지난 주제를 며칠치까지 남겨둘지. 주제 반복을 피하려면 최근 며칠만 알면 되고, 그 이상은
// 하루하루 쌓이기만 한다(어르신 1명당 매일 1행). 영상편지에 7일 보관을 둔 것과 같은 이유로
// 여기도 상한을 둔다 — 지병·안부 답변에서 뽑아낸 문장이라 오래 들고 있을 이유가 없다.
const PROMPT_RETENTION_DAYS = RETENTION.PROMPT_DAYS;

// 주제를 동시에 몇 명씩 만들지. 한 명씩 차례로 하면 실행 시간을 넘긴다(8/29 새벽에 9명 중
// 4명만 만들고 끊겼다 — 어르신당 15~20초).
// Gemini에 동시에 나가는 요청은 6건을 넘기지 않는다. 12건이 나가던 때 분당 한도에 걸렸고,
// 6건으로 줄인 뒤로는 실패가 16%(마지막 나흘은 0건)로 내려갔다(위 실측). 이제 어르신 한 명당
// 호출이 주제 1건뿐이라 6명이 곧 6건이다.
const TOPIC_CONCURRENCY = 6;

// Vercel Hobby 플랜의 함수 실행 상한이 60초라, 그 전에 스스로 멈추고 지금까지 만든 것을
// 저장한 채 끝낸다. 중간에 강제로 잘리면 무엇까지 했는지 알 수 없다.
//
// 남은 시간만 보고 다음 묶음을 시작하면, 그 묶음이 예상보다 오래 걸릴 때 상한에 걸린다.
// 그래서 직전 묶음이 실제로 걸린 시간을 재서 "이번 묶음도 그만큼 걸린다면 상한을 넘는가"로
// 판단한다. Gemini 응답이 느린 날에도 스스로 멈출 수 있다.
const SAFE_LIMIT_MS = 55_000;
// 첫 묶음은 실측치가 없으므로 이 값으로 가정한다(관측된 어르신당 15~20초 기준)
const ASSUMED_WAVE_MS = 20_000;
// 느려질 여지를 두고 직전 실측치에 곱한다
const WAVE_SLACK = 1.3;

// 지병을 한 번에 읽어올 어르신 수. ID를 주소에 실어 보내므로 너무 길어지지 않게 끊는다
const CONDITION_CHUNK = 50;

export interface PrepareResult {
  /** 이번 실행에서 질문을 준비한 어르신 수 */
  prepared: number;
  /** 이미 그날 질문이 있어 건드리지 않은 어르신 수 */
  skipped: number;
  /** 주제를 Gemini가 쓴 어르신 수 */
  gemini: number;
  /** 주제 생성이 실패하거나 걸러져 고정 목록에 맡긴 어르신 수 */
  fallback: number;
  pruned: number;
  /** 시간이 모자라 주제를 만들지 못한 어르신 수. 질문은 전원 준비되므로 여기 들지 않는다 */
  remaining: number;
}

/**
 * @param date 준비할 날짜(YYYY-MM-DD, 한국 날짜). 이미 준비된 것은 다시 만들지 않는다 —
 *             크론이 두 번 돌아도 그날 질문과 주제가 바뀌면 안 된다.
 */
export async function prepareDailyPrompts(
  admin: SupabaseClient,
  date: string,
  geminiKey: string | undefined
): Promise<PrepareResult> {
  const startedAt = Date.now();
  const result: PrepareResult = { prepared: 0, skipped: 0, gemini: 0, fallback: 0, pruned: 0, remaining: 0 };

  // 오래된 것을 먼저 지운다. 실패해도 준비는 계속한다 — 정리 못 한 것이 오늘 안부를
  // 막을 이유는 없다.
  const cutoff = new Date(Date.parse(`${date}T00:00:00Z`) - PROMPT_RETENTION_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const { data: pruned, error: pruneError } = await admin
    .from("daily_prompt")
    .delete()
    .lt("date", cutoff)
    .select("date");
  if (pruneError) console.error("prepareDailyPrompts: prune failed", pruneError.message);
  else result.pruned = pruned?.length ?? 0;

  const { data: elders, error } = await admin
    .from("elder_profile")
    .select("id")
    .limit(MAX_ELDERS_PER_RUN);
  if (error) {
    console.error("prepareDailyPrompts: elder list failed", error.message);
    return result;
  }
  const elderIds = (elders ?? []).map((e) => e.id as string);

  const { data: existing } = await admin
    .from("daily_prompt")
    .select("elder_profile_id,notes")
    .eq("date", date);
  const hasRow = new Set<string>();
  const topicsDone = new Set<string>();
  for (const row of existing ?? []) {
    const id = row.elder_profile_id as string;
    hasRow.add(id);
    // 주제를 시도한 흔적이 있으면 끝난 것으로 본다(성공이든 실패든 다시 하지 않는다)
    if ((row.notes as { topicSource?: string } | null)?.topicSource) topicsDone.add(id);
  }

  // ── 1단계: 질문 ────────────────────────────────────────────
  const needQuestions = elderIds.filter((id) => !hasRow.has(id));
  result.skipped = elderIds.length - needQuestions.length;

  const conditionsOf = new Map<string, string[]>();
  for (let i = 0; i < elderIds.length; i += CONDITION_CHUNK) {
    const chunk = elderIds.slice(i, i + CONDITION_CHUNK);
    const { data: rows, error: condError } = await admin
      .from("elder_condition")
      .select("elder_profile_id,condition_type")
      .in("elder_profile_id", chunk);
    // 지병을 못 읽으면 그 어르신들은 공통 질문만 받는다. 질문이 아예 없는 것보다 낫다
    if (condError) console.error("prepareDailyPrompts: condition query failed", condError.message);
    for (const row of rows ?? []) {
      const id = row.elder_profile_id as string;
      conditionsOf.set(id, [...(conditionsOf.get(id) ?? []), row.condition_type as string]);
    }
  }

  if (needQuestions.length > 0) {
    const { error: insertError } = await admin.from("daily_prompt").upsert(
      needQuestions.map((id) => ({
        elder_profile_id: id,
        date,
        questions: selectDailyQuestions(conditionsOf.get(id) ?? [], date, id),
        // source는 "AI가 쓰였는가"를 적는 칸이다. 질문에는 쓰이지 않으니 fixed로 두고,
        // 2단계에서 주제 결과(gemini | fallback)로 바꾼다.
        source: "fixed",
        notes: { questionSource: "fixed" },
      })),
      // 그 사이 화면에서 먼저 만들어진 행이 있으면 건드리지 않는다
      { onConflict: "elder_profile_id,date", ignoreDuplicates: true }
    );
    if (insertError) console.error("prepareDailyPrompts: question upsert failed", insertError.message);
    else {
      result.prepared = needQuestions.length;
      for (const id of needQuestions) hasRow.add(id);
    }
  }

  // ── 2단계: 주제 ────────────────────────────────────────────
  // 한 어르신 몫. 실패해도 다른 어르신 처리를 막지 않도록 예외를 안에서 삼킨다.
  async function prepareTopics(elderId: string): Promise<void> {
    const [{ data: recentRows }, { data: recentTopicRows }] = await Promise.all([
      admin
        .from("daily_checkin")
        .select("answers")
        .eq("elder_profile_id", elderId)
        .order("date", { ascending: false })
        .limit(3),
      admin
        .from("daily_prompt")
        .select("speech_topic,letter_topic")
        .eq("elder_profile_id", elderId)
        .order("date", { ascending: false })
        .limit(7),
    ]);

    // 최근에 어떤 답을 했는지까지 넣어 "어제 이러셨는데 오늘은 어떠세요" 같은 주제가 나오게 한다
    const recentAnswers = (recentRows ?? [])
      .flatMap((r) => ((r.answers as { question?: string; choice?: string }[]) ?? []))
      .filter((a) => a?.question && a?.choice)
      .map((a) => `${a.question} → ${a.choice}`)
      .slice(0, RECENT_ANSWER_LIMIT);
    const recentTopics = (recentTopicRows ?? [])
      .flatMap((r) => [r.speech_topic as string | null, r.letter_topic as string | null])
      .filter((t): t is string => Boolean(t));

    const topicResult = await generateTopics(geminiKey, {
      conditions: conditionsOf.get(elderId) ?? [],
      recentAnswers,
      recentTopics,
    });

    const { error: updateError } = await admin
      .from("daily_prompt")
      .update({
        // 검증에 걸린 주제는 null로 남긴다 — 화면이 고정 목록으로 떨어진다
        speech_topic: topicResult.speechTopic,
        letter_topic: topicResult.letterTopic,
        // 왜 버려졌는지와, 질문·주제가 각각 어디서 왔는지 남긴다 — 로그는 한 시간이면 사라진다.
        // 조회: select notes->>'topicSource', count(*) from daily_prompt group by 1;
        notes: { ...topicResult.notes, questionSource: "fixed", topicSource: topicResult.source },
        source: topicResult.source,
      })
      .eq("elder_profile_id", elderId)
      .eq("date", date);
    if (updateError) {
      console.error("prepareDailyPrompts: topic update failed", elderId, updateError.message);
      return;
    }
    if (topicResult.source === "gemini") result.gemini++;
    else result.fallback++;
  }

  // 행이 있는 어르신만 — 1단계 저장이 실패했다면 주제를 붙일 자리가 없다
  const needTopics = elderIds.filter((id) => hasRow.has(id) && !topicsDone.has(id));

  // TOPIC_CONCURRENCY 명씩 묶어 처리한다. 다음 묶음을 시작하기 전에, 직전 묶음이 걸린 만큼
  // 또 걸린다고 보고 상한을 넘길 것 같으면 멈춘다.
  let index = 0;
  let lastWaveMs = ASSUMED_WAVE_MS;
  while (index < needTopics.length) {
    const elapsed = Date.now() - startedAt;
    if (elapsed + lastWaveMs * WAVE_SLACK > SAFE_LIMIT_MS) {
      result.remaining = needTopics.length - index;
      console.error(
        `prepareDailyPrompts: stopping early, topics for ${result.remaining} elder(s) left ` +
          `(elapsed ${elapsed}ms, last wave ${lastWaveMs}ms)`
      );
      break;
    }
    const waveStartedAt = Date.now();
    const batch = needTopics.slice(index, index + TOPIC_CONCURRENCY);
    await Promise.all(
      batch.map((id) =>
        prepareTopics(id).catch((err) => {
          console.error("prepareDailyPrompts: elder failed", id, err instanceof Error ? err.message : err);
        })
      )
    );
    lastWaveMs = Date.now() - waveStartedAt;
    index += batch.length;
  }

  return result;
}
