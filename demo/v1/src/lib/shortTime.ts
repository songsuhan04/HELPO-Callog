import { shiftDateString, todaySeoul } from "./date";

// "2026. 11. 21. 오후 5:40:00" 대신 "오늘 오후 5:40", "어제 오전 9:12", "11월 18일 오후 3:05"
export function shortTime(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Seoul" });
  const day = d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  const today = todaySeoul();
  if (day === today) return `오늘 ${time}`;
  if (day === shiftDateString(today, -1)) return `어제 ${time}`;
  const [, m, dd] = day.split("-").map(Number);
  return `${m}월 ${dd}일 ${time}`;
}
