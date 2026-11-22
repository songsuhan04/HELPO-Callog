import { useEffect, useRef, useState } from "react";
import { SpeakButton } from "../../components/SpeakButton";
import { todaySeoul } from "../../lib/date";
import { withSubject } from "./animal";
import { Crane } from "./Crane";
import { Pouch } from "./Pouch";
import { birthAnimal, birthFromSolarDate, getFortune } from "./saju";
import { logElderUsage } from "../../lib/usage";
import { elderScopedKey } from "../../lib/elderSession";

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

// 제목 앞 장식 이모지(해·하트·풀잎)는 뺐다 — "AI로 만든 화면" 같다는 지적(3회차 기술 멘토링)
const SECTIONS = [
  { key: "general", title: "오늘의 운세" },
  { key: "love", title: "가족·친구운" },
  { key: "health", title: "건강운" },
] as const;

type Stage = "ask" | "arriving" | "waiting" | "opening" | "open";

const OPENED_KEY = "callog.fortuneOpenedOn";
const ARRIVED_KEY = "callog.fortuneArrivedOn";

function isToday(key: string, today: string): boolean {
  try {
    return window.localStorage.getItem(elderScopedKey(key)) === today;
  } catch {
    return false;
  }
}

function remember(key: string, today: string) {
  try {
    window.localStorage.setItem(elderScopedKey(key), today);
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

export default function ElderFortune({
  birthDate,
  birthTime = null,
  name = null,
}: {
  birthDate: string | null;
  /** "HH:MM" — 보호자가 적은 태어난 시각(선택). 없으면 시주 없이 센다 */
  birthTime?: string | null;
  /** 어르신 성함 — "○○님의 사주" */
  name?: string | null;
}) {
  const today = todaySeoul();
  const birth = birthFromSolarDate(birthDate, birthTime);
  const fortune = birth ? getFortune(birth, today) : null;
  const helper = birth ? birthAnimal(birth) : null;

  const [stage, setStage] = useState<Stage>(() => {
    if (fortune && isToday(OPENED_KEY, today)) return "open";
    if (isToday(ARRIVED_KEY, today)) return "waiting";
    return "ask";
  });
  // 사주 풀이는 접어 둔다 — 명식표·일간 3문장·오행까지 다 펼치면 운세 쪽지보다 길어서
  // 정작 오늘의 운세가 화면 아래로 밀렸다(2026-11-20 팀 의견). 한 줄 요약만 보이고 더보기로 편다.
  const [sajuMore, setSajuMore] = useState(false);
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
    logElderUsage("fortune_open");
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
    const opener = helper ? `${withSubject(helper.name)} 복주머니를 열어 드렸어요` : "복주머니가 열렸어요";
    const spoken = [opener, ...SECTIONS.map((s) => `${s.title}. ${fortune.texts[s.key]}`)].join(" ");
    // 명식은 전통 순서대로 오른쪽이 년주 — 왼쪽부터 시·일·월·년
    const pillars = [...fortune.saju.pillars].reverse();
    // 일간 설명의 첫 문장만 요약으로 보이고, 나머지 문장은 더보기에 둔다
    const [firstSentence, ...restSentences] = fortune.saju.dayMasterText.split(/(?<=[.?!])\s+/);
    return (
      <section className="e-card e-fortune e-fortune--open" aria-live="polite">
        <h2 className="e-fortune-title">{opener}</h2>
        {/* 나의 타고난 기운 — 일간 설명과 오행(팀 자료 2026-11-19). 태어난 시각이 있으면
            네 기둥(여덟 글자), 없으면 년·월·일 세 기둥(여섯 글자)으로 오행을 센다. */}
        <div className="e-fortune-saju">
          <div className="e-fortune-head">{name ? `${name}님의 사주` : "나의 사주"}</div>
          <ol className="e-pillars" aria-label="사주 명식">
            {pillars.map((p) => (
              <li key={p.label} className={p.label === "일주" ? "e-pillar e-pillar--me" : "e-pillar"}>
                <span className="e-pillar-chars" aria-hidden="true">
                  <span>{p.value[0]}</span>
                  <span>{p.value[1]}</span>
                </span>
                <span className="e-pillar-label">{p.label}</span>
                <span className="sr-only">{p.value}</span>
              </li>
            ))}
          </ol>
          <p className="e-meta u-mb8">진하게 칠한 일주가 나를 뜻해요.</p>
          <p className="e-fortune-saju-text">
            타고난 기운은 {fortune.saju.dayMaster}({fortune.saju.dayMasterPlain})이에요. {firstSentence}
          </p>
          {sajuMore && (
            <div id="e-saju-more">
              {restSentences.length > 0 && <p className="e-fortune-saju-text">{restSentences.join(" ")}</p>}
              <ul className="e-elements" aria-label="오행 개수">
                {fortune.saju.elements.map((e) => (
                  <li key={e.label} className={e.count === 0 ? "e-element e-element--none" : "e-element"}>
                    <span>{e.label}</span>
                    <b>{e.count}</b>
                  </li>
                ))}
              </ul>
              <p className="e-meta">{fortune.saju.elementText}</p>
              {fortune.saju.pillars.length < 4 && (
                <p className="e-meta">태어난 시각을 등록하면 시주까지 볼 수 있어요.</p>
              )}
            </div>
          )}
          <button
            type="button"
            className="e-more"
            aria-expanded={sajuMore}
            aria-controls="e-saju-more"
            onClick={() => {
              // 펼칠 때만 센다 — "자세히 보기를 몇 명이 눌렀나"가 유료화 근거다
              if (!sajuMore) logElderUsage("saju_more_open");
              setSajuMore((v) => !v);
            }}
          >
            {sajuMore ? "접기" : "사주 더보기"}
          </button>
        </div>
        <p className="e-meta u-mt12">
          오늘은 {fortune.todayGanZhi}일이에요. 날마다 바뀌는 그날의 기운이에요.
        </p>
        {SECTIONS.map((s, i) => (
          <div key={s.key} className="e-fortune-slip" style={{ animationDelay: `${i * 140}ms` }}>
            <div className="e-fortune-head">{s.title}</div>
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
      // 안부를 마친 뒤 눈에 잘 띄어야 한다 — 글 한 줄과 버튼만 있을 때는 지나치기 쉬웠다(멘토 의견
      // 2026-11-21). 복주머니 그림을 크게 두고, 그림을 눌러도 시작되게 한다.
      <section className="e-card e-fortune e-fortune--ask">
        <h2 className="e-fortune-title">오늘의 운세가 도착했어요</h2>
        <button type="button" className="e-fortune-ask-art" onClick={startArrival} aria-label="오늘의 운세 보기">
          <Pouch className="e-fortune-ask-pouch" />
        </button>
        <p className="e-meta u-mb12">
          학이 복주머니를 가져다 드려요
        </p>
        <button type="button" className="e-primary" onClick={startArrival}>
          운세 보기
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
        {helper && (
          <span className="e-fortune-animal e-helper" aria-hidden="true">
            {helper.emoji}
          </span>
        )}
        {/* 학과 금빛을 주머니 상자 안에 둔다 — 띠 동물이 옆에 서서 주머니가 밀려나도
            학의 부리와 금빛이 주머니를 따라간다 */}
        <span className="e-fortune-pouchwrap">
          {arriving && <Crane className="e-crane" />}
          <Pouch className="e-fortune-pouch" />
          <span className="e-fortune-sparkle" aria-hidden="true" />
        </span>
      </button>
      <p className="e-fortune-hint">
        {arriving
          ? "화면을 누르면 바로 볼 수 있어요"
          : !fortune
            ? "가족이 생신을 등록하면 띠 동물이 열어 드려요"
            : helper
              ? `${withSubject(helper.name)} 열어 드릴게요`
              : "눌러서 열어 보세요"}
      </p>
    </section>
  );
}
