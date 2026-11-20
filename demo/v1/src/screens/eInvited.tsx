import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { ElderTopBar } from "../components/ElderTopBar";
import { SpeakButton } from "../components/SpeakButton";
import { getStoredElderProfileId, redeemInvite } from "../lib/elderSession";
import { getSupabase, supabaseConfigured } from "../lib/supabase";
import { todaySeoul } from "../lib/date";
import { isAnswered } from "../lib/checkin";
import { getRpcErrorMessage } from "../lib/errors";
import { detectInApp } from "../lib/inAppBrowser";
import { InAppBrowserNotice } from "../components/InAppBrowserNotice";

export const SCREEN_ID = "eInvited";

// 어르신은 매일 이 초대 링크(홈 화면 바로가기도 이 주소)로 앱을 연다. 예전에는 열 때마다
// "초대를 받으셨어요 → 시작하기 → 처음 화면 → 안부 시작하기"를 거쳐야 첫 질문이 나왔다.
// "시작하기가 꼭 필요한가"라는 지적(3회차 기술 멘토링, 2026-11-19)에 따라
//  - 이미 이 기기에 연결된 어르신이면 이 화면을 건너뛰고, 오늘 안부를 안 했으면 바로 첫 질문,
//    했으면 처음 화면으로 간다.
//  - 처음 연결하는 날만 인사를 한 번 보여 주고, 버튼을 누르면 바로 첫 질문으로 간다.
async function answeredToday(elderProfileId: string): Promise<boolean> {
  const { data } = await getSupabase()
    .from("daily_checkin")
    .select("answers,skipped")
    .eq("elder_profile_id", elderProfileId)
    .eq("date", todaySeoul())
    .maybeSingle();
  return isAnswered(data);
}

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
    // 링크를 열기 전부터 이 기기에 같은 어르신이 연결돼 있었으면 '다시 여는 날'이다
    const linkedBefore = getStoredElderProfileId();
    redeemInvite(token)
      .then(async (result) => {
        if (linkedBefore && linkedBefore === result.elderProfileId) {
          const done = await answeredToday(result.elderProfileId).catch(() => true);
          navigate(done ? "/elder/home" : "/elder/check", { replace: true });
          return;
        }
        setName(result.name);
        setLoading(false);
      })
      .catch((err) => {
        setError(getRpcErrorMessage(err, "연결에 실패했습니다"));
        setLoading(false);
      });
  }, [token, inApp, navigate]);

  const message = inApp
    ? "조금만 더 하시면 돼요"
    : name
      ? `${name}님 반가워요`
      : "초대를 확인하고 있어요";

  return (
    <AppShell variant="elder">
      <ElderTopBar brand />
      <div className="e-hero">
        <h1 className="e-question">{message}</h1>
        <p className="e-lead">하루에 한 번 잘 지내시는지 짧게 여쭐게요.</p>
        {loading && !inApp && <p className="e-meta">확인 중...</p>}
        {error && <p className="e-error">{error}</p>}
      </div>

      {inApp ? (
        // 이 화면은 주소에 초대 토큰이 있어서 내보내도 안전하다 — 오히려 받기 전에 나가야 한다.
        // 읽어주기도 여기서는 안 되므로 SpeakButton은 띄우지 않는다. 누르면 빨간 글씨만 는다.
        <InAppBrowserNotice allowEscape />
      ) : (
        <>
          <SpeakButton text={message + ". 하루에 한 번 잘 지내시는지 짧게 여쭐게요."} />
          <button className="e-primary" disabled={loading || !!error} onClick={() => navigate("/elder/check", { replace: true })}>
            오늘 안부 시작하기
          </button>
        </>
      )}
    </AppShell>
  );
}
