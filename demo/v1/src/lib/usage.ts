import { getSupabase, supabaseConfigured } from "./supabase";
import { getStoredElderProfileId } from "./elderSession";
import { todaySeoul } from "./date";

// 사용 기록(usage_event) — 운세를 열었는지, "사주 더보기"를 눌렀는지.
// 체험 기간에는 자세히 보기를 열어 두고, 몇 명이 누르는지로 결제 근거를 만든다(2026-11-21 팀 결정).
// 내용 없이 "무엇을, 언제, 누가"만 남긴다. 같은 날 같은 기록은 한 번만(DB 고유 색인 + 이 기기 기억).
// 기록이 실패해도 어르신 화면에는 아무 영향이 없어야 한다 — 기다리지 않고, 오류도 보이지 않는다.

export type ElderUsageEvent = "fortune_open" | "saju_more_open";

export function logElderUsage(event: ElderUsageEvent): void {
  const elderId = getStoredElderProfileId();
  if (!supabaseConfigured || !elderId) return;
  const today = todaySeoul();
  const key = `callog.usage.${event}`;
  try {
    if (window.localStorage.getItem(key) === today) return;
  } catch {
    // 저장소를 못 읽으면 그냥 보낸다 — DB가 같은 날 두 번째 기록을 막는다
  }
  void getSupabase()
    .from("usage_event")
    .insert({ event, elder_profile_id: elderId, date: today })
    .then(({ error }) => {
      // 23505 = 같은 날 이미 남긴 기록(고유 색인) — 정상
      if (!error || error.code === "23505") {
        try {
          window.localStorage.setItem(key, today);
        } catch {
          // 다음에 한 번 더 보낼 뿐이다
        }
      }
    });
}
