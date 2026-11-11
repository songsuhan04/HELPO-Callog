import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { BackButton } from "../components/BackButton";
import { getSupabase, supabaseConfigured } from "../lib/supabase";
import { getRpcErrorMessage } from "../lib/errors";
import { formatPhone } from "../lib/phone";

export const SCREEN_ID = "invite";

export default function Invite() {
  const { elderId } = useParams<{ elderId: string }>();
  const navigate = useNavigate();
  const [link, setLink] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }
    getSupabase()
      .rpc("create_invite", { p_elder: elderId })
      .then(({ data, error }) => {
        if (error) setError(getRpcErrorMessage(error, "초대 링크 생성에 실패했습니다"));
        else setLink(`${window.location.origin}/e/${data as string}`);
        setLoading(false);
      });
  }, [elderId]);

  function copy() {
    if (link) navigator.clipboard.writeText(link);
  }

  const smsHref = link ? `sms:${phone}?&body=${encodeURIComponent(`Callog 초대: ${link}`)}` : undefined;

  return (
    <AppShell>
      <BackButton />
      <div className="g-header">초대</div>
      <h1 className="g-title">어르신께 링크를 보내세요</h1>
      <p className="g-sub">어르신은 이 링크만 한 번 누르면 됩니다.</p>
      {/* 카톡으로 보내면 어르신이 카톡 인앱 브라우저로 여신다. 거기서는 읽어주기도 설치도
          알림도 되지 않고, 초대가 카톡 저장소에 묶여서 나중에 크롬으로 옮기면 연결이 끊긴다.
          문자로 보낸 링크는 기본 브라우저에서 열리므로 그 문제가 통째로 없다.
          근거: 실사용 — 갤럭시 카톡에서 읽어주기 실패·로딩 멈춤이 확인됐다. */}
      <p className="g-note">
        <b>카카오톡보다 문자로 보내주세요.</b> 카톡으로 보내면 어르신이 카톡 안에서 열게 되는데,
        거기서는 읽어주기와 알림이 되지 않습니다.
      </p>

      {loading && <p className="g-sub">링크 생성 중...</p>}
      {error && <p className="g-error">{error}</p>}

      {link && (
        <>
          <div className="g-field">
            <label>초대 링크</label>
            <input value={link} readOnly />
          </div>
          <button className="g-button g-button--secondary" onClick={copy}>
            링크 복사
          </button>

          <div className="g-field" style={{ marginTop: 16 }}>
            <label>어르신 전화번호 (문자로 보내기)</label>
            <input value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} placeholder="010-0000-0000" maxLength={13} />
          </div>
          <a className="g-button" href={smsHref}>
            문자로 보내기
          </a>

          <button
            className="g-button g-button--secondary"
            style={{ marginTop: 16 }}
            onClick={() => navigate("/guardian/elders/new")}
          >
            어르신 추가
          </button>
          <button className="g-button" onClick={() => navigate("/guardian")}>
            완료 — 대상자 목록으로
          </button>
          {/* 링크를 보낸 직후가 "이제 뭘 하지?"가 자연스러운 순간이다 */}
          <button type="button" className="g-link g-link--block" onClick={() => navigate("/guide")}>
            알림은 어떻게 받나요? — 사용 안내
          </button>
        </>
      )}
    </AppShell>
  );
}
