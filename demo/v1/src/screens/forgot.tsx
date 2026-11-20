import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { BackButton } from "../components/BackButton";
import { getSupabase, supabaseConfigured } from "../lib/supabase";
import { getAuthErrorMessage } from "../lib/errors";

export const SCREEN_ID = "forgot";

// 비밀번호 재설정 요청 — 비밀번호를 잊으면 들어갈 방법이 전혀 없던 문제를 해결한다.
// 로그인이 안 되면 탈퇴도 못 하므로(탈퇴에 로그인이 필요) 사용자가 스스로 복구할 수단이 없었다.
export default function Forgot() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
        // 메일의 링크를 누르면 이 주소로 돌아오고, 거기서 새 비밀번호를 정한다.
        // ⚠️ Supabase 대시보드의 Authentication → URL Configuration에 이 주소가
        // 허용 목록으로 등록돼 있어야 링크가 동작한다.
        redirectTo: `${window.location.origin}/reset`,
      });
      if (error) throw error;
      // 가입되지 않은 이메일이어도 성공으로 응답한다(계정 존재 여부를 노출하지 않기 위함) —
      // 그래서 안내 문구도 "가입된 이메일이라면"으로 적는다.
      setSent(true);
    } catch (err) {
      setError(getAuthErrorMessage(err, "메일을 보내지 못했어요"));
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <AppShell>
        <BackButton to="/" />
        <div className="g-header">비밀번호 재설정</div>
        <h1 className="g-title">메일을 보냈어요</h1>
        <p className="g-sub">
          가입된 이메일이라면 <strong>{email}</strong> 으로 재설정 링크가 가요. 메일함(스팸함도 함께)을 확인해
          링크를 눌러 주세요. 링크는 시간이 지나면 쓸 수 없어요.
        </p>
        <button className="g-button g-button--secondary" onClick={() => setSent(false)}>
          다른 이메일로 다시 보내기
        </button>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <BackButton to="/" />
      <div className="g-header">비밀번호 재설정</div>
      <h1 className="g-title">가입하신 이메일을 알려주세요</h1>
      <p className="g-sub">그 주소로 비밀번호를 새로 정하는 링크를 보내 드려요.</p>
      <form onSubmit={handleSubmit}>
        <div className="g-field">
          <label>이메일</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            disabled={!supabaseConfigured}
          />
        </div>
        {error && <p className="g-error">{error}</p>}
        <button className="g-button" type="submit" disabled={loading || !supabaseConfigured}>
          {loading ? "보내는 중..." : "재설정 링크 받기"}
        </button>
      </form>
    </AppShell>
  );
}
