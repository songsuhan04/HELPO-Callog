import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { ElderTopBar } from "../components/ElderTopBar";
import { SpeakButton } from "../components/SpeakButton";
import { createTestBlob, startRecording, type RecordingHandle } from "../lib/recorder";
import { extensionForBlob } from "../lib/mediaType";
import { uploadToBucket } from "../lib/storage";
import { getStoredElderProfileId } from "../lib/elderSession";
import { getSupabase, supabaseConfigured } from "../lib/supabase";
import { RecordingNotice } from "../components/RecordingNotice";
import { ELDER_LETTER_TOPICS } from "../lib/topics";
import { useDailyTopic } from "../lib/dailyPrompt";

export const SCREEN_ID = "eRecord";

// 촬영 → 확인(재생) → 전송 → 완료(확인용 재생) 순서로 진행한다.
// 근거: 실사용 피드백 — "영상을 다 찍고 확인하는 마지막 화면이 있으면 좋겠다"
type Stage = "record" | "preview" | "sent";

export default function ERecord() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("record");
  // 말하기 안부와 같이 주제를 던져준다 — "하고 싶은 말씀을 하세요"만 있으면 막막해서
  // 무슨 말을 해야 할지 모른다. 근거: 실사용 피드백
  const topic = useDailyTopic("letter", ELDER_LETTER_TOPICS);
  const [recording, setRecording] = useState<RecordingHandle | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const liveRef = useRef<HTMLVideoElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // 화면을 벗어날 때만 마지막 URL을 해제한다. [previewUrl] 의존으로 두면 StrictMode의
  // 이펙트 2회 실행 때 방금 만든 URL이 곧바로 해제되어 개발 중 미리보기가 깨진다.
  const latestUrl = useRef<string | null>(null);
  latestUrl.current = previewUrl;
  useEffect(() => {
    return () => {
      if (latestUrl.current) URL.revokeObjectURL(latestUrl.current);
    };
  }, []);

  function setBlobAndPreview(next: Blob) {
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(next);
    });
    setBlob(next);
    setStage("preview");
  }

  async function start() {
    const handle = await startRecording("video");
    setRecording(handle);
    if (liveRef.current) liveRef.current.srcObject = handle.stream;
  }

  async function stop() {
    const result = recording ? await recording.stop() : createTestBlob("video");
    // 카메라 미리보기를 명시적으로 끊는다. srcObject가 남아 있으면 같은 <video>가
    // 재사용될 때 src보다 우선해서, 방금 찍은 영상 대신 멈춘 카메라 화면이 보인다.
    if (liveRef.current) liveRef.current.srcObject = null;
    setRecording(null);
    setBlobAndPreview(result);
  }

  function useTestFile() {
    setBlobAndPreview(createTestBlob("video"));
  }

  function retake() {
    setBlob(null);
    setStage("record");
  }

  async function confirmSend() {
    if (!blob) return;
    setBusy(true);
    const elderId = getStoredElderProfileId();
    if (supabaseConfigured && elderId) {
      const supabase = getSupabase();
      const path = await uploadToBucket("letters", elderId, blob, extensionForBlob(blob, "webm"));
      const { data: elder } = await supabase.from("elder_profile").select("family_account_id").eq("id", elderId).single();
      await supabase.from("video_letter").insert({
        sender_type: "elder",
        sender_id: elderId,
        receiver_type: "family",
        receiver_id: elder?.family_account_id,
        title: "영상편지",
        video_url: path,
      });
    }
    setBusy(false);
    setStage("sent");
  }

  if (stage === "record") {
    return (
      <AppShell variant="elder">
        <ElderTopBar />
        <h1 className="e-question">{topic}</h1>
        <SpeakButton text={topic} />
        {/* 주제는 어디까지나 권유다 — 다른 말을 하고 싶은 분을 막아서는 안 된다 */}
        <p className="e-lead">다른 하고 싶은 말씀이 있으면 그것을 하셔도 됩니다</p>
        <RecordingNotice />

        <video key="live" ref={liveRef} autoPlay muted className="e-media e-media--live" />

        {!recording && (
          <>
            <button className="e-primary" onClick={start}>
              ● 찍기 시작
            </button>
            {import.meta.env.DEV && (
              <button className="e-secondary" onClick={useTestFile}>
                (개발용) 테스트 파일 사용
              </button>
            )}
          </>
        )}
        {recording && (
          <button className="e-primary" onClick={stop}>
            찍기 종료
          </button>
        )}
        <button className="e-secondary" onClick={() => navigate("/elder/done")}>
          오늘은 건너뛰기
        </button>
      </AppShell>
    );
  }

  if (stage === "preview") {
    return (
      <AppShell variant="elder">
        <ElderTopBar />
        <h1 className="e-question">이렇게 보낼까요?</h1>
        <p className="e-lead">다시 찍으시려면 아래 버튼을 눌러주세요</p>

        {previewUrl && <video key="preview" src={previewUrl} controls autoPlay className="e-media e-media--live" />}

        <button className="e-primary" onClick={confirmSend} disabled={busy}>
          {busy ? "보내는 중..." : "이 영상 보내기"}
        </button>
        <button className="e-secondary" onClick={retake} disabled={busy}>
          다시 찍기
        </button>
      </AppShell>
    );
  }

  return (
    <AppShell variant="elder">
      <ElderTopBar />
      <h1 className="e-question">영상편지를 보냈어요</h1>

      {previewUrl && <video key="sent" src={previewUrl} controls className="e-media e-media--live" />}

      <button className="e-primary" onClick={() => navigate("/elder/home")}>
        처음 화면으로
      </button>
    </AppShell>
  );
}
