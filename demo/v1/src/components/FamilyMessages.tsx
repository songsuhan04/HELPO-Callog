import { useEffect, useState } from "react";
import { getSupabase } from "../lib/supabase";
import { FAMILY_MESSAGE_MAX, FAMILY_MESSAGE_SHOW_DAYS, familyMessageError, type FamilyMessageRow } from "../lib/familyMessages";
import { shortTime } from "../lib/shortTime";

// 보호자 상세 화면의 "가족 한마디" — 어르신 처음 화면에 큰 글씨로 떠요. 읽으셨는지도 보인다.
// 영상편지 대신 글로: 보내는 쪽도 받는 쪽도 부담이 없게(2026-11-23).

const EXAMPLES = ["이번 주말에 갈게요", "약 잘 챙겨 드세요", "오늘도 고마워요, 엄마"];

export function FamilyMessages({ elderId }: { elderId: string }) {
  const [rows, setRows] = useState<FamilyMessageRow[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    getSupabase()
      .from("family_message")
      .select("id,body,created_at,read_at")
      .eq("elder_profile_id", elderId)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        // 표가 아직 없거나 읽지 못하면 이 칸을 숨긴다 — 상세 화면의 다른 내용은 그대로
        if (error) setRows(null);
        else setRows((data ?? []) as FamilyMessageRow[]);
      });
  }, [elderId]);

  if (rows === null) return null;
  const trimmed = text.trim();

  async function send() {
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    setSent(false);
    const { data, error } = await getSupabase()
      .from("family_message")
      .insert({ elder_profile_id: elderId, body: trimmed })
      .select("id,body,created_at,read_at")
      .single();
    setBusy(false);
    if (error || !data) {
      setError(familyMessageError(error?.message));
      return;
    }
    setRows((prev) => [data as FamilyMessageRow, ...(prev ?? [])].slice(0, 5));
    setText("");
    setSent(true);
  }

  async function remove(row: FamilyMessageRow) {
    if (!window.confirm(`"${row.body}" 한마디를 지울까요? 어르신 화면에서도 사라져요.`)) return;
    const { error } = await getSupabase().from("family_message").delete().eq("id", row.id);
    if (error) {
      setError("지우지 못했어요. 잠시 뒤 다시 해 주세요.");
      return;
    }
    setRows((prev) => (prev ?? []).filter((r) => r.id !== row.id));
  }

  return (
    <div className="g-card g-section">
      <div className="g-card-title">
        <span>가족 한마디</span>
      </div>
      <p className="g-sub u-m0 u-mb12">
        어르신 처음 화면에 큰 글씨로 보여 드리고, 읽어주기로 들려 드려요. 최근 {FAMILY_MESSAGE_SHOW_DAYS}일 안의 가장 최근 글이 보여요.
      </p>
      <div className="g-field u-mb8">
        <label htmlFor="fm-text">
          한마디 ({trimmed.length}/{FAMILY_MESSAGE_MAX}자)
        </label>
        <input
          id="fm-text"
          value={text}
          maxLength={FAMILY_MESSAGE_MAX}
          onChange={(e) => {
            setText(e.target.value);
            setSent(false);
          }}
          placeholder="예: 이번 주말에 갈게요"
        />
      </div>
      <div className="g-fq-examples" aria-label="예시">
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" className="g-fq-example" onClick={() => setText(ex)}>
            {ex}
          </button>
        ))}
      </div>
      <button type="button" className="g-button g-button--secondary" onClick={send} disabled={busy || !trimmed}>
        {busy ? "보내는 중..." : "보내기"}
      </button>
      {sent && <p className="g-hint">보냈어요. 어르신이 앱을 열면 바로 보여요.</p>}
      {error && <p className="g-error">{error}</p>}

      {rows.length > 0 && (
        <div className="u-mt16">
          {rows.map((row) => (
            <div key={row.id} className="g-fq-item">
              <div className="g-fq-body">
                <div className="g-fq-question">{row.body}</div>
                <div className="g-fq-meta">
                  {shortTime(row.created_at)} 보냄 ·{" "}
                  {row.read_at ? <b className="g-fm-read">{shortTime(row.read_at)} 읽으셨어요</b> : "아직 안 읽으셨어요"}
                </div>
              </div>
              <button type="button" className="g-rowaction g-rowaction--danger" onClick={() => remove(row)}>
                삭제
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
