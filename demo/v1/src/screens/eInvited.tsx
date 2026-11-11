import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { DisplaySettings } from "../components/DisplaySettings";
import { SpeakButton } from "../components/SpeakButton";
import { redeemInvite } from "../lib/elderSession";
import { supabaseConfigured } from "../lib/supabase";
import { getRpcErrorMessage } from "../lib/errors";
import { detectInApp } from "../lib/inAppBrowser";
import { InAppBrowserNotice } from "../components/InAppBrowserNotice";

export const SCREEN_ID = "eInvited";

export default function EInvited() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // 렌더마다 다시 읽지 않도록 한 번만 판정한다
  const [inApp] = useState(detectInApp);

  useEffect(() => {
    if (!supabaseConfigured || !token) {
      setLoading(false);
      return;
    }
    // 인앱 브라우저에서는 초대를 받지 않는다. 여기가 이 화면에서 제일 중요한 줄이다.
    //
    // redeem_invite는 링크를 '처음 연 브라우저'에 어르신을 묶는다(기기 표식과 익명 세션이
    // 모두 그 브라우저의 localStorage에 있다). 카톡 안에서 받아버리면 카톡 저장소에 묶이고,
    // 그 다음 크롬으로 나가는 순간 저장소가 달라서 bound_to_other_device로 영영 막힌다.
    // 보호자가 링크를 새로 발급하기 전에는 어르신 혼자서는 풀 수 없다.
    //
    // 그래서 '나간 다음에' 받게 한다. 어르신이 계속 쓰실 브라우저에 묶여야 한다.
    if (inApp) {
      setLoading(false);
      return;
    }
    redeemInvite(token)
      .then((result) => setName(result.name))
      .catch((err) => setError(getRpcErrorMessage(err, "연결에 실패했습니다")))
      .finally(() => setLoading(false));
  }, [token, inApp]);

  const message = inApp
    ? "조금만 더 하시면 돼요"
    : name
      ? `${name}님, 초대를 받으셨어요`
      : "초대를 확인하고 있어요";

  return (
    <AppShell variant="elder">
      <div className="e-topbar">
        <DisplaySettings />
        <span className="e-brand">Callog</span>
      </div>
      <div className="e-hero">
        <img src="/callog-icon.png" alt="Callog(콜록)" width={64} height={64} style={{ borderRadius: 16, margin: "0 auto 10px" }} />
        <h1 className="e-question">{message}</h1>
        <p className="e-lead">하루에 한 번, 잘 지내시는지 짧게 여쭐게요.</p>
        {loading && !inApp && <p className="e-meta">확인 중...</p>}
        {error && <p className="e-error">{error}</p>}
      </div>

      {inApp ? (
        // 이 화면은 주소에 초대 토큰이 있어서 내보내도 안전하다 — 오히려 받기 전에 나가야 한다.
        // 읽어주기도 여기서는 안 되므로 SpeakButton은 띄우지 않는다. 누르면 빨간 글씨만 는다.
        <InAppBrowserNotice allowEscape />
      ) : (
        <>
          <SpeakButton text={message + ". 하루에 한 번, 잘 지내시는지 짧게 여쭐게요."} />
          <button className="e-primary" disabled={loading || !!error} onClick={() => navigate("/elder/home")}>
            시작하기
          </button>
        </>
      )}
    </AppShell>
  );
}
