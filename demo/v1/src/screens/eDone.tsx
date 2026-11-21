import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { ElderTopBar } from "../components/ElderTopBar";
import { SpeakButton } from "../components/SpeakButton";
import { getStoredElderProfileId } from "../lib/elderSession";
import { getSignedUrl } from "../lib/storage";
import { getSupabase, supabaseConfigured } from "../lib/supabase";
import { computeStreak } from "../lib/streak";
import { hasAnswers } from "../lib/checkin";
import { FEATURES } from "../config/features";
import { StampCard } from "../features/attendance/StampCard";
import { summarizeStamps } from "../features/attendance/stamps";
import { todaySeoul } from "../lib/date";

// 만세력 라이브러리가 커서 운세 카드는 이 화면에서만 따로 받는다
const ElderFortune = lazy(() => import("../features/fortune/ElderFortune"));

export const SCREEN_ID = "eDone";

interface LetterRow {
  id: string;
  title: string;
  video_url: string;
}

export default function EDone() {
  const navigate = useNavigate();
  const [streak, setStreak] = useState(0);
  // 안부를 실제로 답한 날들 — 연속 일수와 출석도장을 같이 센다. null = 아직 읽는 중
  const [answeredDates, setAnsweredDates] = useState<string[] | null>(null);
  const [letter, setLetter] = useState<LetterRow | null>(null);
  const [letterUrl, setLetterUrl] = useState<string | null>(null);
  // undefined = 아직 읽는 중, null = 등록된 생일 없음
  const [birthDate, setBirthDate] = useState<string | null | undefined>(undefined);
  const [birthInfo, setBirthInfo] = useState<{ time: string | null; name: string | null }>({ time: null, name: null });

  useEffect(() => {
    if (!supabaseConfigured) return;
    const elderId = getStoredElderProfileId();
    const supabase = getSupabase();
    // 예전엔 {count:"exact"}로 전체 기간 누적 체크인 수를 세고 있었다 — 하루라도 건너뛰면
    // 다시 0부터 시작해야 할 "연속" 참여가 아니라 평생 총 횟수였던 버그. 실제 연속 일수를
    // 계산하려면 날짜를 받아 오늘(또는 어제)부터 거슬러 올라가며 끊기는 지점을 찾아야 한다.
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
    // 오늘의 운세에 쓸 생일 — 보호자가 어르신 정보에 적은 값(양력)
    supabase
      .from("elder_profile")
      // 태어난 시각 칸은 DB에 있을 때만 읽는다(config/features.ts birthTime)
      .select(FEATURES.birthTime ? "birth_date,birth_time,name" : "birth_date,name")
      .eq("id", elderId)
      .maybeSingle()
      .then(({ data }) => {
        const row = (data ?? {}) as { birth_date?: string | null; birth_time?: string | null; name?: string | null };
        setBirthInfo({ time: row.birth_time ?? null, name: row.name ?? null });
        setBirthDate(row.birth_date ?? null);
      });
    if (!FEATURES.videoLetters) return;
    supabase
      .from("video_letter")
      .select("id,title,video_url")
      .eq("receiver_type", "elder")
      .eq("receiver_id", elderId)
      .is("viewed_at", null)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setLetter(data as LetterRow);
          getSignedUrl("letters", (data as LetterRow).video_url).then(setLetterUrl);
        }
      });
  }, []);

  const today = todaySeoul();

  return (
    <AppShell variant="elder">
      <ElderTopBar />
      <div className="e-hero">
        <div className="e-hero-mark">✓</div>
        <h1 className="e-question">잘 하셨어요</h1>
        <p className="e-lead">오늘 안부를 가족에게 전했어요.</p>
      </div>
      <SpeakButton text="오늘 안부를 가족에게 전했어요. 잘 하셨어요." />

      {/* 운세를 도장보다 위에 — 안부를 마친 뒤 바로 눈에 들어오게 */}
      {birthDate !== undefined && (
        <Suspense fallback={null}>
          <ElderFortune birthDate={birthDate} birthTime={birthInfo.time} name={birthInfo.name} />
        </Suspense>
      )}

      {/* 출석도장 — 방금 마친 오늘 도장이 찍히는 순간을 보여 준다 */}
      {answeredDates && (
        <StampCard summary={summarizeStamps(answeredDates, today)} today={today} streak={streak} celebrate />
      )}

      {FEATURES.videoLetters && letter && (
        <div className="e-card">
          <div className="e-card-label">가족이 보냈어요</div>
          <div className="e-card-title">{letter.title}</div>
          {letterUrl && <video src={letterUrl} controls className="e-media" />}
        </div>
      )}

      {FEATURES.videoLetters && (
        <>
          <button className="e-primary" onClick={() => navigate("/elder/record")}>
            영상편지 남기기
          </button>
          <button className="e-secondary" onClick={() => navigate("/elder/letters")}>
            가족 영상편지 모아보기
          </button>
        </>
      )}
      {/* 이 화면의 주요 행동은 운세 보기라 "처음 화면으로"는 보조 버튼으로 둔다(한 화면에 꽉 찬 버튼 하나) */}
      <button className="e-secondary" onClick={() => navigate("/elder/home")}>
        처음 화면으로
      </button>
    </AppShell>
  );
}
