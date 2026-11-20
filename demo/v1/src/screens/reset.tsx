import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { PasswordField } from "../components/PasswordField";
import { getSupabase, supabaseConfigured } from "../lib/supabase";
import { getAuthErrorMessage } from "../lib/errors";

export const SCREEN_ID = "reset";

// 메일의 재설정 링크로 도착하는 화면. 링크에 담긴 토큰으로 임시 세션이 만들어지고,
// 그 세션 상태에서 새 비밀번호를 저장한다.
export default function Reset() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [linkValid, setLinkValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) {
      setReady(true);
      return;
    }
    const supabase = getSupabase();

    // 링크의 토큰은 supabase-js가 주소에서 읽어 세션으로 바꿔준다. 그 처리가 끝나는
    // 시점이 렌더보다 늦을 수 있어 PASSWORD_RECOVERY 이벤트와 기존 세션을 함께 본다.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setLinkValid(true);
        setReady(true);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setLinkValid(true);
      setReady(true);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("비밀번호가 서로 달라요");
      return;
    }
    setLoading(true);
    try {
      const { error } = await getSupabase().auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
    } catch (err) {
      setError(getAuthErrorMessage(err, "비밀번호를 바꾸지 못했어요"));
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <AppShell>
        <p className="g-sub">확인하고 있어요...</p>
      </AppShell>
    );
  }

  if (done) {
    return (
      <AppShell>
        <div className="g-header">비밀번호 재설정</div>
        <h1 className="g-title">비밀번호를 바꿨어요</h1>
        <p className="g-sub">새 비밀번호로 로그인해주세요.</p>
        <button className="g-button" onClick={() => navigate("/")}>
          로그인하러 가기
        </button>
      </AppShell>
    );
  }

  // 링크 없이 주소로 직접 들어왔거나 링크가 만료된 경우 — 무엇을 해야 하는지 알려준다
  if (!linkValid) {
    return (
      <AppShell>
        <div className="g-header">비밀번호 재설정</div>
        <h1 className="g-title">이 링크는 쓸 수 없어요</h1>
        <p className="g-sub">
          링크 유효 시간이 지났거나 이미 쓴 링크예요. 재설정 메일을 다시 받아 주세요.
        </p>
        <button className="g-button" onClick={() => navigate("/forgot")}>
          재설정 메일 다시 받기
        </button>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="g-header">비밀번호 재설정</div>
      <h1 className="g-title">새 비밀번호를 정해주세요</h1>
      <p className="g-sub">8자 이상으로 입력해주세요.</p>
      <form onSubmit={handleSubmit}>
        <PasswordField
          label="새 비밀번호"
          value={password}
          onChange={setPassword}
          minLength={8}
          autoComplete="new-password"
        />
        <PasswordField
          label="새 비밀번호 확인"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        />
        {error && <p className="g-error">{error}</p>}
        <button className="g-button" type="submit" disabled={loading}>
          {loading ? "바꾸는 중..." : "비밀번호 바꾸기"}
        </button>
      </form>
    </AppShell>
  );
}
