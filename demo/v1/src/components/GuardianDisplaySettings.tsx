import { useEffect, useState, type CSSProperties } from "react";
import {
  GUARDIAN_SCALES,
  GUARDIAN_SCALE_LABELS,
  GUARDIAN_THEME_OPTIONS,
  applyGuardianScaleIndex,
  applyGuardianTheme,
  getStoredGuardianScaleIndex,
  getStoredGuardianTheme,
  type GuardianTheme,
} from "../lib/guardianDisplay";

// 보호자도 어르신 화면의 "화면 설정"과 같은 방식으로 바탕/글씨 크기를 직접 고른다.
// AppShell이 모든 보호자 화면에 이 컴포넌트를 공통으로 띄워주므로 화면마다 따로 추가할
// 필요가 없다.
export function GuardianDisplaySettings() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<GuardianTheme>("dark");
  const [scaleIndex, setScaleIndex] = useState(0);

  useEffect(() => {
    setTheme(getStoredGuardianTheme());
    setScaleIndex(getStoredGuardianScaleIndex());
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function chooseTheme(next: GuardianTheme) {
    setTheme(next);
    applyGuardianTheme(next);
  }

  function chooseScale(index: number) {
    setScaleIndex(index);
    applyGuardianScaleIndex(index);
  }

  return (
    <>
      <button type="button" className="g-display-trigger" onClick={() => setOpen(true)}>
        가+ 화면 설정
      </button>

      {open && (
        <div className="g-sheet-backdrop" onClick={() => setOpen(false)}>
          <div
            className="g-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="화면 설정"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="g-sheet-head">
              <h2 className="g-sheet-title">화면 설정</h2>
              <button type="button" className="g-sheet-close" onClick={() => setOpen(false)}>
                닫기
              </button>
            </div>
            <p className="g-sheet-sub">눌러보시고 편한 것으로 고르세요. 고르면 바로 바뀝니다.</p>

            <div className="g-opt-group">
              <div className="g-opt-legend">바탕</div>
              <div className="g-opt-row g-opt-row--four">
                {GUARDIAN_THEME_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="g-opt g-opt--theme"
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

            <div className="g-opt-group">
              <div className="g-opt-legend">글씨 크기</div>
              <div className="g-opt-row g-opt-row--three">
                {GUARDIAN_SCALES.map((scale, index) => (
                  <button
                    key={scale}
                    type="button"
                    className="g-opt"
                    aria-pressed={scaleIndex === index}
                    onClick={() => chooseScale(index)}
                    style={{ fontSize: `calc(13px * ${scale})` }}
                  >
                    {GUARDIAN_SCALE_LABELS[index]}
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
