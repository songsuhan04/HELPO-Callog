import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { ElderTopBar } from "../components/ElderTopBar";
import { SpeakButton } from "../components/SpeakButton";
import { createTestBlob, startRecording, type RecordingHandle } from "../lib/recorder";
import { extensionForBlob } from "../lib/mediaType";
import { uploadToBucket, deleteFromBucket } from "../lib/storage";
import { getStoredElderProfileId } from "../lib/elderSession";
import { getSupabase, supabaseConfigured } from "../lib/supabase";
import { RecordingNotice } from "../components/RecordingNotice";
import { todaySeoul } from "../lib/date";
import { SPEECH_TOPICS } from "../lib/topics";
import { useDailyTopic } from "../lib/dailyPrompt";
import { apiHeaders } from "../lib/api";

export const SCREEN_ID = "eSpeech";


export default function ESpeech() {
  const navigate = useNavigate();
  const topic = useDailyTopic("speech", SPEECH_TOPICS);
  const [recording, setRecording] = useState<RecordingHandle | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useState(() => Date.now())[0];

  async function start() {
    const handle = await startRecording("audio");
    setRecording(handle);
  }

  async function stopAndSave() {
    setBusy(true);
    const blob = recording ? await recording.stop() : createTestBlob("audio");
    setRecording(null);
    await save(blob);
  }

  async function useTestFile() {
    setBusy(true);
    await save(createTestBlob("audio"));
  }

  async function save(blob: Blob) {
    setError(null);
    const elderId = getStoredElderProfileId();
    if (supabaseConfigured && elderId) {
      const supabase = getSupabase();
      const path = await uploadToBucket("voice", elderId, blob, extensionForBlob(blob, "webm"));
      // 오늘 안부체크 기록에 녹음을 붙인다. 이 화면은 안부체크를 마쳐야 오게 되어 있지만,
      // 저장이 실패했거나 주소로 바로 들어온 경우엔 붙일 곳이 없다. 예전에는 .single()로
      // 조회하고 결과를 그냥 넘겨서, 그런 경우 녹음이 조용히 사라지고 화면은 완료로 넘어갔다.
      const { data: checkin } = await supabase
        .from("daily_checkin")
        .select("id")
        .eq("elder_profile_id", elderId)
        .eq("date", todaySeoul())
        .maybeSingle();
      if (!checkin?.id) {
        setError("오늘 안부를 먼저 마쳐야 말씀을 남길 수 있어요.");
        setBusy(false);
        return;
      }
      {
        // daily_checkin_id는 unique 제약이라 하루에 여러 번 녹음하면 insert가 아니라
        // 기존 행을 덮어써야 한다 — 예전엔 insert만 해서 두 번째 시도부터는 조용히
        // 실패하고 항상 첫 녹음만 남아있었다. 근거: 실사용 피드백 — "덮어쓰기가 안 된다"
        const { data: existing } = await supabase
          .from("voice_response")
          .select("audio_url")
          .eq("daily_checkin_id", checkin.id)
          .maybeSingle();
        const { data: voiceRow, error: voiceError } = await supabase
          .from("voice_response")
          .upsert(
            {
              daily_checkin_id: checkin.id,
              audio_url: path,
              response_latency_ms: Date.now() - startedAt,
              analysis_status: "pending",
              transcript: null,
              observations: null,
              speech_rate: null,
              silence_ratio: null,
              analysis_json: null,
              // upsert의 ON CONFLICT DO UPDATE는 payload에 없는 컬럼은 건드리지 않는다 —
              // created_at의 default now()는 최초 insert에만 적용되므로 재녹음 시에도
              // "최근 말하기 안부" 시각이 갱신되려면 여기서 직접 채워야 한다.
              created_at: new Date().toISOString(),
            },
            { onConflict: "daily_checkin_id" }
          )
          .select("id")
          .single();
        if (voiceError) {
          setError("말씀을 저장하지 못했어요. 잠시 후 다시 시도해주세요.");
          setBusy(false);
          return;
        }
        if (existing?.audio_url) await deleteFromBucket("voice", existing.audio_url).catch(() => {});
        // 분석 요청은 fire-and-forget — 실패해도 하루 기록은 그대로 인정된다
        if (voiceRow?.id) {
          const voiceResponseId = voiceRow.id;
          apiHeaders()
            .then((headers) =>
              fetch("/api/analyze-voice", {
                method: "POST",
                headers,
                // 말하기를 마치자마자 어르신이 앱을 닫아도 요청이 끝까지 가게 한다.
                // 없으면 요청이 끊겨 받아쓰기가 "대기 중"에 멈춘다(2026-11-19 실제 사례).
                keepalive: true,
                body: JSON.stringify({ voiceResponseId }),
              })
            )
            .catch(() => {});
        }
      }
    }
    navigate("/elder/done");
  }

  function skip() {
    navigate("/elder/done");
  }

  return (
    <AppShell variant="elder">
      <ElderTopBar onBack={() => navigate(-1)} />
      <h1 className="e-question">{topic}</h1>
      <SpeakButton text={topic} />
      <p className="e-lead">천천히 말씀하시면 돼요</p>
      <RecordingNotice />
      {error && <p className="e-error">{error}</p>}

      {!recording && (
        <button className="e-primary" onClick={start} disabled={busy}>
          ● 말하기 시작
        </button>
      )}
      {recording && (
        <button className="e-primary" onClick={stopAndSave} disabled={busy}>
          {busy ? "저장 중..." : "말하기 종료"}
        </button>
      )}
      {import.meta.env.DEV && !recording && (
        <button className="e-secondary" onClick={useTestFile} disabled={busy}>
          (개발용) 테스트 파일 사용
        </button>
      )}
      <button className="e-secondary" onClick={skip} disabled={busy}>
        오늘은 건너뛰기
      </button>
    </AppShell>
  );
}
