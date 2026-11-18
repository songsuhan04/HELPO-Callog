// 복주머니 그림 — 매일의 운세(붉은 비단)와 출석도장 보상(금빛, 달토끼의 소원 복주머니)이 같이 쓴다.
// 색은 화면 테마와 상관없이 고정이다(밝은·어두운 바탕 모두에서 같은 주머니로 보이게).
//
// 만세력 라이브러리를 가져오지 않는 작은 파일이라, 처음 화면에서 바로 써도 무겁지 않다.

const COLORS = {
  red: { top: "#9E1F2B", topLight: "#B8323C", body: "#C0303A", sheen: "#D9545C", cord: "#E2B13C", mark: "#9E1F2B" },
  gold: { top: "#B07A12", topLight: "#C99227", body: "#DDA62A", sheen: "#F4CF6B", cord: "#8E1F2B", mark: "#FFF4D6" },
} as const;

export function Pouch({ variant = "red", className }: { variant?: keyof typeof COLORS; className?: string }) {
  const c = COLORS[variant];
  return (
    <svg className={className} viewBox="0 0 120 132" aria-hidden="true">
      {/* 오므린 윗부분 */}
      <path d="M30 22 Q60 40 90 22 L82 56 Q60 63 38 56 Z" fill={c.top} />
      <path d="M30 22 Q44 30 52 26 L48 55 Q42 55 38 56 Z" fill={c.topLight} opacity="0.7" />
      {/* 몸통 */}
      <path d="M36 58 C10 84 18 126 60 126 C102 126 110 84 84 58 Z" fill={c.body} />
      <path d="M40 64 C24 84 28 110 46 118 C36 104 36 84 48 66 Z" fill={c.sheen} opacity="0.55" />
      {/* 매듭 끈 */}
      <rect x="34" y="52" width="52" height="9" rx="4.5" fill={c.cord} />
      <path d="M58 60 C50 74 44 80 40 92" stroke={c.cord} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M62 60 C70 74 76 80 80 92" stroke={c.cord} strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="40" cy="94" r="3.5" fill={c.cord} />
      <circle cx="80" cy="94" r="3.5" fill={c.cord} />
      {/* 福 */}
      <circle cx="60" cy="98" r="15" fill={c.cord} />
      <text x="60" y="104" textAnchor="middle" fontSize="17" fontWeight="800" fill={c.mark}>
        福
      </text>
    </svg>
  );
}
