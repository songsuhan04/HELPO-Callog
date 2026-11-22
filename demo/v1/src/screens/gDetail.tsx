import { useEffect, useRef, useState } from "react";
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
import { CARD_SIZE } from "../features/attendance/stamps";
import { hasAnswers } from "../lib/checkin";
import { shiftDateString, todaySeoul } from "../lib/date";
import type { RiskLevel } from "../config/riskConstants";
import { RETENTION } from "../config/retention";
import { apiHeaders } from "../lib/api";
import { assertWritten } from "../lib/write";
import { FamilyQuestions } from "../components/FamilyQuestions";
import { FamilyMessages } from "../components/FamilyMessages";
import { shortTime } from "../lib/shortTime";

const TREND_DAYS = 14;

export const SCREEN_ID = "gDetail";

interface ElderDetail {
  id: string;
  name: string;
  relationship: string;
  phone: string | null;
  priority_status: RiskLevel;
  family_account_id: string;
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
  const [stampTotal, setStampTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myAccountId, setMyAccountId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseConfigured || !elderId) return;
    const supabase = getSupabase();
    supabase.auth.getUser().then(({ data }) => setMyAccountId(data.user?.id ?? null));
    supabase
      .from("elder_profile")
      .select("id,name,relationship,phone,priority_status,family_account_id")
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
      .then(({ data }) => {
        const dates = (data ?? []).filter(hasAnswers).map((r) => r.date as string);
        setStreak(computeStreak(dates));
        // 출석도장 — 어르신 화면과 같은 기준(안부를 실제로 답한 날 수)
        setStampTotal(new Set(dates).size);
      });
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
      if (json.status !== "ok") throw new Error(json.error ?? "분석하지 못했어요");
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
      setError(getErrorMessage(err, "다시 분석하지 못했어요"));
    } finally {
      setReanalyzing(false);
    }
  }

  // 받아쓰기가 "대기 중"에 2분 넘게 멈춰 있으면(어르신 폰의 요청이 끊긴 경우) 보호자가 화면을
  // 여는 순간 한 번 대신 다시 돌린다. 단추를 찾아 누르지 않아도 내용이 채워진다. 한 기록에
  // 한 번만 — 그래도 안 되면 "다시 분석하기" 단추가 남는다.
  const autoRetried = useRef<string | null>(null);
  useEffect(() => {
    if (!voice || voice.analysis_status !== "pending") return;
    if (Date.now() - new Date(voice.created_at).getTime() < 2 * 60_000) return;
    if (autoRetried.current === voice.id) return;
    autoRetried.current = voice.id;
    void reanalyze();
    // reanalyze는 voice를 읽어 쓰는 일반 함수라 의존성에 넣지 않는다(매 렌더 새로 만들어진다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice?.id, voice?.analysis_status]);

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
      setError(getRpcErrorMessage(error, "다시 초대하지 못했어요"));
      return;
    }
    navigate(`/guardian/elders/${elderId}/invite`);
  }

  async function deleteElder() {
    if (!elder) return;
    if (!window.confirm(`${elder.name}님을 목록에서 삭제할까요? 관련된 안부 기록·영상편지·위험도 이력이 모두 함께 지워지고 되돌릴 수 없어요.`)) return;
    setBusy(true);
    try {
      // .select()가 없으면 RLS로 0건이 되어도 성공으로 돌아온다(gList에서 옮겨 온 처리)
      const { data, error } = await getSupabase().from("elder_profile").delete().eq("id", elder.id).select("id");
      if (error) throw error;
      assertWritten(data, "이 어르신을 삭제할");
      navigate("/guardian");
    } catch (err) {
      setError(getErrorMessage(err, "지우지 못했어요"));
      setBusy(false);
    }
  }

  async function deleteLetter(letter: LetterRow, from: "elder" | "family") {
    if (!window.confirm("이 영상편지를 지울까요? 되돌릴 수 없어요.")) return;
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
            위험도는 진단이 아니라 참고용 신호예요.
            <div className="g-build">빌드 {__BUILD_ID__}</div>
          </div>
        </>
      }
    >
      {/* 어르신 상세로 들어온 뒤 목록으로 돌아갈 길이 사이드바에만 있어 눈에 잘 안 띄었다.
          근거: 실사용 피드백 — "다시 리스트로 가는 버튼이 하나 있으면 좋겠다" */}
      <button className="g-back g-back--inline" onClick={() => navigate("/guardian")}>
        ← 대상자 목록
      </button>

      <div className="g-toolbar">
        <div>
          {/* 위험도 배지를 이름 옆에 붙인다 — 따로 한 줄을 쓰면 위쪽에 줄이 너무 많이 쌓였다 */}
          <h1 className="g-title">
            {elder.name}
            <small>{elder.relationship}</small>
            <RiskPill level={elder.priority_status} />
          </h1>
          <p className="g-sub">
            {streak > 0 && `${streak}일 연속 안부를 남기고 있어요. `}
            {stampTotal > 0 &&
              `출석도장 ${stampTotal}개` +
                (stampTotal >= CARD_SIZE ? `(도장판 ${Math.floor(stampTotal / CARD_SIZE)}장 완성). ` : ". ")}
            {risk ? risk.reason : "특별한 위험 신호가 없어요."}
          </p>
        </div>
      </div>

      <div className="g-actions">
        {elder.phone ? (
          <a className="g-button" href={`tel:${elder.phone}`}>
            전화하기
          </a>
        ) : (
          <button className="g-button" disabled title="등록된 전화번호가 없어요">
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
        {/* 버튼 안에서 두 줄로 깨지지 않게 짧게. 언제 쓰는지는 title로 */}
        <button
          className="g-button g-button--secondary"
          onClick={reinvite}
          disabled={busy}
          title="어르신이 휴대폰을 바꿨을 때 새 초대 링크를 만들어요"
        >
          다시 초대하기
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
              <p className="g-sub u-m0">오늘은 어르신이 말하기를 건너뛰셨어요.</p>
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
                <p className="g-sub u-m0 u-mb8">
                  오늘은 말하기 안부가 없어요. 아래는 가장 최근 기록이에요.
                </p>
              )}
              <div className="g-timestamp">{shortTime(voice.created_at)}</div>
              {voice.signedUrl ? (
                <audio className="u-wfull" src={voice.signedUrl} controls />
              ) : (
                // 파일은 보관 기간이 지나 지워졌지만 아래 받아쓴 내용은 남아 있다.
                // 아무 설명 없이 재생기만 사라지면 고장으로 보인다.
                <p className="g-sub u-m0 u-mb8">
                  음성 파일은 보관 기간({RETENTION.VOICE_AUDIO_DAYS}일)이 지나 지워졌어요. 아래 기록만 남아 있어요.
                </p>
              )}
              {/* 분석 요청은 녹음 직후 어르신 폰에서 보낸다. 어르신이 바로 앱을 닫으면 요청이
                  끊겨 "대기 중"에 영영 머문다. 예전에는 이 상태를 아무 안내 없이 비워 둬서
                  보호자 눈에는 받아쓰기 기능이 사라진 것처럼 보였다(2026-11-19 실사용 신고).
                  분석은 실측 20초 안팎이고 서버 상한이 60초라, 2분이 지나면 멈춘 것으로 본다. */}
              {voice.analysis_status === "pending" &&
                Date.now() - new Date(voice.created_at).getTime() < 2 * 60_000 && (
                  <p className="g-sub u-m0 u-mt8">
                    AI가 받아쓰는 중이에요. 잠시 뒤 새로고침하면 내용이 보여요.
                  </p>
                )}
              {(voice.analysis_status === "failed" ||
                (voice.analysis_status === "pending" &&
                  Date.now() - new Date(voice.created_at).getTime() >= 2 * 60_000)) && (
                <>
                  <p className="g-error">
                    {voice.analysis_status === "failed"
                      ? "음성 분석이 안 됐어요. 녹음을 직접 들어 보세요."
                      : "받아쓰기가 끝나지 않았어요. 아래 버튼을 눌러 다시 받아써 주세요."}
                  </p>
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
                      <div className="g-legal u-mt4">
                        정확하지 않을 수 있어요. 위 음성을 직접 들어보고 확인해주세요.
                      </div>
                    </div>
                  )}
                  {voice.observations && (
                    <div className={voice.transcript ? "u-mt12" : undefined}>
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
            {letters.length === 0 && <p className="g-sub u-m0">아직 받은 영상편지가 없어요.</p>}
            {letters.map((letter) => (
              <div key={letter.id} className="g-letter">
                <div className="g-timestamp">{shortTime(letter.sent_at)}</div>
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
            {myLetters.length === 0 && <p className="g-sub u-m0">아직 보낸 영상편지가 없어요.</p>}
            {myLetters.map((letter) => (
              <div key={letter.id} className="g-letter">
                <div className="g-timestamp">{shortTime(letter.sent_at)}</div>
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

      {/* 보호자가 직접 만드는 질문 — 본인 어르신일 때만(관리자가 남의 어르신을 볼 때는 숨김) */}
      {myAccountId && elder.family_account_id === myAccountId && elderId && (
        <>
          {/* 보호자 → 어르신: 한마디로 전하고(가족 한마디), 질문으로 묻는다(부모님께 묻고 싶은 질문) */}
          <FamilyMessages elderId={elderId} />
          <FamilyQuestions elderId={elderId} />
        </>
      )}

      {/* 수정·삭제는 목록의 행마다 두지 않고 여기에 한 번만 — 목록에 빨간 "삭제"가 줄마다
          반복되고 누르기도 어려웠다(디자인 점검 P2). 관리자가 남의 어르신을 볼 때는 숨긴다. */}
      {myAccountId && elder.family_account_id === myAccountId && (
        <div className="g-card g-section">
          <div className="g-card-title">
            <span>어르신 정보</span>
          </div>
          <div className="g-actions">
            <button className="g-button g-button--secondary" onClick={() => navigate(`/guardian/elders/${elderId}/edit`)}>
              정보 수정
            </button>
            <button className="g-button g-button--danger" onClick={deleteElder} disabled={busy}>
              목록에서 삭제
            </button>
          </div>
        </div>
      )}

      <MedicalDisclaimer />
    </AppShell>
  );
}
