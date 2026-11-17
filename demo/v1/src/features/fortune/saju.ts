// 오늘의 운세 계산 — 팀 자료 fortune-for-kollok(2026-11-17)에서 옮겼다.
// 생일과 오늘 날짜만으로 브라우저에서 계산한다. 서버·API 키·외부 호출이 없다.
//
// 콜록에 옮기며 바꾼 것:
//  - 생일을 휴대폰(localStorage)에 저장하던 부분을 뺐다. 생일은 보호자가 어르신 정보에 적고
//    (elder_profile.birth_date, 양력), 어르신 화면은 그것을 읽기만 한다. 어르신이 숫자를
//    입력하지 않아도 되고, 카카오톡 브라우저와 홈 화면 앱이 저장 공간을 따로 써서 다시
//    입력해야 하는 일도 없다.
//  - 오늘 날짜를 기기 시계(new Date) 대신 서울 기준 "YYYY-MM-DD"로 받는다. 안부 기록과 같은
//    날짜를 쓰기 위해서다.
import { Lunar, Solar } from "lunar-javascript";
import { FORTUNE_TEXTS, type FortuneCategory, type TenGodGroup } from "./fortune-texts";

export type BirthInfo = {
  calendar: "solar" | "lunar";
  leap: boolean; // 음력 윤달 여부
  year: number;
  month: number;
  day: number;
  hour: number | null; // 0~23, 모르면 null
};

const GAN = "甲乙丙丁戊己庚辛壬癸";
const GAN_KO = "갑을병정무기경신임계";
const ZHI = "子丑寅卯辰巳午未申酉戌亥";
const ZHI_KO = "자축인묘진사오미신유술해";
const ELEMENT_KO = ["목", "화", "토", "금", "수"];
const ELEMENT_PLAIN = ["나무", "불", "흙", "쇠", "물"];

// 甲子 -> 갑자
export function toKorean(ganZhi: string): string {
  return [...ganZhi]
    .map((ch) => {
      const g = GAN.indexOf(ch);
      if (g >= 0) return GAN_KO[g];
      const z = ZHI.indexOf(ch);
      return z >= 0 ? ZHI_KO[z] : ch;
    })
    .join("");
}

// 입력한 생일을 양력으로 바꾼다. 없는 날짜(음력 2월 30일, 윤달 없는 해 등)는 null.
export function toSolar(b: BirthInfo): Solar | null {
  try {
    if (b.calendar === "solar") {
      // Solar.fromYmd는 2월 30일도 그대로 받아 주므로 Date로 검증
      const dt = new Date(b.year, b.month - 1, b.day);
      const ok = dt.getFullYear() === b.year && dt.getMonth() === b.month - 1 && dt.getDate() === b.day;
      return ok ? Solar.fromYmd(b.year, b.month, b.day) : null;
    }
    const m = b.leap ? -b.month : b.month;
    const l = Lunar.fromYmd(b.year, m, b.day);
    // 라이브러리가 넘치는 날짜를 다음 달로 넘기므로 왕복 비교로 검증
    const back = l.getSolar().getLunar();
    return back.getYear() === b.year && back.getMonth() === m && back.getDay() === b.day ? l.getSolar() : null;
  } catch {
    return null;
  }
}

const TEN_GODS: [TenGodGroup, string, string][] = [
  ["bigeop", "비견", "겁재"],
  ["siksang", "식신", "상관"],
  ["jaeseong", "편재", "정재"],
  ["gwanseong", "편관", "정관"],
  ["inseong", "편인", "정인"],
];

export const GROUP_LABEL: Record<TenGodGroup, string> = {
  bigeop: "사람과 어울리는 기운",
  siksang: "즐거움과 표현의 기운",
  jaeseong: "재물과 살림의 기운",
  gwanseong: "책임과 규칙의 기운",
  inseong: "도움과 쉼의 기운",
};

