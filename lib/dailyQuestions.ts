import { retryTransient } from "./retry";

// 오늘의 안부 질문을 만든다 — 지병에 맞춘 Gemini 생성과, 실패 시 쓰는 고정 문항.
//
// 원래 api/generate-questions.ts 안에만 있었는데, 새벽 크론에서도 같은 로직으로 미리
// 만들어두게 되면서 공용 모듈로 옮겼다. 두 곳에서 각자 구현하면 문항 규칙이 갈라진다.
//
// category/severity는 lib/riskScoring.ts가 위험도를 계산할 때 쓰는 구조화된 신호다.
// 근거: docs/기능설계서.md §3, plan "P0"

export type Category = "medication" | "meal" | "outing" | "mood" | "condition" | "other";
export type Severity = "ok" | "warn" | "danger";

export interface GeneratedOption {
  text: string;
  severity: Severity;
}

export interface GeneratedQuestion {
  question: string;
  category: Category;
  options: GeneratedOption[];
}

const CATEGORIES: Category[] = ["medication", "meal", "outing", "mood", "condition", "other"];
const SEVERITIES: Severity[] = ["ok", "warn", "danger"];

// 각 항목마다 여러 표현을 준비해두고 매일 다른 문항이 나오도록 로테이션한다.
// 근거: 팀원 피드백 — "고정 문항이 매일 똑같이 나온다, 질문을 늘리고 자동 로테이션 되면 좋겠다"
const COMMON_FALLBACK_VARIANTS: Record<"medication" | "meal" | "outing", GeneratedQuestion[]> = {
  medication: [
    {
      question: "약 드셨어요?",
      category: "medication",
      options: [
        { text: "네, 먹었어요", severity: "ok" },
        { text: "아직이에요", severity: "warn" },
      ],
    },
    {
      question: "오늘 약은 챙겨 드셨어요?",
      category: "medication",
      options: [
        { text: "네, 챙겼어요", severity: "ok" },
        { text: "깜빡했어요", severity: "warn" },
      ],
    },
    {
      question: "아침 약 드시는 거 잊지 않으셨어요?",
      category: "medication",
      options: [
        { text: "네, 잘 먹었어요", severity: "ok" },
        { text: "아직 안 먹었어요", severity: "warn" },
      ],
    },
  ],
  meal: [
    {
      question: "식사하셨어요?",
      category: "meal",
      options: [
        { text: "네, 먹었어요", severity: "ok" },
        { text: "아직이에요", severity: "warn" },
      ],
    },
    {
      question: "오늘 끼니는 잘 챙기셨어요?",
      category: "meal",
      options: [
        { text: "네, 챙겼어요", severity: "ok" },
        { text: "거의 못 먹었어요", severity: "warn" },
      ],
    },
    {
      question: "밥은 맛있게 드셨어요?",
      category: "meal",
      options: [
        { text: "네, 잘 먹었어요", severity: "ok" },
        { text: "입맛이 없었어요", severity: "warn" },
      ],
    },
  ],
  outing: [
    {
      question: "오늘 밖에 나가셨어요?",
      category: "outing",
      options: [
        { text: "네, 나갔어요", severity: "ok" },
        { text: "아직 안 나갔어요", severity: "warn" },
      ],
    },
    {
      question: "오늘 바깥바람 좀 쐬셨어요?",
      category: "outing",
      options: [
        { text: "네, 쐬었어요", severity: "ok" },
        { text: "집에만 있었어요", severity: "warn" },
      ],
    },
    {
      question: "잠깐이라도 산책하셨어요?",
      category: "outing",
      options: [
        { text: "네, 했어요", severity: "ok" },
        { text: "안 했어요", severity: "warn" },
      ],
    },
  ],
};

