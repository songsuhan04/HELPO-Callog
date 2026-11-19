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
import { ANIMALS, type DayAnimal } from "./animal";
import { FORTUNE_TEXTS, type FortuneCategory, type TenGodGroup } from "./fortune-texts";

export type BirthInfo = {
  calendar: "solar" | "lunar";
  leap: boolean; // 음력 윤달 여부
  year: number;
  month: number;
  day: number;
  hour: number | null; // 0~23, 모르면 null
  minute?: number; // 0~59. 시주는 2시간 단위라 분이 결과를 가를 수 있다(12:59 임오, 13:00 계미)
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

// 일간(태어난 날의 천간)별 성품 설명. 순서는 갑을병정무기경신임계. 팀 자료(2026-11-19)에서 옮겼다.
const DAY_MASTER_TEXT = [
  "갑목은 곧게 자라는 큰 나무예요. 한번 정한 일은 끝까지 밀고 나가는 힘이 있어요. 앞에 서서 사람들을 이끄는 일이 잘 맞아요.",
  "을목은 풀과 꽃처럼 부드럽게 뻗는 나무예요. 어디서든 사람들과 잘 어울리고 끈기가 있어요. 힘든 일이 와도 휘어질 뿐 쉽게 꺾이지 않아요.",
  "병화는 하늘에 뜬 해와 같아요. 밝고 시원시원해서 주변 사람에게 힘을 줘요. 마음에 담아 두기보다 바로 말하는 편이에요.",
  "정화는 촛불이나 등불 같은 불이에요. 겉으로는 조용해도 속이 따뜻하고 꼼꼼해요. 가까운 사람을 살뜰히 챙기는 편이에요.",
  "무토는 넓고 단단한 산과 들판이에요. 믿음직해서 주변 사람들이 많이 기대요. 쉽게 흔들리지 않지만 고집이 셀 때도 있어요.",
  "기토는 곡식을 키우는 논밭의 흙이에요. 차분하고 알뜰하게 살림을 꾸려요. 남을 돌보는 일에서 보람을 느끼는 편이에요.",
  "경금은 바위나 쇠처럼 단단한 기운이에요. 옳고 그름이 분명하고 의리가 있어요. 말이 곧은 만큼 가끔은 부드럽게 말하면 더 좋아요.",
  "신금은 잘 다듬은 보석 같은 기운이에요. 깔끔하고 꼼꼼해서 작은 것도 잘 챙겨요. 남의 말에 마음을 쉽게 다치기도 해요.",
  "임수는 큰 강이나 바다 같은 물이에요. 마음이 넓고 생각이 깊어요. 새로운 것을 보고 배우기를 좋아해요.",
  "계수는 비나 이슬처럼 맑은 물이에요. 눈치가 빠르고 남의 마음을 잘 알아줘요. 조용히 뒤에서 돕는 일을 잘해요.",
];

// 지지 오행: 자수 축토 인목 묘목 진토 사화 오화 미토 신금 유금 술토 해수 (0 목, 1 화, 2 토, 3 금, 4 수)
const ZHI_ELEMENT = [4, 2, 0, 0, 2, 1, 1, 2, 3, 3, 2, 4];

function elementOf(ch: string) {
  const g = GAN.indexOf(ch);
  return g >= 0 ? Math.floor(g / 2) : ZHI_ELEMENT[ZHI.indexOf(ch)];
}

// 오행 개수를 세고 한두 문장으로 풀어 준다.
function describeElements(ganZhis: string[]) {
  const counts = [0, 0, 0, 0, 0];
  for (const ch of ganZhis.join("")) counts[elementOf(ch)]++;
  const max = Math.max(...counts);
  const most = ELEMENT_PLAIN.filter((_, i) => counts[i] === max).join(", ");
  const missing = ELEMENT_PLAIN.filter((_, i) => counts[i] === 0);
  const text =
    `${most} 기운이 가장 많아요.` +
    (missing.length ? ` ${missing.join(", ")} 기운은 사주에 없어서 생활 속에서 채워 주면 좋아요.` : " 다섯 기운이 모두 들어 있어요.");
  return { counts: ELEMENT_PLAIN.map((label, i) => ({ label, count: counts[i] })), text };
}

export type Saju = {
  pillars: { label: string; value: string }[];
  dayMaster: string; // 예: 경금
  dayMasterPlain: string; // 예: 쇠
  dayMasterText: string; // 일간 성품 설명 3문장
  elements: { label: string; count: number }[]; // 나무·불·흙·쇠·물 개수 (시각이 없으면 세 기둥 기준)
  elementText: string; // 많은 기운, 없는 기운 설명
  dayGan: string; // 한자, 계산용
};

export function getSaju(b: BirthInfo): Saju | null {
  const s = toSolar(b);
  if (!s) return null;
  const ec = Solar.fromYmdHms(s.getYear(), s.getMonth(), s.getDay(), b.hour ?? 12, b.minute ?? 0, 0).getLunar().getEightChar();
  const g = GAN.indexOf(ec.getDayGan());
  const pillars = [
    { label: "년주", value: toKorean(ec.getYear()) },
    { label: "월주", value: toKorean(ec.getMonth()) },
    { label: "일주", value: toKorean(ec.getDay()) },
  ];
  const raw = [ec.getYear(), ec.getMonth(), ec.getDay()];
  if (b.hour !== null) {
    pillars.push({ label: "시주", value: toKorean(ec.getTime()) });
    raw.push(ec.getTime());
  }
  const el = describeElements(raw);
  return {
    pillars,
    dayMaster: GAN_KO[g] + ELEMENT_KO[Math.floor(g / 2)],
    dayMasterPlain: ELEMENT_PLAIN[Math.floor(g / 2)],
    dayMasterText: DAY_MASTER_TEXT[g],
    elements: el.counts,
    elementText: el.text,
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

/**
 * 태어난 해의 띠 동물 — 운세 복주머니를 열어 주는 "내 동물".
 * 기본은 설날 기준이다. 어르신들이 "나는 무슨 띠"라고 알고 계신 기준이 대개 설날이라,
 * 입춘 기준으로 다른 띠를 보여 주면 "틀렸네" 하고 믿음을 잃는다(1~2월 초 출생만 차이 남).
 * 근거: 운세 이펙트 업데이트안 v2(2026-11-19) 2장.
 */
export function birthAnimal(b: BirthInfo, basis: "seollal" | "ipchun" = "seollal"): DayAnimal | null {
  const s = toSolar(b);
  if (!s) return null;
  const l = s.getLunar();
  const zhi = basis === "ipchun" ? l.getYearZhiByLiChun() : l.getYearZhi();
  const i = ZHI.indexOf(zhi);
  return i < 0 ? null : ANIMALS[i];
}
