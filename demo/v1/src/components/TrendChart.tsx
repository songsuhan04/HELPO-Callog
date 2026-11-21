import { useId } from "react";
import type { RiskLevel } from "../config/riskConstants";

// 기능설계서.md §1 "꺾은선 그래프 기록" — 최근 위험도 추이를 가벼운 인라인 SVG로 시각화한다.
// 차트 라이브러리를 새로 추가하지 않고 직접 그리는 이유: 점 개수가 최대 14개뿐이라
// 굳이 무거운 의존성을 늘릴 필요가 없음.
//
// 선만 그리면 "올라갔다"는 사실이 눈에 안 들어와서, 선 아래를 옅게 채우고
// 마지막 점(=오늘)만 등급 색으로 크게 찍어 시선이 먼저 가게 했다.
const LEVEL_Y: Record<RiskLevel, number> = { 안전: 0, 위험: 1, 심각: 2 };
const LEVEL_COLOR: Record<RiskLevel, string> = {
  안전: "var(--safe)",
  위험: "var(--warn)",
  심각: "var(--crit)",
};
const LEVELS: RiskLevel[] = ["안전", "위험", "심각"];

export interface TrendPoint {
  date: string; // yyyy-mm-dd
  level: RiskLevel | null; // null = 그날 기록 없음(결측)
}

const WIDTH = 320;
const HEIGHT = 128;
const PAD_L = 34; // 왼쪽 등급 이름 자리
const PAD_R = 12;
const PAD_Y = 16;
const BASE_Y = HEIGHT - 18; // 면 채우기의 바닥 + 날짜 라벨 자리

export function TrendChart({ points }: { points: TrendPoint[] }) {
  const gradientId = useId();
  if (points.length === 0) return null;

  const innerW = WIDTH - PAD_L - PAD_R;
  const innerH = HEIGHT - PAD_Y - 28;
  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;
  const xFor = (i: number) => PAD_L + stepX * i;
  const yFor = (level: RiskLevel) => PAD_Y + innerH - (LEVEL_Y[level] / 2) * innerH;

  // 결측일(그날 안부 기록 없음)까지 억지로 잇지 않고, 연속된 구간끼리만 선을 그린다
  const segments: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  points.forEach((p, i) => {
    if (p.level) {
      current.push({ x: xFor(i), y: yFor(p.level) });
    } else if (current.length) {
      segments.push(current);
      current = [];
    }
  });
  if (current.length) segments.push(current);

  const lastIndex = points.map((p) => Boolean(p.level)).lastIndexOf(true);
  const last = lastIndex >= 0 ? points[lastIndex] : null;

  return (
    <svg className="g-trend" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={describe(points)}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.42" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {LEVELS.map((level) => (
        <g key={level}>
          <line x1={PAD_L} x2={WIDTH - PAD_R} y1={yFor(level)} y2={yFor(level)} stroke="var(--line)" strokeWidth={1} />
          <text x={0} y={yFor(level) + 3} fontSize={9} fill="var(--text-3)">
            {level}
          </text>
        </g>
      ))}

      {segments.map((seg, si) => (
        <path
          key={`a${si}`}
          d={`M${seg[0].x} ${BASE_Y} ${seg.map((p) => `L${p.x} ${p.y}`).join(" ")} L${seg[seg.length - 1].x} ${BASE_Y} Z`}
          fill={`url(#${gradientId})`}
        />
      ))}

      {segments.map((seg, si) => (
        <polyline
          key={`l${si}`}
          points={seg.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="var(--primary-hi)"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {points.map(
        (p, i) =>
          p.level &&
          i !== lastIndex && <circle key={`d${i}`} cx={xFor(i)} cy={yFor(p.level)} r={3} fill={LEVEL_COLOR[p.level]} />
      )}

      {last?.level && (
        <circle
          cx={xFor(lastIndex)}
          cy={yFor(last.level)}
          r={4.8}
          fill="var(--surface)"
          stroke={LEVEL_COLOR[last.level]}
          strokeWidth={2.6}
        />
      )}

      {points.map((p, i) => {
        if (points.length > 7 && i % 2 !== 0 && i !== points.length - 1) return null;
        // "오늘" 바로 앞 날짜는 붙어서 "11/20오늘"처럼 겹친다
        if (points.length > 7 && i === points.length - 2) return null;
        const label = i === points.length - 1 ? "오늘" : `${Number(p.date.slice(5, 7))}/${Number(p.date.slice(8, 10))}`;
        return (
          <text key={`t${i}`} x={xFor(i)} y={HEIGHT - 2} fontSize={9} fill="var(--text-3)" textAnchor="middle">
            {label}
          </text>
        );
      })}
    </svg>
  );
}

// 그래프를 못 보는 경우에도 추이를 알 수 있어야 한다
function describe(points: TrendPoint[]): string {
  const recorded = points.filter((p) => p.level);
  if (recorded.length === 0) return "최근 위험도 기록이 없어요.";
  const counts = LEVELS.map((level) => `${level} ${recorded.filter((p) => p.level === level).length}일`);
  return `최근 ${points.length}일 중 ${recorded.length}일 기록 — ${counts.join(", ")}. 가장 최근은 ${
    recorded[recorded.length - 1].level
  }.`;
}