const CONDITION_FALLBACK_VARIANTS: Record<string, GeneratedQuestion[]> = {
  htn: [
    {
      question: "머리 아프거나 어지럽지 않으세요?",
      category: "condition",
      options: [
        { text: "괜찮아요", severity: "ok" },
        { text: "조금 그래요", severity: "warn" },
        { text: "많이 그래요", severity: "danger" },
      ],
    },
    {
      question: "오늘 혈압 때문에 힘든 건 없으셨어요?",
      category: "condition",
      options: [
        { text: "괜찮아요", severity: "ok" },
        { text: "조금 어지러웠어요", severity: "warn" },
        { text: "많이 힘들었어요", severity: "danger" },
      ],
    },
  ],
  diabetes: [
    {
      question: "손발이 저리지 않으세요?",
      category: "condition",
      options: [
        { text: "괜찮아요", severity: "ok" },
        { text: "조금 그래요", severity: "warn" },
        { text: "많이 그래요", severity: "danger" },
      ],
    },
    {
      question: "오늘 어지럽거나 기운 없지 않으셨어요?",
      category: "condition",
      options: [
        { text: "괜찮아요", severity: "ok" },
        { text: "조금 그랬어요", severity: "warn" },
        { text: "많이 그랬어요", severity: "danger" },
      ],
    },
  ],
  heart: [
    {
      question: "가슴이 답답하거나 두근거리지 않으세요?",
      category: "condition",
      options: [
        { text: "괜찮아요", severity: "ok" },
        { text: "조금 그래요", severity: "warn" },
        { text: "많이 그래요", severity: "danger" },
      ],
    },
    {
      question: "오늘 숨이 차거나 가슴이 불편하지 않으셨어요?",
      category: "condition",
      options: [
        { text: "괜찮아요", severity: "ok" },
        { text: "조금 그랬어요", severity: "warn" },
        { text: "많이 그랬어요", severity: "danger" },
      ],
    },
  ],
  stroke: [
    {
      question: "손발에 힘이 빠지는 느낌 없으세요?",
      category: "condition",
      options: [
        { text: "없어요", severity: "ok" },
        { text: "조금 있어요", severity: "warn" },
        { text: "많이 있어요", severity: "danger" },
      ],
    },
    {
      question: "말이 어눌해지거나 한쪽이 저리지 않으셨어요?",
      category: "condition",
      options: [
        { text: "없어요", severity: "ok" },
        { text: "조금 있어요", severity: "warn" },
        { text: "많이 있어요", severity: "danger" },
      ],
    },
  ],
  parkinsons: [
    {
      question: "몸이 떨리거나 움직임이 둔하지 않으세요?",
      category: "condition",
      options: [
        { text: "괜찮아요", severity: "ok" },
        { text: "조금 그래요", severity: "warn" },
        { text: "많이 그래요", severity: "danger" },
      ],
    },
    {
      question: "오늘 걷거나 움직이는 게 힘들지 않으셨어요?",
      category: "condition",
      options: [
        { text: "괜찮아요", severity: "ok" },
        { text: "조금 힘들었어요", severity: "warn" },
        { text: "많이 힘들었어요", severity: "danger" },
      ],
    },
  ],
  depression: [
    {
      question: "오늘 기분은 어떠세요?",
      category: "mood",
      options: [
        { text: "좋아요", severity: "ok" },
        { text: "보통이에요", severity: "warn" },
        { text: "안 좋아요", severity: "danger" },
      ],
    },
    {
      question: "오늘 마음은 편안하셨어요?",
      category: "mood",
      options: [
        { text: "네, 편안했어요", severity: "ok" },
        { text: "그저 그랬어요", severity: "warn" },
        { text: "마음이 힘들었어요", severity: "danger" },
      ],
    },
  ],
  arthritis: [
    {
      question: "무릎이 많이 아프지 않으세요?",
      category: "condition",
      options: [
        { text: "괜찮아요", severity: "ok" },
        { text: "조금 아파요", severity: "warn" },
        { text: "많이 아파요", severity: "danger" },
      ],
    },
    {
      question: "오늘 관절 때문에 움직이기 불편하지 않으셨어요?",
      category: "condition",
      options: [
        { text: "괜찮아요", severity: "ok" },
        { text: "조금 불편했어요", severity: "warn" },
        { text: "많이 불편했어요", severity: "danger" },
      ],
    },
  ],
  copd: [
    {
      question: "숨쉬기 힘들거나 기침이 심하지 않으세요?",
      category: "condition",
      options: [
        { text: "괜찮아요", severity: "ok" },
        { text: "조금 그래요", severity: "warn" },
        { text: "많이 그래요", severity: "danger" },
      ],
    },
    {
      question: "오늘 숨이 차서 힘들지 않으셨어요?",
      category: "condition",
      options: [
        { text: "괜찮아요", severity: "ok" },
        { text: "조금 그랬어요", severity: "warn" },
        { text: "많이 그랬어요", severity: "danger" },
      ],
    },
  ],
};

