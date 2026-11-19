import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { getSupabase, supabaseConfigured } from "../lib/supabase";

// 보호자 화면 진입 확인. 어르신 쪽(ElderRoute)과 같은 이유로, 이 탭에서 한 번 확인했으면
// 화면을 넘길 때 비워 두지 않고 바로 그린다(확인은 뒤에서 다시 한다).

/** 이 탭에서 보호자 로그인을 확인했는가. 로그아웃하면 바로 잊는다 */
let verifiedGuardian = false;
let listening = false;

function forgetOnSignOut() {
  if (listening) return;
  listening = true;
  getSupabase().auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") verifiedGuardian = false;
  });
}

export function GuardianRoute({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"checking" | "ok" | "denied">(() =>
    !supabaseConfigured || verifiedGuardian ? "ok" : "checking"
  );

  useEffect(() => {
    if (!supabaseConfigured) return; // 배너로 이미 안내되므로 라우트 자체는 막지 않음(스모크 테스트 목적)
    forgetOnSignOut();
    let alive = true;
    getSupabase()
      .auth.getSession()
      .then(({ data }) => {
        if (!alive) return;
        const session = data.session;
        // 익명 세션(어르신용)은 보호자 화면 접근 권한이 없음
        verifiedGuardian = Boolean(session && !session.user.is_anonymous);
        setStatus(verifiedGuardian ? "ok" : "denied");
      });
    return () => {
      alive = false;
    };
  }, []);

  if (status === "checking") return <div className="app-shell" aria-busy="true" />;
  if (status === "denied") return <Navigate to="/" replace />;
  return <>{children}</>;
}
