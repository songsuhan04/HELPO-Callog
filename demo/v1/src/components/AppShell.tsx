import { useEffect, type ReactNode } from "react";
import { supabaseConfigured } from "../lib/supabase";
import { clearElderDisplay, restoreElderDisplay } from "../lib/elderDisplay";
import { clearGuardianDisplay, restoreGuardianDisplay } from "../lib/guardianDisplay";
import { GuardianDisplaySettings } from "./GuardianDisplaySettings";

interface AppShellProps {
  variant?: "guardian" | "elder";
  /**
   * 넓은 화면에서 왼쪽 사이드바에 놓을 것. 넘기면 폼용 좁은 카드 대신
   * 모니터 폭을 쓰는 대시보드 레이아웃이 된다(대상자 목록·상세·관리자 화면).
   * 입력 폼은 넓힐수록 읽기 어려우므로 넘기지 않는다.
   */
  aside?: ReactNode;
  children: ReactNode;
}

export function AppShell({ variant = "guardian", aside, children }: AppShellProps) {
  // 어르신이 고른 바탕/글씨 크기는 어르신 화면에서만, 보호자가 고른 것은 보호자
  // 화면에서만 적용한다. 같은 기기에서 두 화면을 오갈 때 서로의 설정이 섞이면 안 된다.
  useEffect(() => {
    if (variant === "elder") {
      clearGuardianDisplay();
      restoreElderDisplay();
    } else {
      clearElderDisplay();
      restoreGuardianDisplay();
    }
  }, [variant]);

  const banner = !supabaseConfigured ? (
    <div className="env-banner">Supabase 환경변수가 설정되지 않았어요</div>
  ) : null;

  if (variant === "elder") {
    return (
      <div className="app-shell app-shell--elder">
        {banner}
        <div className="app-card app-card--elder">{children}</div>
      </div>
    );
  }

  if (aside) {
    return (
      <div className="app-shell app-shell--wide">
        {banner}
        <div className="g-layout">
          <aside className="g-aside">{aside}</aside>
          <main className="g-main">
            <div className="g-main-inner">
              <div className="g-topbar">
                <GuardianDisplaySettings />
              </div>
              {children}
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {banner}
      <div className="g-topbar">
        <GuardianDisplaySettings />
      </div>
      <div className="app-card">{children}</div>
    </div>
  );
}
