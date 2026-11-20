// 어르신이 고른 화면 설정(바탕 + 글씨 크기)을 저장하고 문서에 적용한다.
//
// 잘 보이는 화면은 사람마다 다르다. 백내장이 있으면 어두운 배경의 흰 글씨가 번져 보이고,
// 노안만 있으면 크기만 키우면 된다. 그래서 하나를 정해주는 대신 직접 눌러보고 고르게 한다.
// 근거: 기능설계서 §1 접근성 — "글씨 크기 확대 가능"을 바탕 선택까지 넓힌 것.

// 기본 바탕을 "밤하늘"에서 "한낮"으로 바꾸면서(2026-11-20, 화면 정리 8단계) 키를 새로 둔다.
// 예전 코드는 들어올 때마다 기본값(밤하늘)을 저장해서, 직접 고른 것과 기본값을 구분할 수 없었다.
// 예전 키에 밤하늘이 아닌 값(직접 고른 노을·또렷하게·한낮)이 있으면 그 선택은 이어 쓴다.
// index.html의 그리기 전 스크립트도 같은 규칙을 따른다.
const THEME_KEY = "callog.elderTheme2";
const OLD_THEME_KEY = "callog.elderTheme";
const DEFAULT_THEME = "daylight";
const SCALE_KEY = "callog.fontScale";

export type ElderTheme = "night" | "daylight" | "warm" | "maxcontrast";

export interface ThemeOption {
  id: ElderTheme;
  label: string;
  /**
   * 고르는 버튼을 그 바탕 자체로 칠하는 데 쓴다. 옆에 작은 색 견본을 붙이는 것보다
   * 버튼이 곧 미리보기인 편이 "고르면 이렇게 된다"를 바로 보여준다.
   */
  sample: { bg: string; fg: string; ring: string };
}

export const THEME_OPTIONS: ThemeOption[] = [
  { id: "daylight", label: "한낮", sample: { bg: "#F7F8FB", fg: "#111318", ring: "#2A37B8" } },
  { id: "night", label: "밤하늘", sample: { bg: "#121416", fg: "#FFFFFF", ring: "#6865D8" } },
  { id: "warm", label: "노을", sample: { bg: "#1B1512", fg: "#FFF6EE", ring: "#E8A33C" } },
  { id: "maxcontrast", label: "또렷하게", sample: { bg: "#000000", fg: "#FFD400", ring: "#FFD400" } },
];

/** styles/elder.css의 --font-scale 단계와 같아야 한다 */
export const SCALES = [1, 1.15, 1.3] as const;

export const SCALE_LABELS = ["보통", "크게", "아주 크게"] as const;

export function getStoredTheme(): ElderTheme {
  const valid = (v: string | null): v is ElderTheme => THEME_OPTIONS.some((o) => o.id === v);
  const saved = window.localStorage.getItem(THEME_KEY);
  if (valid(saved)) return saved;
  const old = window.localStorage.getItem(OLD_THEME_KEY);
  if (valid(old) && old !== "night") return old;
  return DEFAULT_THEME;
}

export function getStoredScaleIndex(): number {
  const saved = Number(window.localStorage.getItem(SCALE_KEY) ?? "0");
  return Number.isInteger(saved) && saved >= 0 && saved < SCALES.length ? saved : 0;
}

/** save=false: 화면에 입히기만 한다(복원할 때). 저장은 어르신이 직접 고를 때만 */
export function applyTheme(theme: ElderTheme, save = true): void {
  // "밤하늘"은 :root의 기본 색이라 속성을 아예 붙이지 않는다
  if (theme === "night") document.documentElement.removeAttribute("data-elder-theme");
  else document.documentElement.setAttribute("data-elder-theme", theme);
  if (save) window.localStorage.setItem(THEME_KEY, theme);
}

export function applyScaleIndex(index: number): void {
  document.documentElement.style.setProperty("--font-scale", String(SCALES[index] ?? 1));
  window.localStorage.setItem(SCALE_KEY, String(index));
}

/** 어르신 화면에 들어올 때 저장된 설정을 복원한다 */
export function restoreElderDisplay(): void {
  applyTheme(getStoredTheme(), false);
  applyScaleIndex(getStoredScaleIndex());
}

/** 보호자 화면은 어르신이 고른 바탕/글씨 크기를 따라가지 않는다 */
export function clearElderDisplay(): void {
  document.documentElement.removeAttribute("data-elder-theme");
  document.documentElement.style.removeProperty("--font-scale");
}
