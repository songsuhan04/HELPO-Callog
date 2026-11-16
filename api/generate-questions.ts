import type { VercelRequest, VercelResponse } from "@vercel/node";
import { selectDailyQuestions, usableQuestions } from "../lib/dailyQuestions";
import { authorizeElderAccess } from "../lib/requestAuth";
import { todaySeoul } from "../lib/seoulDate";

// 그날 준비된 질문이 없을 때 화면이 부르는 경로.
//
// 평소에는 새벽 크론이 전원의 질문을 미리 넣어두므로 여기까지 오지 않는다. 크론 뒤에 등록된
// 어르신이나 크론이 돌지 못한 날을 위해 남겨둔다.
//
// 이름은 generate지만 이제 AI를 부르지 않는다. 질문 표에서 코드가 고른다
// (lib/dailyQuestions.ts). 예전에는 여기서 Gemini를 불렀고, 어르신이 그 응답을 기다렸다.
// 8초를 넘기면 화면이 질문 1개짜리 비상 문항으로 떨어졌다 — 처음 가입한 분의 첫 안부가
// 그렇게 되곤 했다(2026-11-11 신규 4명 중 2명).
//
// 지병은 요청에 적힌 것을 믿지 않고 서버가 직접 읽는다. 무엇을 물을지는 서버가 정한다.
//
// 고른 질문은 daily_prompt에 저장한다(daily_checkin이 아니다). 어르신이 아무것도 답하지
// 않았는데 그날 안부 행이 생기면, 보호자 목록·위험도 계산·무응답 알림이 모두 "응답했다"로
// 본다. 준비해 둔 것과 실제로 답한 기록은 성격이 다르므로 저장 위치도 나눈다.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }
  const { elderProfileId, date: requestedDate } = (req.body ?? {}) as {
    elderProfileId?: string;
    date?: string;
  };

  // 그 어르신의 보호자이거나 어르신 본인의 세션일 때만 통과시킨다. 아래 저장이 요청에 적힌
  // 어르신 ID로 그날 질문을 쓰기 때문에, 확인 없이는 남의 어르신 것도 건드릴 수 있었다.
  const caller = await authorizeElderAccess(req, res, elderProfileId);
  if (!caller || !elderProfileId) return;
  const admin = caller.admin;

  // 화면의 날짜를 쓰되 모양이 이상하면 서버의 한국 날짜로 대신한다
  const date = typeof requestedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : todaySeoul();

  // 이미 그날 준비된 것이 있으면 그대로 돌려준다 — 몇 번을 불러도 그날 질문은 바뀌지 않는다
  const { data: existing } = await admin
    .from("daily_prompt")
    .select("questions")
    .eq("elder_profile_id", elderProfileId)
    .eq("date", date)
    .maybeSingle();
  const prepared = usableQuestions(existing?.questions);
  if (prepared) {
    res.status(200).json({ questions: prepared, source: "prepared" });
    return;
  }

  const { data: conditionRows, error: condError } = await admin
    .from("elder_condition")
    .select("condition_type")
    .eq("elder_profile_id", elderProfileId);
  // 지병을 못 읽으면 공통 질문만 나간다. 질문이 아예 없는 것보다 낫다
  if (condError) console.error("generate-questions: condition query failed", condError.message);
  const conditions = (conditionRows ?? []).map((r) => r.condition_type as string);

  const questions = selectDailyQuestions(conditions, date, elderProfileId);

  // 저장에 실패해도 질문은 그대로 돌려준다 — 저장 실패가 안부를 막을 이유는 없다.
  // 다음에 불러도 같은 날 같은 어르신이면 같은 질문이 골라진다.
  const { error } = await admin.from("daily_prompt").upsert(
    {
      elder_profile_id: elderProfileId,
      date,
      questions,
      source: "fixed",
      // 크론 경로(lib/prepareDailyPrompts.ts)와 같은 자리에 남겨야 둘을 한 번에 세어볼 수 있다
      notes: { questionSource: "fixed" },
    },
    { onConflict: "elder_profile_id,date" }
  );
  if (error) console.error("generate-questions: daily_prompt upsert failed", error.message);

  res.status(200).json({ questions, source: "fixed" });
}
