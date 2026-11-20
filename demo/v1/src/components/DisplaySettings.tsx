import { useEffect, useState, type CSSProperties } from "react";
import {
  SCALES,
  SCALE_LABELS,
  THEME_OPTIONS,
  applyScaleIndex,
  applyTheme,
  getStoredScaleIndex,
  getStoredTheme,
  type ElderTheme,
} from "../lib/elderDisplay";

// 어르신이 바탕과 글씨 크기를 직접 눌러보며 고르는 시트.
// 예전의 FontSizeToggle(글씨 크기만 순환)을 대신한다 — 순환식은 지금 몇 단계인지
// 알 수 없고 되돌리려면 끝까지 눌러야 해서, 고른 것이 보이는 방식으로 바꿨다.
//
// 고른 값은 즉시 화면에 반영된다. 미리보기를 따로 두지 않고 화면 자체가 바뀌는 편이
// "이게 내가 고른 것"을 알기 쉽다.
export function DisplaySettings() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ElderTheme>("night");
  const [scaleIndex, setScaleIndex] = useState(0);

  useEffect(() => {
    setTheme(getStoredTheme());
    setScaleIndex(getStoredScaleIndex());
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function chooseTheme(next: ElderTheme) {
    setTheme(next);
    applyTheme(next);
  }

  function chooseScale(index: number) {
    setScaleIndex(index);
    applyScaleIndex(index);
  }

  return (
    <>
      <button type="button" className="e-textbtn" onClick={() => setOpen(true)}>
        가+ 화면 설정
      </button>

      {open && (
        <div className="e-sheet-backdrop" onClick={() => setOpen(false)}>
          <div
            className="e-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="화면 설정"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="e-sheet-head">
              <h2 className="e-sheet-title">화면 설정</h2>
              <button type="button" className="e-sheet-close" onClick={() => setOpen(false)}>
                닫기
              </button>
            </div>
            <p className="e-sheet-sub">제일 잘 보이는 것으로 골라 주세요.</p>

            <div className="e-opt-group">
              <div className="e-opt-legend">바탕</div>
              <div className="e-opt-row e-opt-row--four">
                {THEME_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="e-opt e-opt--theme"
                    aria-pressed={theme === option.id}
                    onClick={() => chooseTheme(option.id)}
                    style={
                      {
                        background: option.sample.bg,
                        color: option.sample.fg,
                        "--opt-ring": option.sample.ring,
                      } as CSSProperties
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="e-opt-group">
              <div className="e-opt-legend">글씨 크기</div>
              <div className="e-opt-row e-opt-row--three">
                {SCALES.map((scale, index) => (
                  <button
                    key={scale}
                    type="button"
                    className="e-opt e-opt-size"
                    aria-pressed={scaleIndex === index}
                    onClick={() => chooseScale(index)}
                    style={{ fontSize: `calc(15px * ${scale})` }}
                  >
                    {SCALE_LABELS[index]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
