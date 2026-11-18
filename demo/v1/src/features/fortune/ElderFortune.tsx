import { useEffect, useRef, useState } from "react";
import { SpeakButton } from "../../components/SpeakButton";
import { todaySeoul } from "../../lib/date";
import { dayAnimal, withSubject } from "./animal";
import { birthFromSolarDate, getFortune } from "./saju";

// 어르신 화면의 "오늘의 운세" 카드. 안부를 마친 뒤에 보여 준다(완료 화면, 이미 마친 날의 처음 화면).
//
// 왜 넣었나: 2회차 기술 멘토링(2026-11-12)에서 "매일 열 이유가 될 재미 요소 하나"가 과제로
// 나왔다. 안부를 마치면 열리게 해서, 운세를 보러 들어온 김에 안부도 남기게 한다.
//
// 처음 버전은 글만 세 줄 나와서 밋밋했다(2026-11-18 피드백). 그래서
//  - 그날의 띠 동물(일진의 지지)이 복주머니를 들고 온다. 날마다 동물이 바뀐다.
//  - 복주머니를 눌러야 열린다. 흔들리다 열리며 운세 쪽지 세 장이 차례로 나온다.
//  - 한 번 연 날은 다시 들어와도 열린 채로 보여 준다(이 기기 기준).
//  - 움직임 줄이기 설정을 켠 분께는 애니메이션 없이 바로 펼친다(CSS에서 처리).
//
// 만세력 라이브러리(lunar-javascript)가 커서 이 파일은 화면에서 React.lazy로 불러온다.
// 생일은 보호자가 어르신 정보에 적은 값(양력)을 쓴다. 없으면 닫힌 복주머니와 등록 안내를 보여 준다.

const SECTIONS = [
  { key: "general", icon: "☀️", title: "오늘의 운세" },
  { key: "love", icon: "💞", title: "가족·친구운" },
  { key: "health", icon: "🌿", title: "건강운" },
] as const;

const OPENED_KEY = "callog.fortuneOpenedOn";

function openedToday(today: string): boolean {
  try {
    return window.localStorage.getItem(OPENED_KEY) === today;
  } catch {
    return false;
  }
}

function rememberOpened(today: string) {
  try {
    window.localStorage.setItem(OPENED_KEY, today);
  } catch {
    // 저장이 안 되면 다음에 한 번 더 열면 된다
  }
}

export default function ElderFortune({ birthDate }: { birthDate: string | null }) {
  const today = todaySeoul();
  const animal = dayAnimal(today) ?? { name: "복돼지", emoji: "🐷" };
  const birth = birthFromSolarDate(birthDate);
  const fortune = birth ? getFortune(birth, today) : null;

  // closed → opening(흔들림) → open
  const [stage, setStage] = useState<"closed" | "opening" | "open">(() => (fortune && openedToday(today) ? "open" : "closed"));
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function open() {
    if (!fortune || stage !== "closed") return;
    try {
      navigator.vibrate?.(30);
    } catch {
      // 진동을 못 하는 기기
    }
    rememberOpened(today);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setStage("open");
      return;
    }
    setStage("opening");
    timer.current = window.setTimeout(() => setStage("open"), 650);
  }

  const who = withSubject(animal.name);

  if (stage === "open" && fortune) {
    const spoken = SECTIONS.map((s) => `${s.title}. ${fortune.texts[s.key]}`).join(" ");
    return (
      <section className="e-card e-fortune e-fortune--open" aria-live="polite">
        <div className="e-fortune-opened">
          <span className="e-fortune-animal e-fortune-animal--small" aria-hidden="true">
            {animal.emoji}
          </span>
          <div>
            <h2 className="e-fortune-title">{animal.name}의 복주머니가 열렸어요</h2>
            <p className="e-meta">
              타고난 기운은 {fortune.saju.dayMaster}({fortune.saju.dayMasterPlain}), 오늘은 {fortune.todayGanZhi}일
            </p>
          </div>
        </div>
        {SECTIONS.map((s, i) => (
          <div key={s.key} className="e-fortune-slip" style={{ animationDelay: `${i * 140}ms` }}>
            <div className="e-fortune-head">
              {s.icon} {s.title}
            </div>
            <p className="e-fortune-text">{fortune.texts[s.key]}</p>
          </div>
        ))}
        <SpeakButton text={spoken} />
        <p className="e-fortune-note">재미로 봐 주세요.</p>
      </section>
    );
  }

  return (
    <section className="e-card e-fortune">
      <h2 className="e-fortune-title">
        오늘은 {who} 복주머니를 가져왔어요
      </h2>
      <button
        type="button"
        className={`e-fortune-stage${stage === "opening" ? " is-opening" : ""}`}
        onClick={open}
        disabled={!fortune}
        aria-label={fortune ? `${animal.name}의 복주머니 열기` : `${animal.name}의 복주머니`}
      >
        <span className="e-fortune-animal" aria-hidden="true">
          {animal.emoji}
        </span>
        <Pouch />
        <span className="e-fortune-sparkle" aria-hidden="true" />
      </button>
      <p className="e-fortune-hint">
        {fortune ? "복주머니를 눌러 오늘의 운세를 열어 보세요" : "가족이 생신을 등록하면 복주머니를 열 수 있어요"}
      </p>
    </section>
  );
}

// 복주머니 — 붉은 비단 주머니, 금빛 매듭과 福 자. 색은 고정(밝은·어두운 화면 모두에서 같은 주머니).
function Pouch() {
  return (
    <svg className="e-fortune-pouch" viewBox="0 0 120 132" aria-hidden="true">
      {/* 오므린 윗부분 */}
      <path d="M30 22 Q60 40 90 22 L82 56 Q60 63 38 56 Z" fill="#9E1F2B" />
      <path d="M30 22 Q44 30 52 26 L48 55 Q42 55 38 56 Z" fill="#B8323C" opacity="0.7" />
      {/* 몸통 */}
      <path d="M36 58 C10 84 18 126 60 126 C102 126 110 84 84 58 Z" fill="#C0303A" />
      <path d="M40 64 C24 84 28 110 46 118 C36 104 36 84 48 66 Z" fill="#D9545C" opacity="0.55" />
      {/* 매듭 끈 */}
      <rect x="34" y="52" width="52" height="9" rx="4.5" fill="#E2B13C" />
      <path d="M58 60 C50 74 44 80 40 92" stroke="#E2B13C" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M62 60 C70 74 76 80 80 92" stroke="#E2B13C" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="40" cy="94" r="3.5" fill="#E2B13C" />
      <circle cx="80" cy="94" r="3.5" fill="#E2B13C" />
      {/* 福 */}
      <circle cx="60" cy="98" r="15" fill="#E2B13C" />
      <text x="60" y="104" textAnchor="middle" fontSize="17" fontWeight="800" fill="#9E1F2B">
        福
      </text>
    </svg>
  );
}
