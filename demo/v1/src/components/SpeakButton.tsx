import { useEffect, useState } from "react";
import { speak, speakFailureMessage, stopSpeaking, type SpeakFailure } from "../lib/tts";
import { detectInApp } from "../lib/inAppBrowser";
import { InAppBrowserNotice } from "./InAppBrowserNotice";

// "AI 거부감 해소" 목적의 TTS 읽어주기 버튼 — 모든 어르신 화면에 배치.
//
// 예전에는 눌러도 아무 반응이 없으면 왜 안 되는지 알 수 없었다. 지금은
// ① 읽는 중임을 버튼에 표시하고 ② 한 번 더 누르면 멈추며 ③ 실패하면 이유를 보여준다.
export function SpeakButton({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false);
  const [failure, setFailure] = useState<SpeakFailure | null>(null);

  // 화면을 벗어나면 읽던 것을 멈춘다 — 다음 화면까지 계속 읽으면 혼란스럽다
  useEffect(() => stopSpeaking, []);

  function handleClick() {
    setFailure(null);
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    speak(text, {
      onFailure: (reason) => setFailure(reason),
      onEnd: () => setSpeaking(false),
    });
  }

  return (
    <>
      <button type="button" className="e-speak" onClick={handleClick}>
        {speaking ? "■ 그만 듣기" : "🔈 읽어주기"}
      </button>
      {/* 인앱 브라우저에는 speechSynthesis 자체가 없다. "지원하지 않아요"라는 빨간 글씨만
          남기면 어르신이 하실 수 있는 게 없으므로, 나가는 길을 바로 보여준다. */}
      {failure === "unsupported" && detectInApp() ? (
        <InAppBrowserNotice reason="읽어주기는" />
      ) : (
        failure && <p className="e-error">{speakFailureMessage(failure)}</p>
      )}
    </>
  );
}
