import { useState } from "react";

// 119 직접 전화 안내.
//
// ⚠️ 설계 원칙 — 바꾸기 전에 반드시 읽을 것:
// 1. 위험도 판정과 절대 연결하지 않는다. "심각"일 때만 나타나게 하면 서비스가 응급 상황을
//    판단한 것이 되어, 약관에 명시한 "응급 상황을 감지하지 않습니다"와 모순되고
//    "응급을 인지하고도 대응하지 않았다"는 주장의 여지가 생긴다. 항상 같은 자리에 둔다.
// 2. 서비스는 아무것도 중개하지 않는다. 기기의 전화 앱을 여는 것뿐이라 신고를 대행하거나
//    구조를 약속하지 않는다. 문구도 "직접 전화"임이 드러나야 한다.
// 3. 확인 단계를 둔다. 어르신 화면에서 손이 스쳐 119가 걸리면 실제 문제가 되므로,
//    한 번 더 누르게 하고 자주 쓰는 버튼과 떨어뜨려 배치한다.
// 근거: 기능설계서.md §2.3 알림 정책, 이용약관 §2, Help4/법적문제 피해가기 공략.pdf §6
export function EmergencyCall() {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <div className="e-emergency">
        <p className="e-emergency-lead">많이 아프거나 위급하시면</p>
        <button type="button" className="e-emergency-btn" onClick={() => setConfirming(true)}>
          119에 직접 전화하기
        </button>
      </div>
    );
  }

  return (
    <div className="e-emergency">
      <p className="e-emergency-lead">119에 전화를 거시겠어요?</p>
      {/* 실제 통화는 기기의 전화 앱이 한다 — 서비스는 연결에 관여하지 않는다 */}
      <a className="e-emergency-btn" href="tel:119">
        예, 지금 걸게요
      </a>
      <button type="button" className="e-secondary" onClick={() => setConfirming(false)}>
        아니요
      </button>
    </div>
  );
}
