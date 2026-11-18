import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { SpeakButton } from "../components/SpeakButton";
import { DisplaySettings } from "../components/DisplaySettings";
import { EmergencyCall } from "../components/EmergencyCall";
import { getStoredElderProfileId } from "../lib/elderSession";
import { getSupabase, supabaseConfigured } from "../lib/supabase";
import { getSignedUrl } from "../lib/storage";
import { VideoDownloadButton } from "../components/VideoDownloadButton";
import { todaySeoul } from "../lib/date";
import { computeStreak } from "../lib/streak";
import { hasAnswers, isAnswered } from "../lib/checkin";
import { FEATURES } from "../config/features";
import { StampCard } from "../features/attendance/StampCard";
import { summarizeStamps } from "../features/attendance/stamps";
import { dayAnimal, withSubject } from "../features/fortune/animal";

// 만세력 라이브러리가 커서 운세 카드는 안부를 마친 날에만 따로 받는다
const ElderFortune = lazy(() => import("../features/fortune/ElderFortune"));

interface LetterRow {
  id: string;
  title: string;
  video_url: string;
  sent_at: string;
  viewed_at: string | null;
  signedUrl?: string;
}

export const SCREEN_ID = "eHome";


// 어르신이 언제든 돌아올 수 있는 진짜 "처음 화면". 예전엔 완료 화면들의
// "처음 화면으로" 버튼이 안부 설문 시작 화면(/elder/check)으로 보냈는데,
// 오늘 이미 다 마쳤어도 설문이 처음부터 다시 시작되는 문제가 있었다.
// 근거: 실사용 피드백 — "처음 화면을 하나 만드는 게 어떨까"
export default function EHome() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [doneToday, setDoneToday] = useState(false);
  const [streak, setStreak] = useState(0);
  const [answeredDates, setAnsweredDates] = useState<string[] | null>(null);
  const [letter, setLetter] = useState<LetterRow | null>(null);
  const [birthDate, setBirthDate] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }
    const elderId = getStoredElderProfileId();
    const supabase = getSupabase();
    supabase
      .from("daily_checkin")
      .select("answers,skipped")
      .eq("elder_profile_id", elderId)
      .eq("date", todaySeoul())
      .maybeSingle()
      .then(({ data }) => {
        setDoneToday(isAnswered(data));
        setLoading(false);
      });
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
        setAnsweredDates(dates);
      });
    supabase
      .from("elder_profile")
      .select("birth_date")
      .eq("id", elderId)
      .maybeSingle()
      .then(({ data }) => setBirthDate((data?.birth_date as string | null) ?? null));
    if (!FEATURES.videoLetters) return;
    // 가장 최근 가족 영상편지를 홈에 바로 띄운다 — 완료 화면만 밋밋하게 두지 않고
    // 어르신이 별도 화면으로 들어가지 않아도 바로 볼 수 있게.
    // 근거: 실사용 피드백 — "가족이 보낸 영상편지가 바로 나오면 어떨까"
    supabase
      .from("video_letter")
      .select("id,title,video_url,sent_at,viewed_at")
      .eq("receiver_type", "elder")
      .eq("receiver_id", elderId)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(async ({ data }) => {
        if (!data) return;
        const signedUrl = await getSignedUrl("letters", data.video_url).catch(() => undefined);
        setLetter({ ...(data as LetterRow), signedUrl });
      });
  }, []);

  // 재생하면 "새 편지" 표시가 사라지도록 확인 시각을 남긴다
  async function markViewed() {
    if (!letter || letter.viewed_at) return;
    const viewedAt = new Date().toISOString();
    await getSupabase().from("video_letter").update({ viewed_at: viewedAt }).eq("id", letter.id);
    setLetter({ ...letter, viewed_at: viewedAt });
  }

  if (loading) return <AppShell variant="elder"><p className="e-lead">불러오는 중...</p></AppShell>;

  const message = doneToday ? "오늘 안부는 이미 전했어요" : "오늘 안부를 전해볼까요?";
  // 오늘의 동물은 날짜 계산만으로 구한다 — 만세력 라이브러리를 처음 화면에 싣지 않는다
  const animal = dayAnimal(todaySeoul());

  return (
    <AppShell variant="elder">
      <div className="e-topbar">
        <DisplaySettings />
        <span className="e-brand">Callog</span>
      </div>
      <div className="e-hero">
        <h1 className="e-question">{message}</h1>
      </div>

      <SpeakButton text={message} />

      {/* 오늘의 운세는 안부를 마친 뒤에 열린다 — 운세를 보러 들어온 김에 안부를 남기게 */}
      {doneToday && birthDate !== undefined && (
        <Suspense fallback={null}>
          <ElderFortune birthDate={birthDate} />
        </Suspense>
      )}
      {!doneToday && animal && (
        <p className="e-meta" style={{ textAlign: "center", marginBottom: 14 }}>
          {animal.emoji} 오늘은 {withSubject(animal.name)} 복주머니를 들고 왔어요. 안부를 마치면 열 수 있어요
        </p>
      )}

      {FEATURES.videoLetters && letter?.signedUrl && (
        <div className="e-card">
          <div className="e-card-head">
            <div className="e-card-label">가족이 보낸 영상편지</div>
            {!letter.viewed_at && <span className="e-badge-new">새 편지</span>}
          </div>
          <div className="e-card-title">{letter.title}</div>
          <video src={letter.signedUrl} controls className="e-media" onPlay={markViewed} />
          <VideoDownloadButton
            path={letter.video_url}
            fileName={`가족영상편지-${letter.sent_at.slice(0, 10)}.webm`}
          />
        </div>
      )}

      {!doneToday && (
        <button className="e-primary" onClick={() => navigate("/elder/check")}>
          안부 시작하기
        </button>
      )}

      {/* 출석도장 — 오늘 칸이 비어 있으면 "안부를 마치면 도장을 찍어 드려요" */}
      {answeredDates && <StampCard summary={summarizeStamps(answeredDates, todaySeoul())} today={todaySeoul()} streak={streak} />}
      {FEATURES.videoLetters && (
        <>
          <button className="e-secondary" onClick={() => navigate("/elder/record")}>
            영상편지 남기기
          </button>
          <button className="e-secondary" onClick={() => navigate("/elder/letters")}>
            가족 영상편지 모아보기
          </button>
        </>
      )}

      {/* 위험도와 무관하게 항상 같은 자리에 둔다 — EmergencyCall의 주석 참고 */}
      <EmergencyCall />
    </AppShell>
  );
}