// 최근 사용한 질문은 피하고, 그래도 겹치면 날짜 기준으로 다른 표현이 나오도록 순환시킨다.
function pickVariant(variants: GeneratedQuestion[], recentQuestions: string[]): GeneratedQuestion {
  const fresh = variants.filter((v) => !recentQuestions.includes(v.question));
  const pool = fresh.length > 0 ? fresh : variants;
  const dayIndex = Math.floor(Date.now() / 86400000);
  return pool[dayIndex % pool.length];
}

export function fallbackQuestions(conditions: string[], recentQuestions: string[]): GeneratedQuestion[] {
  const common = (["medication", "meal", "outing"] as const).map((cat) =>
    pickVariant(COMMON_FALLBACK_VARIANTS[cat], recentQuestions)
  );
  const extra = conditions
    .map((c) => CONDITION_FALLBACK_VARIANTS[c])
    .filter((variants): variants is GeneratedQuestion[] => Boolean(variants))
    .map((variants) => pickVariant(variants, recentQuestions));
  return [...common, ...extra];
}

export function buildPrompt(conditions: string[], recentQuestions: string[]): string {
  return `당신은 독거 어르신에게 매일 안부를 묻는 다정한 도우미입니다.
이 어르신이 앓고 있는 지병: ${conditions.length ? conditions.join(", ") : "없음"}

오늘의 안부 질문을 6~8개 만들어주세요. 규칙:
1. 복약 여부(category="medication"), 식사 여부(category="meal"), 외출 여부(category="outing")는 반드시 각각 1개씩 포함(표현은 매일 다르게).
2. 지병이 있다면 각 지병에 맞는 질문을 최소 1개씩 포함(category="condition", 우울증 관련이면 category="mood").
3. 짧고 다정한 존댓말, 어르신이 부담 없이 답할 수 있는 문장.
4. 질문마다 상황에 맞는 답변 선택지 2~3개를 제공하세요. 모든 질문에 "네/아니요"만 쓰지 말고, 질문 성격에 맞게 다르게 만드세요 (예: 기분을 묻는 질문이면 "좋아요/보통이에요/안 좋아요"처럼).
5. 각 선택지에는 severity를 반드시 붙이세요: 정상/걱정없음="ok", 경미한 우려="warn", 심각한 우려="danger". 각 질문의 선택지 중 최소 하나는 "ok"여야 합니다.
6. category는 반드시 "medication"/"meal"/"outing"/"mood"/"condition"/"other" 중 하나만 쓰세요.
7. 아래는 최근에 이미 사용한 질문입니다. 같은 표현을 반복하지 말고 새롭게 작성하세요: ${recentQuestions.length ? recentQuestions.join(" / ") : "(없음)"}

반드시 아래 JSON 배열 형식으로만, 다른 설명 없이 답하세요:
[{"question": "질문 텍스트", "category": "medication", "options": [{"text": "선택지1", "severity": "ok"}, {"text": "선택지2", "severity": "warn"}]}]`;
}

function isValidOption(item: unknown): item is GeneratedOption {
  return (
    Boolean(item) &&
    typeof item === "object" &&
    typeof (item as GeneratedOption).text === "string" &&
    SEVERITIES.includes((item as GeneratedOption).severity)
  );
}

