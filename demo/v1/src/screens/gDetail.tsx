import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { BrandLink } from "../components/BrandLink";
import { RiskPill } from "../components/RiskDot";
import { TrendChart, type TrendPoint } from "../components/TrendChart";
import { MedicalDisclaimer } from "../components/MedicalDisclaimer";
import { getSupabase, supabaseConfigured } from "../lib/supabase";
import { getSignedUrl, deleteFromBucket } from "../lib/storage";
import { VideoDownloadButton } from "../components/VideoDownloadButton";
import { FEATURES } from "../config/features";
import { getErrorMessage, getRpcErrorMessage } from "../lib/errors";
import { computeStreak } from "../lib/streak";
import { hasAnswers } from "../lib/checkin";
import { shiftDateString, todaySeoul } from "../lib/date";
import type { RiskLevel } from "../config/riskConstants";
import { RETENTION } from "../config/retention";
import { apiHeaders } from "../lib/api";

const TREND_DAYS = 14;

export const SCREEN_ID = "gDetail";

interface ElderDetail {
  id: string;
  name: string;
  relationship: string;
  phone: string | null;
  priority_status: RiskLevel;
}

interface RiskRow {
  reason: string;
  level: RiskLevel;
  date: string;
}

interface LetterRow {
  id: string;
  title: string;
  video_url: string;
  sent_at: string;
  signedUrl?: string;
}

interface VoiceRow {
  id: string;
  /** 이 녹음이 어느 날짜의 안부인지 — 오늘 것인지 구분해 보여주기 위해 필요하다 */
  checkinDate: string;
  // 보관 기간이 지나면 파일만 지우고 행은 남긴다 — 그래서 null일 수 있다
  audio_url: string | null;
  created_at: string;
  transcript: string | null;
  observations: string | null;
  analysis_status: string;
  signedUrl?: string;
}

