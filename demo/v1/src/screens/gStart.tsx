import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { GoogleButton } from "../components/GoogleButton";
import { PasswordField } from "../components/PasswordField";
import { getSupabase, supabaseConfigured } from "../lib/supabase";
import { getAuthErrorMessage } from "../lib/errors";

export const SCREEN_ID = "gStart";

export default function GStart() {
  const navigate = useNavigate();
  const location = useLocation();
  // 가입 화면에서 "이미 가입된 이메일"을 만나 넘어온 경우엔 곧바로 로그인 폼을 연다
  const [mode, setMode] = useState<"choose" | "login">(
    (location.state as { login?: boolean } | null)?.login ? "login" : "choose"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [autoLogin, setAutoLogin] = useState(() => window.localStorage.getItem("callog.autoLogin") !== "false");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toggleAutoLogin(checked: boolean) {
    setAutoLogin(checked);
    window.localStorage.setItem("callog.autoLogin", String(checked));
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error } = await getSupabase().auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate("/guardian");
    } catch (err) {
      setError(getAuthErrorMessage(err, "로그인에 실패했습니다"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <img
        src="/callog-icon.png"
        alt="Callog(콜록)"
        width={64}
        height={64}
        style={{ borderRadius: 16, marginBottom: 16, display: "block" }}
      />
      <div className="g-header">Callog(콜록)</div>
      <h1 className="g-title">보호자로 시작하기</h1>
      <p className="g-sub">어르신을 등록하고 초대하면, 어르신은 링크만 한 번 누르면 됩니다.</p>

      {mode === "choose" && (
        <>
          <GoogleButton />
          <p className="g-consent-note">
            계속하면 <a href="/terms" target="_blank" rel="noreferrer">이용약관 및 개인정보 처리 안내</a>에 동의하는 것으로 봅니다.
          </p>
          <div className="g-or">또는</div>
          <button className="g-button g-button--secondary" onClick={() => navigate("/signup")}>
            이메일로 계정 만들기
          </button>
          <button className="g-button g-button--secondary" onClick={() => setMode("login")}>
            이메일로 로그인
          </button>
        </>
      )}

      {mode === "login" && (
        <form onSubmit={handleLogin}>
          <div className="g-field">
            <label>이메일</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={!supabaseConfigured} />
          </div>
          <PasswordField
            label="비밀번호"
            value={password}
            onChange={setPassword}
            disabled={!supabaseConfigured}
            autoComplete="current-password"
          />
          <label className="g-check" style={{ marginBottom: 16 }}>
            <input type="checkbox" checked={autoLogin} onChange={(e) => toggleAutoLogin(e.target.checked)} />
            로그인 상태 유지
          </label>
          {error && <p className="g-error">{error}</p>}
          <button className="g-button" type="submit" disabled={loading || !supabaseConfigured}>
            {loading ? "로그인 중..." : "로그인"}
          </button>
          {/* 비밀번호를 잊으면 들어갈 방법이 전혀 없었다 — 로그인이 안 되면 탈퇴도 못 한다 */}
          <button type="button" className="g-link g-link--center" onClick={() => navigate("/forgot")}>
            비밀번호를 잊으셨나요?
          </button>
          <button type="button" className="g-button g-button--secondary" onClick={() => setMode("choose")}>
            뒤로
          </button>
        </form>
      )}

      <a href="/terms" target="_blank" rel="noreferrer" className="g-link g-link--block">
        이용약관 및 개인정보 처리 안내
      </a>
    </AppShell>
  );
}
