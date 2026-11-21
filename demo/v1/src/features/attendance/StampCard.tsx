import { useEffect, useRef, useState } from "react";
import { Pouch } from "../fortune/Pouch";
import { CARD_SIZE, type StampSummary, wishFor } from "./stamps";

// 출석도장판(어르신 처음·완료 화면). 계산은 stamps.ts, 여기는 보여 주기만 한다.
//
// - 완료 화면에서는 오늘 찍힌 도장이 "쾅" 하고 찍힌다(하루 한 번만, 이 기기 기준).
// - 마지막 칸에는 달토끼가 기다린다. 7개를 채운 날은 달토끼가 금빛 소원 복주머니를 가져온다.
// - 움직임 줄이기 설정이면 애니메이션 없이 보여 준다(CSS).

const STAMPED_KEY = "callog.stampAnimatedOn";
const WISH_KEY = "callog.wishOpenedCard";

function readKey(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 저장이 안 되면 다음에 한 번 더 보일 뿐이다
  }
}

export function StampCard({
  summary,
  today,
  streak,
  celebrate = false,
}: {
  summary: StampSummary;
  today: string;
  streak: number;
  /** 완료 화면처럼 방금 안부를 마친 곳에서 true — 오늘 도장을 찍는 움직임을 보여 준다 */
  celebrate?: boolean;
}) {
  // 처음 그릴 때 한 번만 정한다 — 다시 그려질 때마다 도장이 또 찍히면 안 된다
  const [animateToday] = useState(() => celebrate && summary.todayStamped && readKey(STAMPED_KEY) !== today);
  useEffect(() => {
    if (animateToday) writeKey(STAMPED_KEY, today);
  }, [animateToday, today]);

  const slots = Array.from({ length: CARD_SIZE }, (_, i) => summary.stamps[i] ?? null);

  let message: string;
  if (summary.completedToday) message = "도장판을 다 채우셨어요!";
  else if (summary.todayStamped) message = `오늘 도장을 찍었어요. ${summary.remaining}개 더 모으면 달토끼가 소원 복주머니를 가져와요`;
  else message = "오늘 안부를 마치면 도장을 찍어 드려요";

  return (
    <section className="e-card e-stamps" aria-label={`출석도장 ${summary.stamps.length}개, ${CARD_SIZE}개 모으면 선물`}>
      <div className="e-stamps-head">
        <h2 className="e-stamps-title">출석도장</h2>
        <span className="e-stamps-count">
          {summary.stamps.length} / {CARD_SIZE}
        </span>
      </div>
      <ol className="e-stamps-grid">
        {slots.map((stamp, i) => {
          const isLast = i === CARD_SIZE - 1;
          if (stamp) {
            const fresh = animateToday && stamp.date === today;
            return (
              <li key={i} className={`e-stamp e-stamp--on${fresh ? " e-stamp--fresh" : ""}`}>
                <span className="e-stamp-emoji" aria-hidden="true">{stamp.emoji}</span>
                <span className="e-stamp-date">{Number(stamp.date.slice(5, 7))}/{Number(stamp.date.slice(8, 10))}</span>
              </li>
            );
          }
          return (
            <li key={i} className={`e-stamp${isLast ? " e-stamp--goal" : ""}`}>
              <span aria-hidden="true">{isLast ? "🐰" : i + 1}</span>
            </li>
          );
        })}
      </ol>
      <p className="e-stamps-message">{message}</p>
      {(streak > 1 || summary.cardsDone > 0) && (
        <p className="e-meta u-center">
          {streak > 1 ? `${streak}일 연속으로 오셨어요` : ""}
          {streak > 1 && summary.cardsDone > 0 ? ", " : ""}
          {summary.cardsDone > 0 ? `지금까지 도장판 ${summary.cardsDone}장을 채우셨어요` : ""}
        </p>
      )}
      {summary.completedToday && <MoonRabbitWish cardsDone={summary.cardsDone} />}
    </section>
  );
}

// 도장판을 채운 날의 보상 — 달토끼가 가져온 금빛 소원 복주머니. 눌러야 열린다.
function MoonRabbitWish({ cardsDone }: { cardsDone: number }) {
  const [open, setOpen] = useState(() => readKey(WISH_KEY) === String(cardsDone));
  const [opening, setOpening] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function handleOpen() {
    if (open || opening) return;
    try {
      navigator.vibrate?.([30, 40, 30]);
    } catch {
      // 진동을 못 하는 기기
    }
    writeKey(WISH_KEY, String(cardsDone));
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setOpen(true);
      return;
    }
    setOpening(true);
    timer.current = window.setTimeout(() => setOpen(true), 650);
  }

  if (open) {
    return (
      <div className="e-wish e-wish--open" aria-live="polite">
        <div className="e-wish-moon" aria-hidden="true">
          🌕<span>🐰</span>
        </div>
        <p className="e-wish-title">달토끼의 소원 덕담</p>
        <p className="e-wish-text">{wishFor(cardsDone)}</p>
        <p className="e-meta">내일부터 새 도장판이 시작돼요.</p>
      </div>
    );
  }

  return (
    <div className="e-wish">
      <p className="e-wish-title">달토끼가 소원 복주머니를 가져왔어요</p>
      <button
        type="button"
        className={`e-fortune-stage e-wish-stage${opening ? " is-opening" : ""}`}
        onClick={handleOpen}
        aria-label="달토끼의 소원 복주머니 열기"
      >
        <span className="e-wish-moon" aria-hidden="true">
          🌕<span>🐰</span>
        </span>
        <Pouch variant="gold" className="e-fortune-pouch" />
        <span className="e-fortune-sparkle" aria-hidden="true" />
      </button>
      <p className="e-fortune-hint">눌러서 열어 보세요</p>
    </div>
  );
}
