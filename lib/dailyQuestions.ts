import {
  COMMON_ITEMS,
  CONDITION_ITEMS,
  ROTATING_ITEMS,
  type BankItem,
  type Category,
  type QuestionOption,
} from "./questionBank";

// 오늘의 안부 질문을 고른다 — 질문 표(lib/questionBank.ts)에서, AI 없이, 코드가.
//
// 구성: 공통 질문 전부 + 돌아가는 질문 하나 + 등록된 지병마다 하나(최대 MAX_CONDITION_QUESTIONS).
// 같은 어르신은 지병이 바뀌지 않는 한 매일 같은 개수를 받는다. 예전에는 AI가 만들어서
// 3~8개 사이를 오갔고, 어르신은 오늘이 30초짜리인지 2분짜리인지 열어봐야 알았다.
//
// 날짜와 어르신 ID만으로 결과가 정해진다(무작위·현재 시각을 쓰지 않는다). 그래서
//  - 새벽 크론, 즉석 API, 화면이 각자 골라도 같은 질문이 나온다.
//  - 어르신이 기다리는 동안 AI를 부를 일이 없다. 예전에는 즉석 생성이 8초를 넘기면
//    화면이 질문 1개짜리 비상 문항으로 떨어졌다(2026-11-11 신규 4명 중 2명).
//  - 화면이 서버에 닿지 못해도 같은 표에서 직접 고를 수 있다.
//
// 서버(api/, lib/)와 화면(demo/v1/src)이 같이 쓰므로 다른 모듈을 가져오지 않는다.
//
// 말투를 AI로 더 다양하게 하고 싶어지면 새벽 크론에서, 여기서 고른 결과를 받아 문장만
// 바꾸는 단계로 얹는다(lib/prepareDailyPrompts.ts). 개수가 달라지거나 실패하면 여기서 고른
// 문장을 그대로 쓰면 된다. 어르신이 기다리는 경로(즉석 API·화면)에는 넣지 않는다.

export interface DailyQuestion {
  /** 질문 표의 항목 id. AI가 만들던 시절에 저장된 질문에는 없다 */
  id?: string;
  question: string;
  category: Category;
  options: QuestionOption[];
}

/** 하루에 묻는 지병 질문의 상한. 지병이 더 많으면 날마다 돌아가며 묻는다 */
export const MAX_CONDITION_QUESTIONS = 4;
/** 하루 질문 수의 상한 — 공통 + 돌아가는 질문 1 + 지병 질문 상한 */
export const MAX_QUESTIONS = COMMON_ITEMS.length + 1 + MAX_CONDITION_QUESTIONS;

// 날짜 문자열(YYYY-MM-DD)에서 "며칠째인지"를 뽑는다. 문자열만 쓰므로 서버·기기의 시간대와
// 무관하게 같은 날이면 같은 값이다.
function dayNumber(date: string): number {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed)) return 0;
  return Math.floor(parsed / 86_400_000);
}

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

function pick<T>(list: T[], n: number): T {
  return list[((n % list.length) + list.length) % list.length];
}

