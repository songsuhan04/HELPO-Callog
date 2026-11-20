import { DisplaySettings } from "./DisplaySettings";

// 어르신 화면 맨 위 한 줄. 모든 어르신 화면에서 같은 자리에 같은 모양으로 둔다
// (DESIGN.md 5장 "어르신 화면 고정 자리", Apple 손쉬운 사용 모드의 "항상 같은 자리").
//   왼쪽: "이전"(글자 버튼). 뒤로 갈 곳이 없는 화면이면 처음 화면에서만 로고를 둔다.
//   오른쪽: "화면 설정"(글자 버튼).
// 예전에는 화면마다 "이전" 알약 버튼과 상단 바가 두 줄로 따로 있거나, 읽어주기가 상단 바에
// 들어가 있는 등 자리가 제각각이었다(3회차 기술 멘토링 "화면 정리").
export function ElderTopBar({
  onBack,
  backLabel = "← 이전",
  brand = false,
}: {
  onBack?: () => void;
  backLabel?: string;
  /** 로고 "Callog" — 처음 화면에만 */
  brand?: boolean;
}) {
  return (
    <div className="e-topbar">
      {onBack ? (
        <button type="button" className="e-textbtn" onClick={onBack}>
          {backLabel}
        </button>
      ) : brand ? (
        <span className="e-brand">Callog</span>
      ) : (
        <span />
      )}
      <DisplaySettings />
    </div>
  );
}
