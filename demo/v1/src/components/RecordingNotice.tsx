// 통신비밀보호법/민법(타인 초상권·음성권) 대응 — 녹화/녹음 화면에 상시 노출.
// 근거: Help4/법적문제 피해가기 공략.pdf §5, 체크리스트 4번
// 안내는 한 줄로 두고, 법적 문장은 "자세히" 안에 그대로 둔다(DESIGN.md 7장, 화면 정리 4단계).
export function RecordingNotice() {
  return (
    <div className="e-notice">
      본인 목소리만 녹음해 주세요.
      <details className="e-details">
        <summary>자세히</summary>
        본인의 음성/모습만 녹화해 주세요. 타인의 동의 없는 촬영은 법적 책임을 질 수 있어요.
      </details>
    </div>
  );
}