export function normalize(parsed: unknown): GeneratedQuestion[] {
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((item): item is GeneratedQuestion => {
      if (!item || typeof item !== "object") return false;
      const q = item as GeneratedQuestion;
      return (
        typeof q.question === "string" &&
        CATEGORIES.includes(q.category) &&
        Array.isArray(q.options) &&
        q.options.length >= 2 &&
        q.options.every(isValidOption)
      );
    })
    .slice(0, 8);
}


// Gemini 호출 한 번. 실패는 던진다 — 재시도 판단은 바깥에서 한다.
async function requestQuestions(
  geminiKey: string,
  conditions: string[],
  recentQuestions: string[]
): Promise<GeneratedQuestion[]> {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(conditions, recentQuestions) }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );
  const json = await resp.json();
  if (!resp.ok || json?.error) {
    // 상태 코드를 반드시 메시지에 남긴다 — lib/retry.ts의 isTransient가 429/5xx를 이걸로 알아본다.
    // 예전에는 Gemini가 준 문장만 넣었는데, 한도 초과 메시지 표현이 바뀌면 재시도 판단이 빗나간다.
    throw new Error(`gemini ${resp.status}: ${json?.error?.message ?? "request failed"}`);
  }
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  // responseMimeType을 지정해도 가끔 ```json ... ``` 코드블록으로 감싸서 응답하는 경우가 있어 방어적으로 벗겨낸다
  const unfenced = text.replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, "$1");
  const questions = normalize(JSON.parse(unfenced));
  if (questions.length === 0) throw new Error("empty generation result");
  return questions;
}

// Gemini로 질문을 만들고, 실패하거나 결과가 규칙에 맞지 않으면 고정 문항으로 떨어진다.
// 호출하는 쪽에서 예외를 처리하지 않아도 되도록 여기서 삼킨다 — 질문이 없으면 안부 자체를
// 물을 수 없으므로, 어떤 경우에도 문항 배열은 나와야 한다.
//
// 재시도를 붙인 이유: 실측으로 생성의 61%가 고정 문항으로 떨어지고 있었다(10/28~11/11,
// daily_prompt 86건/140건). 새벽 크론이 여러 어르신을 한꺼번에 처리하면서 분당 한도에
// 걸린 것으로 보이는데, 한 번 거절당하면 그대로 포기하고 있었다.
// 고정 문항은 약·식사·외출 3개를 3일 주기로 돌릴 뿐이라, 어르신께는 "매일 똑같은 질문"이
// 된다 — 실사용 피드백에 그대로 적힌 말이다.
// analyze-voice.ts는 같은 이유로 이미 retryTransient를 쓰고 있었다. 여기만 빠져 있었다.
//
// attempts를 부르는 쪽이 정하는 이유: 이 함수는 두 곳에서 쓰이는데 사정이 정반대다.
// 새벽 크론은 기다리는 사람이 없으니 다시 시도하는 게 이득이다. 반대로 어르신이 화면을
// 열었을 때(api/generate-questions.ts)는 그 앞에서 사람이 기다리고 있고, 화면에 8초
// 상한이 걸려 있다(screens/eCheck.tsx). 거기서 재시도로 시간을 끌면 상한에 걸려 질문이
// 1개로 떨어진다 — 고정 문항 3개보다 나쁘다. 그래서 기본값은 "한 번만"이다.
export async function generateQuestions(
  geminiKey: string | undefined,
  conditions: string[],
  recentQuestions: string[],
  options: { attempts?: number } = {}
): Promise<{ questions: GeneratedQuestion[]; source: "gemini" | "fallback" }> {
  if (!geminiKey) {
    return { questions: fallbackQuestions(conditions, recentQuestions), source: "fallback" };
  }
  try {
    const questions = await retryTransient(() => requestQuestions(geminiKey, conditions, recentQuestions), {
      attempts: options.attempts ?? 1,
      baseDelayMs: 600,
      onRetry: (attempt, err) =>
        console.error("generateQuestions: retrying", attempt, err instanceof Error ? err.message : err),
    });
    return { questions, source: "gemini" };
  } catch (err) {
    console.error("generateQuestions: falling back", err instanceof Error ? err.message : err);
    return { questions: fallbackQuestions(conditions, recentQuestions), source: "fallback" };
  }
}
