import type { RiskLevel } from "../config/riskConstants";

// 색은 guardian.css의 .g-dot--안전/위험/심각
export function RiskDot({ level }: { level: RiskLevel }) {
  return <span className={`g-dot g-dot--${level}`} aria-hidden="true" />;
}

// 색맹·저조도에서 점 하나만으로는 등급이 구분되지 않는다. 등급 글자를 함께 내보내는 배지.
export function RiskPill({ level }: { level: RiskLevel }) {
  return <span className={`g-pill g-pill--${level}`}>{level}</span>;
}