// 일간(me)과 오늘 천간(other)의 관계로 십신을 구한다.
// 천간 순서 갑을병정무기경신임계 = 목목화화토토금금수수, 짝수 인덱스가 양.
export function tenGod(me: string, other: string) {
  const i = GAN.indexOf(me);
  const j = GAN.indexOf(other);
  const rel = (Math.floor(j / 2) - Math.floor(i / 2) + 5) % 5; // 0 같음, 1 내가 생함, 2 내가 극함, 3 나를 극함, 4 나를 생함
  const samePolarity = i % 2 === j % 2;
  const [group, yangName, yinName] = TEN_GODS[rel];
  return { group, name: samePolarity ? yangName : yinName, member: samePolarity ? 0 : 1 };
}

export type Saju = {
  pillars: { label: string; value: string }[];
  dayMaster: string; // 예: 경금
  dayMasterPlain: string; // 예: 쇠
  dayGan: string; // 한자, 계산용
};

export function getSaju(b: BirthInfo): Saju | null {
  const s = toSolar(b);
  if (!s) return null;
  const ec = Solar.fromYmdHms(s.getYear(), s.getMonth(), s.getDay(), b.hour ?? 12, 0, 0).getLunar().getEightChar();
  const g = GAN.indexOf(ec.getDayGan());
  const pillars = [
    { label: "년주", value: toKorean(ec.getYear()) },
    { label: "월주", value: toKorean(ec.getMonth()) },
    { label: "일주", value: toKorean(ec.getDay()) },
  ];
  if (b.hour !== null) pillars.push({ label: "시주", value: toKorean(ec.getTime()) });
  return {
    pillars,
    dayMaster: GAN_KO[g] + ELEMENT_KO[Math.floor(g / 2)],
    dayMasterPlain: ELEMENT_PLAIN[Math.floor(g / 2)],
    dayGan: ec.getDayGan(),
  };
}

function hash(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

const CATEGORIES: FortuneCategory[] = ["general", "love", "health"];

// 같은 십신 그룹은 10일에 두 번 돌아온다. 그때마다 다음 문구로 넘어가므로
// 그룹당 문구가 N개면 같은 문구는 10*N/2일마다 한 번 나온다 (30개면 150일, 1년에 2~3번).
export function getFortune(b: BirthInfo, date: string) {
  const saju = getSaju(b);
  if (!saju) return null;
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return null;
  const todayGan = Solar.fromYmd(y, m, d).getLunar().getDayGan();
  const tg = tenGod(saju.dayGan, todayGan);
  const dayNumber = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  const step = Math.floor(dayNumber / 10) * 2 + tg.member;
  const seed = hash(`${b.calendar}${b.leap}${b.year}-${b.month}-${b.day}`);

  const texts = Object.fromEntries(
    CATEGORIES.map((cat, ci) => {
      const pool = FORTUNE_TEXTS[cat][tg.group];
      return [cat, pool[(step + seed + ci * 7) % pool.length]];
    }),
  ) as Record<FortuneCategory, string>;

  return { saju, tenGod: tg.name, group: tg.group, todayGanZhi: toKorean(Solar.fromYmd(y, m, d).getLunar().getDayInGanZhi()), texts };
}

/** "YYYY-MM-DD"(양력, DB의 birth_date) → BirthInfo. 태어난 시간은 받지 않는다. */
export function birthFromSolarDate(value: string | null | undefined): BirthInfo | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!m) return null;
  return { calendar: "solar", leap: false, year: Number(m[1]), month: Number(m[2]), day: Number(m[3]), hour: null };
}

/** 음력 생일 → 양력 "YYYY-MM-DD". 없는 날짜면 null. 보호자 화면에서 저장하기 전에 쓴다. */
export function lunarToSolarDate(year: number, month: number, day: number, leap: boolean): string | null {
  const s = toSolar({ calendar: "lunar", leap, year, month, day, hour: null });
  if (!s) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${s.getYear()}-${pad(s.getMonth())}-${pad(s.getDay())}`;
}
