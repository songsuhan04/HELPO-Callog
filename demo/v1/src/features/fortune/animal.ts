// 오늘의 동물 — 그날 일진(日辰)의 지지(地支)에 해당하는 띠 동물.
// 2026-11-18은 병신(丙申)일이라 원숭이다. 12일마다 같은 동물이 돌아온다.
//
// 운세 카드의 캐릭터로 쓴다. 매일 다른 동물이 복주머니를 들고 오니 "오늘은 누가 왔나" 하고
// 열어 볼 이유가 된다.
//
// 만세력 라이브러리(lunar-javascript) 없이 날짜 계산만으로 구한다. 일진은 60일 주기로 끊김
// 없이 돌기 때문이다. 그래야 처음 화면의 "안부를 마치면 원숭이가…" 안내에 큰 라이브러리를
// 싣지 않는다. 라이브러리와 같은 값이 나오는지는 검증 스크립트로 확인했다.

export interface DayAnimal {
  name: string;
  emoji: string;
}

// 순서는 지지 순서(子丑寅卯…)와 같다 — 띠 계산(saju.ts birthAnimal)이 위치 번호를 그대로 쓴다
export const ANIMALS: DayAnimal[] = [
  { name: "쥐", emoji: "🐭" },
  { name: "소", emoji: "🐮" },
  { name: "호랑이", emoji: "🐯" },
  { name: "토끼", emoji: "🐰" },
  { name: "용", emoji: "🐲" },
  { name: "뱀", emoji: "🐍" },
  { name: "말", emoji: "🐴" },
  { name: "양", emoji: "🐑" },
  { name: "원숭이", emoji: "🐵" },
  { name: "닭", emoji: "🐔" },
  { name: "개", emoji: "🐶" },
  { name: "돼지", emoji: "🐷" },
];

// 1970-01-01은 신사(辛巳)일 — 지지 사(巳, 뱀)는 0부터 셀 때 5번째다.
const EPOCH_BRANCH = 5;

/** "YYYY-MM-DD"(서울 기준 오늘) → 그날의 띠 동물. 날짜가 깨지면 null. */
export function dayAnimal(date: string): DayAnimal | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const days = Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
  return ANIMALS[(((days + EPOCH_BRANCH) % 12) + 12) % 12];
}

/** 받침이 있으면 "이", 없으면 "가" — "원숭이가", "호랑이가", "말이" */
export function withSubject(word: string): string {
  const last = word.charCodeAt(word.length - 1) - 0xac00;
  const hasFinal = last >= 0 && last <= 11171 && last % 28 !== 0;
  return word + (hasFinal ? "이" : "가");
}
