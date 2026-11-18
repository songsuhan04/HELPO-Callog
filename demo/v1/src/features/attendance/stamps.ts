import { dayAnimal } from "../fortune/animal";

// 출석도장 — 안부를 마친 날마다 도장 하나. 7개를 모으면 달토끼가 소원 복주머니를 가져온다.
//
// 근거: 사업 멘토링(2026-11-18) "출석도장을 KPI로 삼아 다시 테스트하고, 출석도장으로 캐시백·
// 쿠폰·리워드를 수익 모델로". 체험(10/28~11/11)에서 안부를 남긴 16명 중 11명이 하루만 썼다
// — 계속 올 이유가 없었다.
//
// 연속 출석이 아니라 "모으기"다(카페 도장판처럼). 하루 빠졌다고 모은 도장이 사라지면
// 어르신이 실망해서 그만두기 쉽다. 연속 일수는 따로 보여 준다.
//
// 도장은 DB에 따로 저장하지 않는다. 안부를 실제로 답한 날(daily_checkin, 답변 있음)을 세면
// 그게 곧 도장이다. 그래서 지난 기록도 그대로 도장이 된다.

export const CARD_SIZE = 7;

export interface Stamp {
  date: string;
  emoji: string; // 그날의 띠 동물 — 도장 안에 찍힌다
}

export interface StampSummary {
  total: number; // 지금까지 찍은 도장 수
  cardsDone: number; // 다 채운 도장판 수
  stamps: Stamp[]; // 지금 도장판에 찍힌 도장(오래된 것부터)
  todayStamped: boolean;
  completedToday: boolean; // 오늘 찍은 도장으로 도장판을 다 채웠다 → 소원 복주머니
  remaining: number; // 이번 도장판을 채우기까지 남은 도장
}

export function summarizeStamps(answeredDates: Iterable<string>, today: string): StampSummary {
  const dates = [...new Set(answeredDates)].filter((d) => d <= today).sort();
  const total = dates.length;
  const todayStamped = dates.includes(today);
  const completedToday = todayStamped && total > 0 && total % CARD_SIZE === 0;
  // 다 채운 도장판은 그날만 꽉 찬 채로 보여 주고, 다음 날부터는 새 도장판이다
  const filled = completedToday ? CARD_SIZE : total % CARD_SIZE;
  const stamps = dates.slice(total - filled).map((date) => ({ date, emoji: dayAnimal(date)?.emoji ?? "🐾" }));
  return {
    total,
    cardsDone: Math.floor(total / CARD_SIZE),
    stamps,
    todayStamped,
    completedToday,
    remaining: CARD_SIZE - filled,
  };
}

// 달토끼의 소원 덕담. 도장판을 채울 때마다 다음 문장으로 넘어간다.
// 사실처럼 들리는 약속(병이 낫는다, 돈이 들어온다)은 넣지 않는다.
export const WISHES = [
  "달토끼가 어르신 소원을 달에 적어 두었어요. 이번 주에 한 걸음 가까워져요.",
  "일주일을 꼬박 채우신 것, 그게 가장 큰 복이에요.",
  "작은 소원 하나를 가족에게 말해 보세요. 들어줄 거예요.",
  "이번 주에는 웃을 일이 더 많아져요.",
  "반가운 사람에게서 연락이 올 거예요.",
  "마음먹은 일이 술술 풀리는 한 주예요.",
  "오래 기다린 일이 좋게 마무리돼요.",
  "한 주 동안 잘 챙기신 몸이 더 가벼워져요.",
  "새로 시작하는 일에 운이 따라요.",
  "마음이 편안한 날이 이어져요.",
  "보고 싶은 얼굴을 곧 보게 될 거예요.",
  "좋은 소식이 문을 두드릴 거예요.",
];

export function wishFor(cardsDone: number): string {
  return WISHES[(Math.max(cardsDone, 1) - 1) % WISHES.length];
}
