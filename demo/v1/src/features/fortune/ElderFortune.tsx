import { useEffect, useRef, useState } from "react";
import { SpeakButton } from "../../components/SpeakButton";
import { todaySeoul } from "../../lib/date";
import { withSubject } from "./animal";
import { Crane } from "./Crane";
import { Pouch } from "./Pouch";
import { birthAnimal, birthFromSolarDate, getFortune } from "./saju";

// 어르신 화면의 "오늘의 운세" 카드. 안부를 마친 뒤에 보여 준다(완료 화면, 이미 마친 날의 처음 화면).
//
// 왜 넣었나: 2회차 기술 멘토링(2026-11-12)에서 "매일 열 이유가 될 재미 요소 하나"가 과제로
// 나왔다. 안부를 마치면 열리게 해서, 운세를 보러 들어온 김에 안부도 남기게 한다.
//
// 장면 (운세 이펙트 업데이트안 v2, 2026-11-19 — "학이 물어 오고, 내 띠 동물이 연다")
//   ask      "오늘의 운세를 볼까요?" — 어르신이 직접 시작한다
//   arriving 학이 복주머니를 물고 날아와 내려놓고 떠남 → 어르신 띠 동물이 깡충 뛰어옴
//            (이 동안 무대를 누르면 바로 다음 장면으로 건너뛴다)
//   waiting  "복주머니를 눌러 주세요!" — 움직임이 다 멈춘 뒤에 누르게 한다
//   opening  띠 동물이 끈을 당기고 주머니가 흔들리며 금빛
//   open     운세 쪽지 세 장
//
// - 학은 매일 오는 배달부(장수를 뜻하는 십장생), 여는 동물은 어르신 본인의 띠(설날 기준).
//   그날의 띠 동물은 출석도장에만 남겼다 — 한 화면에 동물이 셋이면 헷갈린다.
// - 같은 날 다시 들어오면: 학이 이미 왔으면 waiting부터, 이미 열었으면 open(이 기기 기준).
// - 생신이 없으면 학이 닫힌 주머니만 두고 가고, "가족이 생신을 등록하면 띠 동물이 열어 드려요".
// - 움직임 줄이기 설정이면 날아오는 장면 없이 waiting을 정지 화면으로 보여 준다.
//
// 만세력 라이브러리(lunar-javascript)가 커서 이 파일은 화면에서 React.lazy로 불러온다.

const SECTIONS = [
  { key: "general", icon: "☀️", title: "오늘의 운세" },
  { key: "love", icon: "💞", title: "가족·친구운" },
  { key: "health", icon: "🌿", title: "건강운" },
] as const;

type Stage = "ask" | "arriving" | "waiting" | "opening" | "open";

const OPENED_KEY = "callog.fortuneOpenedOn";
const ARRIVED_KEY = "callog.fortuneArrivedOn";

function isToday(key: string, today: string): boolean {
  try {
    return window.localStorage.getItem(key) === today;
  } catch {
    return false;
  }
}

function remember(key: string, today: string) {
  try {
    window.localStorage.setItem(key, today);
  } catch {
    // 저장이 안 되면 다음에 처음부터 한 번 더 보일 뿐이다
  }
}

