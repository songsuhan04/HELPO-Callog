import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { clearStoredElderProfileId, getStoredElderProfileId, touchElderDevice } from "../lib/elderSession";
import { supabaseConfigured } from "../lib/supabase";

// 어르신 화면 진입 확인 — 이 기기가 아직 어르신과 연결돼 있는가.
//
// 화면이 까매지던 문제(2026-11-19 기술 멘토링): 예전에는 화면을 넘길 때마다 서버에 묻고,
// 답이 올 때까지 아무것도 그리지 않았다(null). 바탕이 어두워서 그동안 검은 화면이 보였고,
// 처음 화면 → 안부 → 말하기 → 완료처럼 넘어갈 때마다 반복됐다.
// 이제는
//  - 이 탭에서 한 번 확인한 어르신이면 바로 그리고, 확인은 뒤에서 한다(끊겼으면 그때 처음 화면으로).
//  - 처음 확인하는 동안에도 빈 화면 대신 어르신 바탕을 그려 둔다.
//  - 통신 오류는 끊김으로 보지 않는다(lib/elderSession.ts touchElderDevice 참고).

/** 이 탭에서 연결을 확인한 어르신 id. 새로고침하면 다시 확인한다 */
let verifiedElderId: string | null = null;

function isDevPreview(): boolean {
  // DEV 전용 프리뷰 우회 — 초대 링크 없이 화면 레이아웃만 확인하기 위한 개발 편의 기능.
  // 실제 Supabase 호출은 그대로 실행되고 인증 에러도 그대로 보인다(가짜 데이터로 감추지 않음).
  return import.meta.env.DEV && new URLSearchParams(window.location.search).has("preview");
}

export function ElderRoute({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"checking" | "ok" | "denied">(() => {
    if (isDevPreview() || !supabaseConfigured) return "ok";
    const id = getStoredElderProfileId();
    if (!id) return "denied";
    return id === verifiedElderId ? "ok" : "checking";
  });

  useEffect(() => {
    if (isDevPreview() || !supabaseConfigured) return;
    const id = getStoredElderProfileId();
    if (!id) return;
    let alive = true;
    // 이미 그리고 있어도 매번 확인한다 — 마지막 접속 시각을 남기고, 끊긴 연결을 걸러낸다
    touchElderDevice().then((result) => {
      if (!alive) return;
      if (result === "revoked") {
        // 연결이 끊긴 뒤에도 남아 있는 값을 지워둬야 다음 방문에서 곧바로 걸러진다
        verifiedElderId = null;
        clearStoredElderProfileId();
        setStatus("denied");
        return;
      }
      if (result === "ok") verifiedElderId = id;
      setStatus("ok");
    });
    return () => {
      alive = false;
    };
  }, []);

  // 확인하는 동안에도 어르신 바탕은 그려 둔다 — 빈 화면이면 검게 깜빡인다
  if (status === "checking") return <div className="app-shell app-shell--elder" aria-busy="true" />;
  if (status === "denied") return <Navigate to="/" replace />;
  return <>{children}</>;
}
