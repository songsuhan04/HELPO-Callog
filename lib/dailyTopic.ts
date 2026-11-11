import { retryTransient } from "./retry";

// 녹음·촬영 화면에서 던져주는 주제를 AI로 만든다.
//
// 어르신께 그대로 보이는 문장이라 생성 결과를 그냥 믿지 않는다. 아래 검증을 통과하지 못하면
// 버리고, 호출한 쪽이 고정 목록으로 떨어지게 한다. 겁을 주는 표현이나 의료 조언성 문구가
// 어르신 화면에 뜨는 것이 이 기능에서 가장 나쁜 결과다.

// 의료 조언으로 읽힐 수 있는 표현 — 이 서비스는 의료기기가 아니고 그렇게 말해서도 안 된다
const MEDICAL_ADVICE = /처방|진단|복용량|용량을|약을\s*(늘|줄|끊|바꾸)|병원에\s*(가|가서|가셔)|진료를\s*받|치료를\s*받|검사를\s*받/;

// 불안을 키우는 표현 — 안부를 묻는 자리에서 쓰면 안 된다
const ALARMING = /위험|응급|사망|돌아가시|죽음|큰일|심각|악화|발작|쓰러/;

// 개인정보를 캐묻는 방향으로 가면 안 된다
const PRYING = /주민등록|계좌|비밀번호|카드번호|재산|돈이\s*얼마/;

const MIN_LENGTH = 8;
const MAX_LENGTH = 60;
// 상한을 늘리는 대신 프롬프트에서 더 짧게 요구한다. 첫 운영 결과 생성된 문장이 39~59자로
// 상한에 바짝 붙어 있었고 주제의 절반 넘게 길이로 탈락했다. 어르신 화면의 큰 글씨 제목
// 한 줄로 들어가는 문장이라, 짧은 편이 탈락률뿐 아니라 읽기에도 낫다.

export interface TopicRejection {
  reason: string;
}

/**
 * 어르신께 보여도 되는 주제인지 검사한다. 통과하면 null, 걸리면 이유를 돌려준다.
 * (이유를 남기는 것은 로그로 어떤 문구가 걸렀는지 볼 수 있게 하려는 것)
 */