function prefersReducedMotion(): boolean {
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

// 날아오는 장면의 길이(ms). CSS의 지연·길이와 맞춘다. animationend를 놓칠 때를 대비한 안전 타이머.
const ARRIVAL_MS = 2700;
const OPENING_MS = 900;

export default function ElderFortune({ birthDate }: { birthDate: string | null }) {
  const today = todaySeoul();
  const birth = birthFromSolarDate(birthDate);
  const fortune = birth ? getFortune(birth, today) : null;
  const helper = birth ? birthAnimal(birth) : null;

  const [stage, setStage] = useState<Stage>(() => {
    if (fortune && isToday(OPENED_KEY, today)) return "open";
    if (isToday(ARRIVED_KEY, today)) return "waiting";
    return "ask";
  });
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function after(ms: number, next: Stage) {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStage(next), ms);
  }

  function startArrival() {
    remember(ARRIVED_KEY, today);
    if (prefersReducedMotion()) {
      setStage("waiting");
      return;
    }
    setStage("arriving");
    after(ARRIVAL_MS, "waiting");
  }

  function skipArrival() {
    window.clearTimeout(timer.current);
    setStage("waiting");
  }

  function open() {
    if (!fortune || stage !== "waiting") return;
    try {
      navigator.vibrate?.(30);
    } catch {
      // 진동을 못 하는 기기(iOS 사파리 등) — 화면만으로도 열린 게 보인다
    }
    remember(OPENED_KEY, today);
    if (prefersReducedMotion()) {
      setStage("open");
      return;
    }
    setStage("opening");
    after(OPENING_MS, "open");
  }

  // 마지막 동작이 끝나면 바로 다음 장면으로(타이머보다 먼저 오면 그걸 쓴다)
  function onAnimationEnd(e: React.AnimationEvent) {
    if (stage !== "arriving") return;
    const last = helper ? "e-helper-hop" : "e-crane-leave";
    if (e.animationName === last) skipArrival();
  }

  // ── open: 운세 쪽지 ─────────────────────────────────────────
  if (stage === "open" && fortune) {
    const opener = helper ? `${helper.emoji} ${withSubject(helper.name)} 복주머니를 열어 드렸어요` : "복주머니가 열렸어요";
    const spoken = [opener.replace(/^\S+\s/, ""), ...SECTIONS.map((s) => `${s.title}. ${fortune.texts[s.key]}`)].join(" ");
    return (
      <section className="e-card e-fortune e-fortune--open" aria-live="polite">
        <h2 className="e-fortune-title">{opener}</h2>
        <p className="e-meta">
          타고난 기운은 {fortune.saju.dayMaster}({fortune.saju.dayMasterPlain}), 오늘은 {fortune.todayGanZhi}일
        </p>
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

  // ── ask: 직접 시작 ─────────────────────────────────────────
  if (stage === "ask") {
    return (
      <section className="e-card e-fortune">
        <h2 className="e-fortune-title">오늘의 운세를 볼까요?</h2>
        <p className="e-meta" style={{ marginBottom: 12 }}>
          🕊 학이 오늘의 복주머니를 가져다 드려요
        </p>
        <button type="button" className="e-primary" onClick={startArrival}>
          네, 볼게요
        </button>
      </section>
    );
  }

  // ── arriving / waiting / opening: 같은 무대 ──────────────────
  const arriving = stage === "arriving";
  const canOpen = Boolean(fortune) && stage === "waiting";
  const stageClass = [
    "e-fortune-stage",
    "e-fortune-stage--crane",
    arriving ? "is-arriving" : "",
    stage === "waiting" ? "is-waiting" : "",
    stage === "opening" ? "is-opening has-helper" : "",
  ]
    .filter(Boolean)
    .join(" ");

  let label: string;
  if (arriving) label = "학이 복주머니를 가져오는 중이에요. 누르면 건너뛰어요";
  else if (!fortune) label = "복주머니";
  else label = helper ? `${withSubject(helper.name)} 복주머니 열기` : "복주머니 열기";

  return (
    <section className="e-card e-fortune">
      <h2 className="e-fortune-title">{arriving ? "학이 복주머니를 가져와요" : fortune ? "복주머니를 눌러 주세요!" : "오늘의 복주머니가 왔어요"}</h2>
      <button
        type="button"
        className={stageClass}
        onClick={arriving ? skipArrival : open}
        onAnimationEnd={onAnimationEnd}
        // 열리는 중에도 막지 않는다 — 막으면 흐린 주머니 스타일이 걸린다. 두 번 눌림은 open()이 거른다
        disabled={!arriving && !canOpen && stage !== "opening"}
        aria-label={label}
      >
        {arriving && <Crane className="e-crane" />}
        {helper && (
          <span className="e-fortune-animal e-helper" aria-hidden="true">
            {helper.emoji}
          </span>
        )}
        <Pouch className="e-fortune-pouch" />
        <span className="e-fortune-sparkle" aria-hidden="true" />
      </button>
      <p className="e-fortune-hint">
        {arriving
          ? "화면을 누르면 바로 볼 수 있어요"
          : !fortune
            ? "가족이 생신을 등록하면 띠 동물이 열어 드려요"
            : helper
              ? `${helper.emoji} ${withSubject(helper.name)} 열어 드릴게요`
              : "눌러서 열어 보세요"}
      </p>
    </section>
  );
}
