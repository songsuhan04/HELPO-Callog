import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { DisplaySettings } from "../components/DisplaySettings";
import { SpeakButton } from "../components/SpeakButton";
import { getStoredElderProfileId } from "../lib/elderSession";
import { getSignedUrl } from "../lib/storage";
import { getSupabase, supabaseConfigured } from "../lib/supabase";
import { computeStreak } from "../lib/streak";
import { hasAnswers } from "../lib/checkin";
import { FEATURES } from "../config/features";

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
  const [letter, setLetter] = useState<LetterRow | null>(null);
  const [letterUrl, setLetterUrl] = useState<string | null>(null);
  // undefined = 아직 읽는 중, null = 등록된 생일 없음
  const [birthDate, setBirthDate] = useState<string | null | undefined>(undefined);

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
      .then(({ data }) =>
        setStreak(computeStreak((data ?? []).filter(hasAnswers).map((r) => r.date as string)))
      );
    // 오늘의 운세에 쓸 생일 — 보호자가 어르신 정보에 적은 값(양력)
    supabase
      .from("elder_profile")
      .select("birth_date")
      .eq("id", elderId)
      .maybeSingle()
      .then(({ data }) => setBirthDate((data?.birth_date as string | null) ?? null));
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

  const dots = Array.from({ length: 7 }, (_, i) => i < streak % 7 || streak >= 7);

  return (
    <AppShell variant="elder">
      <div className="e-topbar">
        <DisplaySettings />
        <span className="e-brand">Callog</span>
      </div>
      <div className="e-hero">
        <div className="e-hero-mark">✓</div>
        <h1 className="e-question">잘 하셨어요</h1>
        <p className="e-lead">오늘 안부를 가족에게 전했어요.</p>
        <div className="e-streak">
          {dots.map((filled, i) => (
            <span key={i} className={filled ? "e-streak-dot e-streak-dot--filled" : "e-streak-dot"} />
          ))}
        </div>
        <p className="e-meta">{streak}일 연속 안부를 남기셨어요</p>
      </div>

      {birthDate !== undefined && (
        <Suspense fallback={null}>
          <ElderFortune birthDate={birthDate} />
        </Suspense>
      )}

      {FEATURES.videoLetters && letter && (
        <div className="e-card">
          <div className="e-card-label">가족이 보냈어요</div>
          <div className="e-card-title">{letter.title}</div>
          {letterUrl && <video src={letterUrl} controls className="e-media" />}
        </div>
      )}

      <SpeakButton text="오늘 안부를 가족에게 전했어요. 잘 하셨어요." />
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
      <button className={FEATURES.videoLetters ? "e-secondary" : "e-primary"} onClick={() => navigate("/elder/home")}>
        처음 화면으로
      </button>
    </AppShell>
  );
}