// 씨앗이 같으면 늘 같은 순서로 섞는다
function shuffled<T>(list: T[], seed: number): T[] {
  const out = list.slice();
  let s = seed >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = Math.floor((s / 4294967296) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function render(item: BankItem, n: number): DailyQuestion {
  const variant = pick(item.variants, n);
  return { id: item.id, question: variant.question, category: item.category, options: variant.options };
}

// 등록된 지병 가운데 질문이 있는 것. 표에 적힌 순서를 따르므로 등록 순서와 무관하게 같다.
function conditionItemsFor(conditions: string[]) {
  const mine = new Set(conditions);
  return CONDITION_ITEMS.filter((item) => mine.has(item.condition));
}

function rotatingPoolFor(conditions: string[]) {
  const mine = new Set(conditions);
  return ROTATING_ITEMS.filter((item) => !(item.skipWith ?? []).some((c) => mine.has(c)));
}

/** 등록된 지병 가운데 맞춤 질문이 있는 것의 수(상한을 적용하기 전) */
export function conditionQuestionCount(conditions: string[]): number {
  return conditionItemsFor(conditions).length;
}

/** 이 어르신이 매일 받는 질문 수 */
export function expectedQuestionCount(conditions: string[]): number {
  return COMMON_ITEMS.length + 1 + Math.min(conditionQuestionCount(conditions), MAX_CONDITION_QUESTIONS);
}

/** 등록된 지병 가운데 아직 맞춤 질문이 없는 것 */
export function conditionsWithoutQuestion(conditions: string[]): string[] {
  const covered = new Set(CONDITION_ITEMS.map((item) => item.condition));
  return conditions.filter((c) => !covered.has(c));
}

/**
 * 그날 그 어르신께 드릴 질문.
 * @param conditions 등록된 지병(elder_condition.condition_type)
 * @param date 한국 날짜 YYYY-MM-DD
 * @param elderId 어르신마다 표현과 순서가 어긋나게 하는 씨앗. 비어 있어도 동작한다
 */
export function selectDailyQuestions(conditions: string[], date: string, elderId: string): DailyQuestion[] {
  const day = dayNumber(date);
  const seed = hash(elderId);
  const out: DailyQuestion[] = [];

  // 1. 공통 — 주제는 그대로, 표현만 하루에 한 칸씩 넘긴다(표현이 n개면 n일 주기)
  for (const item of COMMON_ITEMS) out.push(render(item, day + seed + hash(item.id)));

  // 2. 돌아가는 질문 — 주제를 하루에 하나씩 넘기고, 한 바퀴 돌 때마다 표현도 넘긴다
  const pool = rotatingPoolFor(conditions);
  const slot = day + seed;
  out.push(render(pick(pool, slot), Math.floor(slot / pool.length)));

  // 3. 지병 — 상한을 넘으면 시작점을 하루씩 밀어 모든 지병이 돌아가며 나오게 한다
  const mine = conditionItemsFor(conditions);
  const asked =
    mine.length <= MAX_CONDITION_QUESTIONS
      ? mine
      : Array.from({ length: MAX_CONDITION_QUESTIONS }, (_, i) => pick(mine, day + i));
  for (const item of asked) out.push(render(item, day + seed + hash(item.id)));

  return shuffled(out, Math.imul(day, 2654435761) + seed);
}

/**
 * 보호자에게 보여주는 미리보기 — 어떤 질문이 나가는지 대표 표현으로 적는다.
 * 돌아가는 질문은 날마다 달라서 한 줄 설명으로 대신한다.
 */
export function previewQuestions(conditions: string[]): string[] {
  return [
    ...COMMON_ITEMS.map((item) => item.variants[0].question),
    "날마다 바뀌는 질문 하나 (잠, 기분, 몸 상태, 물, 대화, 기운)",
    ...conditionItemsFor(conditions)
      .slice(0, MAX_CONDITION_QUESTIONS)
      .map((item) => item.variants[0].question),
  ];
}

function isUsable(item: unknown): item is DailyQuestion {
  if (!item || typeof item !== "object") return false;
  const q = item as DailyQuestion;
  return (
    typeof q.question === "string" &&
    q.question.length > 0 &&
    Array.isArray(q.options) &&
    q.options.length >= 2 &&
    q.options.every((o) => o && typeof o.text === "string" && typeof o.severity === "string")
  );
}

/**
 * 저장돼 있거나 서버에서 받은 질문을 화면에 올려도 되는지 본다. 쓸 수 없으면 null —
 * 부르는 쪽이 selectDailyQuestions로 직접 고른다.
 * 모양이 깨진 항목은 버리고, 상한을 넘으면 앞에서부터 자른다.
 */
export function usableQuestions(raw: unknown): DailyQuestion[] | null {
  if (!Array.isArray(raw)) return null;
  const ok = raw.filter(isUsable);
  return ok.length > 0 ? ok.slice(0, MAX_QUESTIONS) : null;
}
