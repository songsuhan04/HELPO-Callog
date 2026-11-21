import { useEffect, useState } from "react";
import { getSupabase, supabaseConfigured } from "../lib/supabase";

// 보호자 화면 — 체험 기간 안내와 신년운세 관심 표시.
//
// 체험 기간에는 모든 기능을 무료로 열어 두고, 나중에 유료로 바뀌어도 매일 안부·위험 알림·매일
// 운세는 계속 무료라는 걸 처음부터 알린다(2026-11-21 팀 결정). 나중에 "쓰던 걸 빼앗긴다"는
// 느낌을 줄이려는 것. 어르신 화면에는 두지 않는다 — 어르신께 무료·유료 이야기는 혼란만 준다.
//
// 신년운세 버튼은 결제가 아니라 관심 재기다. 누른 보호자 수가 "자녀가 부모님께 운세를 선물할
// 의향"의 근거가 된다. 불안을 파는 문구("나쁜 운을 막으려면…")는 쓰지 않는다.
export function TrialNotice() {
  const [interested, setInterested] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) return;
    let alive = true;
    (async () => {
      const supabase = getSupabase();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data } = await supabase
        .from("usage_event")
        .select("id")
        .eq("event", "newyear_interest")
        .eq("family_account_id", userData.user.id)
        .maybeSingle();
      if (alive) setInterested(Boolean(data));
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function markInterest() {
    if (!supabaseConfigured || busy) return;
    setBusy(true);
    const supabase = getSupabase();
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      const { error } = await supabase
        .from("usage_event")
        .insert({ event: "newyear_interest", family_account_id: userData.user.id });
      // 23505 = 이미 신청함
      if (!error || error.code === "23505") setInterested(true);
    }
    setBusy(false);
  }

  return (
    <div className="g-card g-section">
      <div className="g-card-title">
        <span>체험 기간 안내</span>
      </div>
      <p className="g-trial-lead">지금은 체험 기간이라 모든 기능이 무료로 열려 있어요.</p>
      <p className="g-sub" style={{ margin: "0 0 16px" }}>
        나중에 유료로 바뀌어도 매일 안부, 위험 알림, 매일 운세는 계속 무료예요.
      </p>
      <p className="g-trial-lead">2027 신년운세를 부모님께 선물하고 싶으신가요?</p>
      {interested ? (
        <p className="g-sub" style={{ margin: 0 }}>
          신청하셨어요. 출시되면 알려 드릴게요.
        </p>
      ) : (
        <button type="button" className="g-button g-button--secondary" onClick={markInterest} disabled={busy}>
          {busy ? "신청하고 있어요..." : "출시되면 알려 주세요"}
        </button>
      )}
    </div>
  );
}
