import { useEffect, useState } from "react";
import { SpeakButton } from "./SpeakButton";
import { getStoredElderProfileId } from "../lib/elderSession";
import { supabaseConfigured } from "../lib/supabase";
import { fetchLatestFamilyMessage, markFamilyMessageRead, type FamilyMessageRow } from "../lib/familyMessages";
import { shortTime } from "../lib/shortTime";

// 어르신 화면의 "가족이 보낸 말" — 큰 글씨와 읽어주기. 최근 7일 안에 온 글이 없으면 아무것도 그리지 않는다.
export function FamilyMessageCard() {
  const [msg, setMsg] = useState<FamilyMessageRow | null>(null);

  useEffect(() => {
    const elderId = getStoredElderProfileId();
    if (!supabaseConfigured || !elderId) return;
    let alive = true;
    fetchLatestFamilyMessage(elderId).then((row) => {
      if (!alive || !row) return;
      setMsg(row);
      if (!row.read_at) markFamilyMessageRead(row.id);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!msg) return null;
  return (
    <section className="e-card e-family-msg" aria-label="가족이 보낸 말">
      <div className="e-card-head">
        <div className="e-card-label">가족이 보낸 말</div>
        {!msg.read_at && <span className="e-badge-new">새 글</span>}
      </div>
      <p className="e-family-msg-body">“{msg.body}”</p>
      <p className="e-family-msg-time">{shortTime(msg.created_at)}</p>
      <SpeakButton text={`가족이 보낸 말이에요. ${msg.body}`} />
    </section>
  );
}
