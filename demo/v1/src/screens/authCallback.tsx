import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { getSupabase, supabaseConfigured } from "../lib/supabase";

export const SCREEN_ID = "authCallback";

// 구글 로그인에서 돌아오는 자리. 비밀번호 재설정 등 이메일 링크형 인증의 안전망이기도 하다.
//
// 돌아온 사람이 처음인지 아닌지를 여기서 가른다. 구글 로그인은 가입과 로그인이 같은
// 버튼이라, 어르신이 한 명도 없으면 등록 화면으로, 있으면 대상자 목록으로 보낸다.
// 이 판단을 안 하면 처음 온 보호자가 빈 목록만 보고 뭘 해야 할지 모른다.
export default function AuthCallback() {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    const supabase = getSupabase();

    async function route() {
      // supabase-js가 주소에 실려 온 세션을 처리할 시간을 준다. 바로 읽으면 아직 없을 수 있다.
      let session = null;
      for (let i = 0; i < 20 && !cancelled; i++) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          session = data.session;
          break;
        }
        await new Promise((r) => setTimeout(r, 150));
      }
      if (cancelled) return;
      if (!session) {
        setFailed(true);
        return;
      }
      // 어르신이 한 명이라도 있으면 돌아온 보호자다.
      const { data: elders, error } = await supabase.from("elder_profile").select("id").limit(1);
      if (cancelled) return;
      if (error) {
        navigate("/guardian", { replace: true });
        return;
      }
      if (elders && elders.length > 0) {
        navigate("/guardian", { replace: true });
      } else {
        navigate("/guardian/elders/new", { replace: true, state: { fromSignup: true } });
      }
    }

    route();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (failed) {
    return (
      <AppShell>
        <h1 className="g-title">로그인을 마치지 못했습니다</h1>
        <p className="g-sub">다시 시도해 주세요. 계속 안 되면 이메일로 로그인하셔도 됩니다.</p>
        <Link className="g-button" to="/">
          시작 화면으로
        </Link>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="g-title">로그인 중입니다</h1>
      <p className="g-sub">잠시만 기다려 주세요.</p>
    </AppShell>
  );
}
