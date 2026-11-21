import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { BackButton } from "../components/BackButton";
import { createTestBlob, startRecording, type RecordingHandle } from "../lib/recorder";
import { extensionForBlob } from "../lib/mediaType";
import { uploadToBucket } from "../lib/storage";
import { getSupabase, supabaseConfigured } from "../lib/supabase";
import { getErrorMessage } from "../lib/errors";
import { FAMILY_LETTER_TOPICS, pickDailyTopic } from "../lib/topics";
import { todaySeoul } from "../lib/date";

export const SCREEN_ID = "gLetter";

// 촬영 → 확인(재생·다시 찍기) → 전송. 어르신 화면(eRecord)과 같은 흐름으로 맞췄다.
// 근거: 실사용 피드백 — "보호자 화면에서 찍은 영상이 바로 안 보이고 다시 찍기가 없다"
type Stage = "record" | "preview";

export default function GLetter() {
  const { elderId } = useParams<{ elderId: string }>();
  const navigate = useNavigate();
  // 어르신 id를 함께 넘겨 여러 어르신에게 같은 날 같은 주제가 가지 않게 한다
  const [topic] = useState(() => pickDailyTopic(FAMILY_LETTER_TOPICS, todaySeoul(), elderId ?? ""));
  const [stage, setStage] = useState<Stage>("record");
  const [title, setTitle] = useState("");
  const [recording, setRecording] = useState<RecordingHandle | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const liveRef = useRef<HTMLVideoElement>(null);

  // 화면을 벗어날 때만 해제한다. [previewUrl] 의존이면 StrictMode의 이펙트 2회 실행 때
  // 방금 만든 URL이 곧바로 해제되어 개발 중 미리보기가 깨진다.
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

  async function record() {
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
    setError(null);
    setStage("record");
  }

  async function send() {
    if (!blob) return;
    setSending(true);
    setError(null);
    try {
      const supabase = getSupabase();
      const { data: userData } = await supabase.auth.getUser();
      const path = await uploadToBucket("letters", elderId!, blob, extensionForBlob(blob, "webm"));
      const { error } = await supabase.from("video_letter").insert({
        sender_type: "family",
        sender_id: userData.user?.id,
        receiver_type: "elder",
        receiver_id: elderId,
        title: title || topic,
        video_url: path,
        unlock_condition: "checkin_complete",
      });
      if (error) throw error;
      navigate(`/guardian/elders/${elderId}`);
    } catch (err) {
      setError(getErrorMessage(err, "보내지 못했어요"));
    } finally {
      setSending(false);
    }
  }

  return (
    <AppShell>
      <BackButton />
      <div className="g-header">영상편지</div>
      <h1 className="g-title">{topic}</h1>

      {stage === "record" && (
        <>
          <p className="g-sub">어르신이 오늘 안부를 남기면 완료 화면에서 이 편지가 열려요.</p>
          {/* 통신비밀보호법/민법(타인 초상권·음성권) 대응 — 근거: Help4/법적문제 피해가기 공략.pdf §5, 체크리스트 4번 */}
          <p className="g-note u-m0 u-mb12">
            본인의 음성/모습만 녹화해 주세요. 타인의 동의 없는 촬영은 법적 책임을 질 수 있어요.
          </p>

          <video key="live" ref={liveRef} autoPlay muted className="g-media g-media--live" />

          {!recording && (
            <>
              <button className="g-button" onClick={record} disabled={!supabaseConfigured}>
                녹화 시작
              </button>
              {import.meta.env.DEV && (
                <button className="g-button g-button--secondary" onClick={useTestFile}>
                  (개발용) 테스트 파일 사용
                </button>
              )}
            </>
          )}
          {recording && (
            <button className="g-button" onClick={stop}>
              녹화 종료
            </button>
          )}
        </>
      )}

      {stage === "preview" && (
        <>
          <p className="g-sub">찍은 영상을 보고 보내 주세요. 마음에 안 들면 다시 찍을 수 있어요.</p>

          {previewUrl && <video key="preview" src={previewUrl} controls autoPlay className="g-media g-media--live" />}

          <div className="g-field">
            <label>한 줄 제목</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={topic} />
          </div>
          {error && <p className="g-error">{error}</p>}
          <button className="g-button" onClick={send} disabled={sending}>
            {sending ? "전송 중..." : "편지 보내기"}
          </button>
          <button className="g-button g-button--secondary" onClick={retake} disabled={sending}>
            다시 찍기
          </button>
        </>
      )}
    </AppShell>
  );
}