export default function GDetail() {
  const { elderId } = useParams<{ elderId: string }>();
  const navigate = useNavigate();
  const [elder, setElder] = useState<ElderDetail | null>(null);
  const [risk, setRisk] = useState<RiskRow | null>(null);
  const [letters, setLetters] = useState<LetterRow[]>([]);
  const [myLetters, setMyLetters] = useState<LetterRow[]>([]);
  const [voice, setVoice] = useState<VoiceRow | null>(null);
  // 음성 조회가 끝났는지 구분 — 로딩 중과 "기록 없음"을 같은 문구로 보여주면 안 된다
  const [voiceLoaded, setVoiceLoaded] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [streak, setStreak] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseConfigured || !elderId) return;
    const supabase = getSupabase();
    supabase
      .from("elder_profile")
      .select("id,name,relationship,phone,priority_status")
      .eq("id", elderId)
      .single()
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setElder(data as ElderDetail);
      });
    supabase
      .from("risk_assessment")
      .select("reason,level,date")
      .eq("elder_profile_id", elderId)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setRisk((data as RiskRow) ?? null));
    // 어르신이 보낸 영상편지 — 보호자도 확인할 수 있어야 함
    if (FEATURES.videoLetters) supabase
      .from("video_letter")
      .select("id,title,video_url,sent_at")
      .eq("sender_type", "elder")
      .eq("sender_id", elderId)
      .order("sent_at", { ascending: false })
      .then(async ({ data }) => {
        const rows = (data ?? []) as LetterRow[];
        const withUrls = await Promise.all(
          rows.map(async (row) => ({ ...row, signedUrl: await getSignedUrl("letters", row.video_url).catch(() => undefined) }))
        );
        setLetters(withUrls);
      });
    // 내가(보호자) 보낸 영상편지 — 잘못 보낸 걸 확인하고 지울 수 있어야 함
    if (FEATURES.videoLetters) supabase.auth.getUser().then(async ({ data: userData }) => {
      if (!userData.user) return;
      const { data } = await supabase
        .from("video_letter")
        .select("id,title,video_url,sent_at")
        .eq("sender_type", "family")
        .eq("sender_id", userData.user.id)
        .eq("receiver_id", elderId)
        .order("sent_at", { ascending: false });
      const rows = (data ?? []) as LetterRow[];
      const withUrls = await Promise.all(
        rows.map(async (row) => ({ ...row, signedUrl: await getSignedUrl("letters", row.video_url).catch(() => undefined) }))
      );
      setMyLetters(withUrls);
    });
    // 최근 말하기 안부 음성 — 보호자도 직접 들을 수 있어야 함.
    // 어느 날짜의 녹음인지 함께 가져온다. 오늘 녹음이 없으면 예전 녹음이 잡히는데,
    // 그걸 "최근 말하기 안부"로만 보여주면 보호자가 오늘 것으로 오해한다
    // (실제로 "녹음한 적 없는데 내용이 뜬다"는 신고가 있었고, 사흘 전 녹음이었다).
    supabase
      .from("daily_checkin")
      .select("id,date")
      .eq("elder_profile_id", elderId)
      .order("date", { ascending: false })
      .limit(7)
      .then(async ({ data: checkins }) => {
        const rows = checkins ?? [];
        if (rows.length === 0) {
          setVoiceLoaded(true);
          return;
        }
        const dateById = new Map(rows.map((c) => [c.id as string, c.date as string]));
        const { data } = await supabase
          .from("voice_response")
          .select("id,daily_checkin_id,audio_url,created_at,transcript,observations,analysis_status")
          .in("daily_checkin_id", [...dateById.keys()])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!data) {
          // 안부는 했지만 말하기를 건너뛴 경우 — 보호자가 "왜 아무것도 없지?" 하고
          // 헤매지 않도록 없다는 사실을 명시한다. 근거: 실사용 피드백
          setVoiceLoaded(true);
          return;
        }
        // 보관 기간이 지나 파일이 지워졌으면 audio_url이 비어 있다. 그때는 재생만 못 할 뿐,
        // 받아쓴 내용과 소견은 그대로 보여줘야 한다.
        const audioUrl = (data.audio_url as string | null) ?? null;
        const signedUrl = audioUrl
          ? await getSignedUrl("voice", audioUrl).catch(() => undefined)
          : undefined;
        setVoice({
          id: data.id as string,
          checkinDate: dateById.get(data.daily_checkin_id as string) ?? "",
          audio_url: audioUrl,
          created_at: data.created_at as string,
          transcript: (data.transcript as string | null) ?? null,
          observations: (data.observations as string | null) ?? null,
          analysis_status: data.analysis_status as string,
          signedUrl,
        });
        setVoiceLoaded(true);
      });
    // 최근 위험도 추이 — 기능설계서.md §1 "꺾은선 그래프 기록"
    const days: string[] = [];
    for (let i = TREND_DAYS - 1; i >= 0; i--) {
      days.push(shiftDateString(todaySeoul(), -i));
    }
    supabase
      .from("risk_assessment")
      .select("date,level")
      .eq("elder_profile_id", elderId)
      .gte("date", days[0])
      .then(({ data }) => {
        const byDate = new Map((data ?? []).map((r) => [r.date as string, r.level as RiskLevel]));
        setTrend(days.map((date) => ({ date, level: byDate.get(date) ?? null })));
      });
    // 연속 참여 기록 — 기능설계서.md §1 "연속 참여 기록"
    supabase
      .from("daily_checkin")
      // 답변까지 받아와서 거른다 — 아무것도 답하지 않은 행이 연속 기록을 부풀리면 안 된다
      .select("date,answers")
      .eq("elder_profile_id", elderId)
      .eq("skipped", false)
      .order("date", { ascending: false })
      .limit(400)
      .then(({ data }) =>
        setStreak(computeStreak((data ?? []).filter(hasAnswers).map((r) => r.date as string)))
      );
  }, [elderId]);

  // 분석은 일시적인 이유로도 실패한다(잠깐 몰렸거나 응답이 늦거나). 그때 보호자가 할 수 있는
  // 일이 아무것도 없어서, 어르신이 남긴 말씀이 그날치로 그냥 사라졌다. 다시 시도할 길을 준다.
  async function reanalyze() {
    if (!voice) return;
    setReanalyzing(true);
    try {
      const resp = await fetch("/api/analyze-voice", {
        method: "POST",
        headers: await apiHeaders(),
        body: JSON.stringify({ voiceResponseId: voice.id }),
      });
      const json = await resp.json();
      if (json.status !== "ok") throw new Error(json.error ?? "분석에 실패했습니다");
      // 갱신된 결과를 다시 읽어 화면에 반영한다
      const { data } = await getSupabase()
        .from("voice_response")
        .select("transcript,observations,analysis_status")
        .eq("id", voice.id)
        .maybeSingle();
      if (data) {
        setVoice({
          ...voice,
          transcript: (data.transcript as string | null) ?? null,
          observations: (data.observations as string | null) ?? null,
          analysis_status: data.analysis_status as string,
        });
      }
    } catch (err) {
      setError(getErrorMessage(err, "다시 분석하지 못했습니다"));
    } finally {
      setReanalyzing(false);
    }
  }

  async function markChecked() {
    if (!risk) return;
    setBusy(true);
    // order()/limit()은 update에는 적용되지 않아 date로 직접 특정 행만 지정해야 한다
    await getSupabase()
      .from("risk_assessment")
      .update({ family_action: "확인함" })
      .eq("elder_profile_id", elderId)
      .eq("date", risk.date);
    setBusy(false);
  }

  async function reinvite() {
    setBusy(true);
    const { error } = await getSupabase().rpc("revoke_elder_access", { p_elder: elderId });
    setBusy(false);
    if (error) {
      setError(getRpcErrorMessage(error, "재초대에 실패했습니다"));
      return;
    }
    navigate(`/guardian/elders/${elderId}/invite`);
  }

  async function deleteLetter(letter: LetterRow, from: "elder" | "family") {
    if (!window.confirm("이 영상편지를 삭제할까요? 되돌릴 수 없습니다.")) return;
    await deleteFromBucket("letters", letter.video_url).catch(() => {});
    await getSupabase().from("video_letter").delete().eq("id", letter.id);
    const setter = from === "elder" ? setLetters : setMyLetters;
    setter((prev) => prev.filter((l) => l.id !== letter.id));
  }

  if (!elder) return <AppShell>{error ? <p className="g-error">{error}</p> : <p className="g-sub">불러오는 중...</p>}</AppShell>;

  return (
    <AppShell
      aside={
        <>
          {/* 사이드바에는 목록으로 가는 버튼을 두지 않는다. 1024px 아래에서 사이드바는
              가로 막대로 바뀌어 본문 위에 붙는데, 그러면 아래 g-back--inline과 나란히
              똑같은 버튼이 두 개 보였다. 좁은 화면에서 잘 보이는 본문 쪽만 남긴다.
              (BrandLink 자체가 목록으로 가는 링크이기도 하다) */}
          <BrandLink />
          <div className="g-aside-foot">
            본 서비스는 의료기기가 아니며, 표시되는 위험도는 참고용 신호입니다.
            <div className="g-build">빌드 {__BUILD_ID__}</div>
          </div>
        </>
      }
    >
      {/* 어르신 상세로 들어온 뒤 목록으로 돌아갈 길이 사이드바에만 있어 눈에 잘 안 띄었다.
          근거: 실사용 피드백 — "다시 리스트로 가는 버튼이 하나 있으면 좋겠다" */}
      <button className="g-back g-back--inline" onClick={() => navigate("/guardian")}>
        ← 대상자 목록으로
      </button>

      <div className="g-toolbar">
        <div>
          <div className="g-header">
            <RiskPill level={elder.priority_status} />
          </div>
          <h1 className="g-title">
            {elder.name}
            <small>{elder.relationship}</small>
          </h1>
          <p className="g-sub">
            {streak > 0 && `${streak}일 연속 안부를 남기고 있어요. `}
            {risk ? risk.reason : "특별한 위험 신호가 없습니다."}
          </p>
        </div>
      </div>

      <div className="g-actions">
        {elder.phone ? (
          <a className="g-button" href={`tel:${elder.phone}`}>
            전화하기
          </a>
        ) : (
          <button className="g-button" disabled title="등록된 전화번호가 없습니다">
            전화하기
          </button>
        )}
        <button className="g-button g-button--secondary" disabled={busy || !risk} onClick={markChecked}>
          확인했어요
        </button>
        {FEATURES.videoLetters && (
          <button
            className="g-button g-button--secondary"
            onClick={() => navigate(`/guardian/elders/${elderId}/letter`)}
          >
            영상편지 보내기
          </button>
        )}
        <button
          className="g-button g-button--secondary"
          onClick={() => navigate(`/guardian/elders/${elderId}/conditions`, { state: { mode: "edit" } })}
        >
          지병 수정
        </button>
        <button className="g-button g-button--secondary" onClick={reinvite} disabled={busy}>
          재초대 (기기 변경 시)
        </button>
      </div>
      {error && <p className="g-error">{error}</p>}

      {/* 넓은 화면에서는 추이·음성과 영상편지를 2단으로 나눠, 스크롤하지 않고 함께 본다 */}
      <div className={FEATURES.videoLetters ? "g-grid g-section" : "g-section"}>
        <div>
          {trend.some((p) => p.level) && (
            <div className="g-card">
              <div className="g-card-title">
                <span>최근 {TREND_DAYS}일 추이</span>
              </div>
              <TrendChart points={trend} />
            </div>
          )}

          {voiceLoaded && !voice && (
            <div className="g-card">
              <div className="g-card-title">
                <span>말하기 안부</span>
              </div>
              {/* 건너뛴 날에도 "왜 아무것도 없지?" 하고 헤매지 않도록 없다는 사실을 명시.
                  근거: 실사용 피드백 — "말하기 안부를 건너뛴 날에는 없습니다라고 뜨면 좋겠다" */}
              <p className="g-sub" style={{ margin: 0 }}>말하기 안부가 없습니다. 어르신이 오늘 말하기를 건너뛰셨어요.</p>
            </div>
          )}

          {voice && (
            <div className="g-card">
              <div className="g-card-title">
                <span>{voice.checkinDate === todaySeoul() ? "오늘 말하기 안부" : "지난 말하기 안부"}</span>
              </div>
              {/* 오늘 녹음이 없으면 예전 녹음이 잡히는데, 날짜를 분명히 하지 않으면
                  보호자가 오늘 것으로 오해한다. 근거: 실사용 피드백 */}
              {voice.checkinDate !== todaySeoul() && (
                <p className="g-sub" style={{ margin: "0 0 8px" }}>
                  오늘은 말하기 안부가 없어요. 아래는 가장 최근 기록입니다.
                </p>
              )}
              <div className="g-timestamp">{new Date(voice.created_at).toLocaleString("ko-KR")}</div>
              {voice.signedUrl ? (
                <audio src={voice.signedUrl} controls style={{ width: "100%" }} />
              ) : (
                // 파일은 보관 기간이 지나 지워졌지만 아래 받아쓴 내용은 남아 있다.
                // 아무 설명 없이 재생기만 사라지면 고장으로 보인다.
                <p className="g-sub" style={{ margin: "0 0 8px" }}>
                  음성 파일은 보관 기간({RETENTION.VOICE_AUDIO_DAYS}일)이 지나 삭제되었습니다. 아래 기록만 남아 있어요.
                </p>
              )}
              {voice.analysis_status === "failed" && (
                <>
                  <p className="g-error">음성 분석에 실패했습니다. 직접 들어보고 확인해주세요.</p>
                  {/* 대개 일시적인 문제라 다시 누르면 된다 — 실제로 같은 파일이 재시도에서 정상 인식됐다 */}
                  <button className="g-button g-button--secondary" onClick={reanalyze} disabled={reanalyzing}>
                    {reanalyzing ? "다시 분석하는 중..." : "다시 분석하기"}
                  </button>
                </>
              )}
              {voice.analysis_status === "ok" && (voice.transcript || voice.observations) && (
                <div className="g-note">
                  {voice.transcript && (
                    <div>
                      {/* AI가 받아쓴 결과라 틀릴 수 있다("말씀 내용"이라고만 하면 사실처럼 읽힌다).
                          주변 대화가 섞여 들어오는 경우도 있어 직접 들어보도록 안내한다. */}
                      <span className="g-note-label">AI가 받아쓴 내용</span>
                      {voice.transcript}
                      <div className="g-legal" style={{ marginTop: 4 }}>
                        정확하지 않을 수 있어요. 위 음성을 직접 들어보고 확인해주세요.
                      </div>
                    </div>
                  )}
                  {voice.observations && (
                    <div style={{ marginTop: voice.transcript ? 10 : 0 }}>
                      <span className="g-note-label">AI 소견</span>
                      {voice.observations}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {FEATURES.videoLetters && <div>
          <div className="g-card">
            <div className="g-card-title">
              <span>{elder.name}님이 보낸 영상편지</span>
            </div>
            {letters.length === 0 && <p className="g-sub" style={{ margin: 0 }}>아직 받은 영상편지가 없습니다.</p>}
            {letters.map((letter) => (
              <div key={letter.id} className="g-letter">
                <div className="g-timestamp">{new Date(letter.sent_at).toLocaleString("ko-KR")}</div>
                <div className="g-letter-title">{letter.title}</div>
                {letter.signedUrl && <video src={letter.signedUrl} controls className="g-media" />}
                <div className="g-letter-actions">
                  <VideoDownloadButton
                    path={letter.video_url}
                    fileName={`${elder.name}님-영상편지-${letter.sent_at.slice(0, 10)}.webm`}
                    className="g-button g-button--secondary"
                  />
                  <button className="g-button g-button--danger" onClick={() => deleteLetter(letter, "elder")}>
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="g-card">
            <div className="g-card-title">
              <span>내가 보낸 영상편지</span>
            </div>
            {myLetters.length === 0 && <p className="g-sub" style={{ margin: 0 }}>아직 보낸 영상편지가 없습니다.</p>}
            {myLetters.map((letter) => (
              <div key={letter.id} className="g-letter">
                <div className="g-timestamp">{new Date(letter.sent_at).toLocaleString("ko-KR")}</div>
                <div className="g-letter-title">{letter.title}</div>
                {letter.signedUrl && <video src={letter.signedUrl} controls className="g-media" />}
                <div className="g-letter-actions">
                  <VideoDownloadButton
                    path={letter.video_url}
                    fileName={`내가보낸-영상편지-${letter.sent_at.slice(0, 10)}.webm`}
                    className="g-button g-button--secondary"
                  />
                  <button className="g-button g-button--danger" onClick={() => deleteLetter(letter, "family")}>
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>}
      </div>

      <MedicalDisclaimer />
    </AppShell>
  );
}
