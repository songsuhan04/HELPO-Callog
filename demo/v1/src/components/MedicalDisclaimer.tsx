// 의료법 §27(무면허 의료행위) 대응 — AI 분석 결과가 "진단"으로 오인되지 않도록
// 위험도/음성분석 결과가 표시되는 화면 하단에 고정 노출한다.
// 근거: Help4/법적문제 피해가기 공략.pdf §4, 체크리스트 3번
// 안내는 한 줄로 두고, 법적 문장은 "자세히" 안에 그대로 둔다(DESIGN.md 7장, 화면 정리 4단계).
export function MedicalDisclaimer() {
  return (
    <div className="g-legal">
      의료 진단이 아니라 안부 확인용 신호예요.
      <details className="g-details">
        <summary>자세히</summary>
        이 서비스는 의료기기나 의료 진단 서비스가 아니에요. AI 분석 결과는 일상 안부를 확인하기 위한 참고용 신호예요.
        정확한 건강 상태는 꼭 전문 의료기관에서 진료를 받아 확인해 주세요.
      </details>
    </div>
  );
}
