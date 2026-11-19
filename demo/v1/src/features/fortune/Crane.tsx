// 학(두루미) — 매일 복주머니를 물어다 주는 배달부. 장수를 뜻하는 십장생이라 어르신 화면에 맞다.
// 근거: 운세 이펙트 업데이트안 v2(2026-11-19).
//
// 날개는 왼쪽(먼 날개)·오른쪽(가까운 날개)을 따로 묶어 CSS로 날갯짓을 준다.
// 부리에 매단 작은 복주머니(e-crane-cargo)는 내려놓는 순간 사라지고, 무대의 큰 주머니가 떨어진다.
// 흰 몸통에는 옅은 회색 외곽선을 넣어 어두운 바탕에서도 윤곽이 보이게 했다. 색은 고정.
export function Crane({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 150 110" aria-hidden="true">
      {/* 먼 날개 */}
      <g className="e-crane-wing e-crane-wing--l">
        <path d="M70 46 C62 26 56 12 44 4 C64 8 82 20 90 44 Z" fill="#E6E9EF" stroke="#C3C8D2" strokeWidth="1.2" />
        <path d="M44 4 C50 8 54 12 57 17 L52 18 C49 13 47 9 44 4 Z" fill="#23262D" />
      </g>
      {/* 꼬리 깃(검정)과 다리 */}
      <path d="M100 50 C110 50 120 56 128 64 C116 62 108 58 100 56 Z" fill="#23262D" />
      <path d="M98 58 L138 70 M100 60 L136 74" stroke="#5B606B" strokeWidth="1.6" strokeLinecap="round" />
      {/* 몸통 */}
      <ellipse cx="82" cy="52" rx="26" ry="12" fill="#FFFFFF" stroke="#C3C8D2" strokeWidth="1.4" />
      {/* 목(검정)과 머리, 붉은 정수리 */}
      <path d="M60 48 C48 44 38 38 30 36" stroke="#23262D" strokeWidth="5" fill="none" strokeLinecap="round" />
      <circle cx="26" cy="35" r="6" fill="#FFFFFF" stroke="#C3C8D2" strokeWidth="1.2" />
      <circle cx="25" cy="31" r="2.8" fill="#D62B2B" />
      <circle cx="23.5" cy="35" r="1.1" fill="#23262D" />
      <path d="M21 37 L8 42" stroke="#C9A65A" strokeWidth="3" strokeLinecap="round" />
      {/* 부리에 매단 작은 복주머니 */}
      <g className="e-crane-cargo">
        <path d="M9 42 L9 54" stroke="#E2B13C" strokeWidth="1.6" />
        <path d="M2 56 Q9 52 16 56 L15 60 C20 66 18 76 9 76 C0 76 -2 66 3 60 Z" fill="#C0303A" />
        <rect x="2" y="57" width="14" height="3" rx="1.5" fill="#E2B13C" />
      </g>
      {/* 가까운 날개 */}
      <g className="e-crane-wing e-crane-wing--r">
        <path d="M78 46 C84 26 96 10 112 2 C110 18 102 34 92 48 Z" fill="#FFFFFF" stroke="#C3C8D2" strokeWidth="1.2" />
        <path d="M112 2 C111 8 109 13 106 18 L101 15 C105 10 108 6 112 2 Z" fill="#23262D" />
      </g>
    </svg>
  );
}
