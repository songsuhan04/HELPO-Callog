import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  isSubscribed,
  needsHomeScreenInstall,
  pushConfigured,
  pushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "../lib/push";
import { getErrorMessage } from "../lib/errors";

// 보호자가 위험 알림을 받을지 직접 켜고 끈다.
// 위험도는 계산되고 있었지만 앱을 열어야만 알 수 있었던 문제를 메우는 UI.
export function PushToggle() {
  const navigate = useNavigate();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!pushConfigured || !pushSupported()) {
      setReady(true);
      return;
    }
    isSubscribed()
      .then(setOn)
      .finally(() => setReady(true));
  }, []);

  // 설정 자체가 안 됐거나 브라우저가 지원하지 않으면 아무것도 보여주지 않는다
  if (!ready || !pushConfigured || !pushSupported()) return null;

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      if (on) {
        await unsubscribeFromPush();
        setOn(false);
      } else {
        await subscribeToPush();
        setOn(true);
      }
    } catch (err) {
      setError(getErrorMessage(err, "알림 설정을 바꾸지 못했습니다"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="g-push">
      <button className="g-back" onClick={toggle} disabled={busy}>
        {busy ? "설정 중..." : on ? "🔔 위험 알림 켜짐" : "🔕 위험 알림 받기"}
      </button>
      {needsHomeScreenInstall() && !on && (
        <p className="g-push-hint">아이폰은 공유 → "홈 화면에 추가" 후에 알림을 켤 수 있어요.</p>
      )}
      {error && (
        <>
          <p className="g-push-hint g-push-hint--error">{error}</p>
          {/* 문구만으로는 어디를 눌러야 하는지 알 수 없다. 기기별 안내로 바로 보낸다. */}
          <button type="button" className="g-link" onClick={() => navigate("/guide")}>
            어떻게 하면 되나요?
          </button>
        </>
      )}
    </div>
  );
}