export function rejectTopic(topic: unknown): TopicRejection | null {
  if (typeof topic !== "string") return { reason: "not_a_string" };
  const text = topic.trim();
  if (text.length < MIN_LENGTH) return { reason: "too_short" };
  if (text.length > MAX_LENGTH) return { reason: "too_long" };
  // 줄바꿈이 있으면 여러 문장을 밀어 넣은 것 — 화면 제목 한 줄로 쓸 수 없다
  if (/[\r\n]/.test(text)) return { reason: "multiline" };
  // 한글이 없으면 지시문이나 영어 응답이 새어 나온 것
  if (!/[가-힣]/.test(text)) return { reason: "not_korean" };
  // 마크다운·JSON 조각이 섞여 나오는 경우가 있다
  if (/[{}\[\]<>*`|]/.test(text)) return { reason: "markup" };
  if (MEDICAL_ADVICE.test(text)) return { reason: "medical_advice" };
  if (ALARMING.test(text)) return { reason: "alarming" };
  if (PRYING.test(text)) return { reason: "prying" };
  // 존댓말로 끝나는 권유/질문이어야 한다 — 반말이나 명령문이 나오면 버린다
  if (!/(요|요\?|까\?|나요\?|세요|십니까\?|\?)$/.test(text)) return { reason: "not_polite_request" };
  return null;
}

function buildTopicPrompt(context: {
  conditions: string[];
  recentAnswers: string[];
  recentTopics: string[];
}): string {
  return `당신은 독거 어르신에게 매일 안부를 묻는 다정한 도우미입니다.
어르신이 음성으로 이야기하실 주제 하나와, 가족에게 보내는 영상편지 주제 하나를 만들어주세요.

어르신의 지병: ${context.conditions.length ? context.conditions.join(", ") : "없음"}
어르신이 최근 안부에서 하신 답변: ${context.recentAnswers.length ? context.recentAnswers.join(" / ") : "(없음)"}
최근에 이미 쓴 주제(반복 금지): ${context.recentTopics.length ? context.recentTopics.join(" / ") : "(없음)"}

규칙:
1. 짧고 다정한 존댓말 한 문장. 35자 안팎으로 짧게 쓰고, 어떤 경우에도 55자를 넘기지 마세요.\n   어르신 화면에 큰 글씨 제목으로 들어가므로 길면 읽기 어렵습니다.
2. 어르신이 편하게 이야기를 시작할 수 있는 열린 주제로 만드세요.
3. 최근 답변에 자연스럽게 이어지는 주제라면 더 좋습니다. 다만 아픈 이야기를 캐묻지는 마세요.
4. 의료 조언(처방·복용량·병원 방문 권유)은 절대 하지 마세요. 이 서비스는 의료기기가 아닙니다.
5. 불안을 키우는 말(위험, 응급, 악화 등)을 쓰지 마세요.
6. 개인정보(계좌, 재산, 비밀번호 등)를 묻지 마세요.
7. speech_topic은 안부를 여쭙는 성격, letter_topic은 가족에게 마음을 전하는 성격으로 만드세요.

반드시 아래 JSON 형식으로만, 다른 설명 없이 답하세요:
{"speech_topic": "주제 한 문장", "letter_topic": "주제 한 문장"}`;
}

export interface GeneratedTopics {
  speechTopic: string | null;
  letterTopic: string | null;
  source: "gemini" | "fallback";
  // 버려진 이유. 로그는 한 시간이면 사라지므로 부르는 쪽이 DB에 남긴다.
  notes: { speech?: string; letter?: string };
}

/**
 * 주제를 만든다. 실패하거나 검증에 걸리면 해당 주제를 null로 돌려주고, 화면은 고정 목록을 쓴다.
 * 예외를 던지지 않는다 — 주제를 못 만드는 것이 안부를 막을 이유는 없다.
 */
export async function generateTopics(
  geminiKey: string | undefined,
  context: { conditions: string[]; recentAnswers: string[]; recentTopics: string[] }
): Promise<GeneratedTopics> {
  if (!geminiKey) return { speechTopic: null, letterTopic: null, source: "fallback", notes: {} };
  try {
    // 질문 생성과 같은 이유로 짧게 한 번 더 시도한다 — 새벽 크론이 몰아 호출하면서
    // 분당 한도에 걸리는 일이 잦았다(lib/dailyQuestions.ts의 설명 참고).
    const json = await retryTransient(
      async () => {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: buildTopicPrompt(context) }] }],
              generationConfig: { responseMimeType: "application/json" },
            }),
          }
        );
        const body = await resp.json();
        if (!resp.ok || body?.error) {
          // 상태 코드를 메시지에 남겨야 isTransient가 429/5xx를 알아본다
          throw new Error(`gemini ${resp.status}: ${body?.error?.message ?? "request failed"}`);
        }
        return body;
      },
      {
        attempts: 2,
        baseDelayMs: 600,
        onRetry: (attempt, err) =>
          console.error("generateTopics: retrying", attempt, err instanceof Error ? err.message : err),
      }
    );
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const unfenced = text.replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, "$1");
    const parsed = JSON.parse(unfenced) as { speech_topic?: unknown; letter_topic?: unknown };

    const speechReject = rejectTopic(parsed.speech_topic);
    const letterReject = rejectTopic(parsed.letter_topic);
    if (speechReject) console.error("generateTopics: speech_topic rejected:", speechReject.reason);
    if (letterReject) console.error("generateTopics: letter_topic rejected:", letterReject.reason);

    const speechTopic = speechReject ? null : String(parsed.speech_topic).trim();
    const letterTopic = letterReject ? null : String(parsed.letter_topic).trim();
    return {
      speechTopic,
      letterTopic,
      // 둘 다 걸렀다면 AI가 쓸모 있는 걸 못 준 것이므로 fallback으로 기록한다
      source: speechTopic || letterTopic ? "gemini" : "fallback",
      notes: {
        ...(speechReject ? { speech: speechReject.reason } : {}),
        ...(letterReject ? { letter: letterReject.reason } : {}),
      },
    };
  } catch (err) {
    console.error("generateTopics: falling back", err instanceof Error ? err.message : err);
    return {
      speechTopic: null,
      letterTopic: null,
      source: "fallback",
      notes: { speech: "request_failed", letter: "request_failed" },
    };
  }
}
