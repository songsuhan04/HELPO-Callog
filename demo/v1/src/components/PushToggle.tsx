import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  countAccountDevices,
  isSubscribed,
  needsHomeScreenInstall,
  pushConfigured,
  pushSupported,
  subscribeToPush,
  turnOffEverywhere,
} from "../lib/push";
import { getErrorMessage } from "../lib/errors";

// 보호자가 위험 알림을 받을지 직접 켜고 끈다.
// 위험도는 계산되고 있었지만 앱을 열어야만 알 수 있었던 문제를 메우는 UI.
//
// 켜짐·꺼짐은 이 기기가 아니라 계정 기준이다. 알림은 계정에 등록된 모든 기기로 가는데,
// 예전 버튼은 지금 기기만 보고 "꺼짐"이라고 해서, 끈 줄 알았는데 알림이 계속 왔다
// (2026-11-18 신고 — 한 계정에 아이폰 홈 화면 앱과 다른 기기 2대가 등록돼 있었다).
//  - 끄기: 이 계정의 모든 기기에서 끈다.
//  - 켜기: 이 기기를 등록한다.
//  - 다른 기기에서만 받는 중이면 그렇다고 알려 주고, 이 기기에서도 받을 수 있게 한다.
export function PushToggle() {
  const navigate = useNavigate();
  const [thisDevice, setThisDevice] = useState(false);
  const [devices, setDevices] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  async function refresh() {
    const [mine, count] = await Promise.all([
      pushSupported() ? isSubscribed() : Promise.resolve(false),
      countAccountDevices(),
    ]);
    setThisDevice(mine);
    setDevices(count);
  }

  useEffect(() => {
    if (!pushConfigured) {
      setReady(true);
      return;
    }
    refresh()
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  // 설정 자체가 안 됐으면 아무것도 보여주지 않는다. 이 브라우저가 알림을 지원하지 않아도
  // 다른 기기에서 받고 있으면 끌 수는 있어야 하므로 그때는 보여 준다.
  if (!ready || !pushConfigured) return null;
  if (!pushSupported() && devices === 0) return null;

  const on = devices > 0;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(getErrorMessage(err, "알림 설정을 바꾸지 못했습니다"));
    } finally {
      await refresh().catch(() => {});
      setBusy(false);
    }
  }

  const otherDevices = devices - (thisDevice ? 1 : 0);

  return (
    <div className="g-push">
      <button className="g-back" onClick={() => run(on ? turnOffEverywhere : subscribeToPush)} disabled={busy}>
        {busy ? "설정 중..." : on ? "위험 알림 켜짐" : "위험 알림 받기"}
      </button>
      {on && (
        <p className="g-push-hint">
          {thisDevice
            ? otherDevices > 0
              ? `이 기기와 다른 기기 ${otherDevices}대에서 받고 있어요. 누르면 모두 꺼져요.`
              : "이 기기에서 받고 있어요. 누르면 꺼져요."
            : `다른 기기 ${otherDevices}대에서 받고 있어요. 누르면 모두 꺼져요.`}
        </p>
      )}
      {on && !thisDevice && pushSupported() && !needsHomeScreenInstall() && (
        <button type="button" className="g-link" onClick={() => run(subscribeToPush)} disabled={busy}>
          이 기기에서도 받기
        </button>
      )}
      {needsHomeScreenInstall() && !thisDevice && (
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
