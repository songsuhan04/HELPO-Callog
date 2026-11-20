import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { ElderTopBar } from "../components/ElderTopBar";
import { SpeakButton } from "../components/SpeakButton";
import { getStoredElderProfileId } from "../lib/elderSession";
import { getSignedUrl } from "../lib/storage";
import { VideoDownloadButton } from "../components/VideoDownloadButton";
import { getSupabase, supabaseConfigured } from "../lib/supabase";

export const SCREEN_ID = "eLetters";

// 어르신이 가족에게서 받은 영상편지를 전부 모아 다시 볼 수 있는 화면.
// 완료 화면(eDone)은 가장 최근 미확인 편지 1개만 보여줘서, 예전 편지를 다시 보거나
// 여러 편지를 한 번에 모아볼 방법이 없었다. 근거: 실사용 피드백 — "모아보는 화면이 없다"
interface LetterRow {
  id: string;
  title: string;
  video_url: string;
  sent_at: string;
  viewed_at: string | null;
  signedUrl?: string;
}

export default function ELetters() {
  const navigate = useNavigate();
  const [letters, setLetters] = useState<LetterRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }
    const elderId = getStoredElderProfileId();
    const supabase = getSupabase();
    supabase
      .from("video_letter")
      .select("id,title,video_url,sent_at,viewed_at")
      .eq("receiver_type", "elder")
      .eq("receiver_id", elderId)
      .order("sent_at", { ascending: false })
      .then(async ({ data }) => {
        const rows = (data ?? []) as LetterRow[];
        const withUrls = await Promise.all(
          rows.map(async (row) => ({ ...row, signedUrl: await getSignedUrl("letters", row.video_url).catch(() => undefined) }))
        );
        setLetters(withUrls);
        setLoading(false);
      });
  }, []);

  async function markViewed(letter: LetterRow) {
    if (letter.viewed_at) return;
    const viewedAt = new Date().toISOString();
    await getSupabase().from("video_letter").update({ viewed_at: viewedAt }).eq("id", letter.id);
    setLetters((prev) => prev.map((l) => (l.id === letter.id ? { ...l, viewed_at: viewedAt } : l)));
  }

  return (
    <AppShell variant="elder">
      <ElderTopBar onBack={() => navigate(-1)} />
      <h1 className="e-question">가족이 보낸 영상편지</h1>
      <SpeakButton text="가족이 보낸 영상편지입니다. 보고 싶은 편지를 눌러 재생해 주세요." />

      {loading && <p className="e-lead">불러오는 중...</p>}
      {!loading && letters.length === 0 && <p className="e-lead">아직 받은 영상편지가 없습니다.</p>}

      {letters.map((letter) => (
        <div key={letter.id} className="e-card">
          <div className="e-card-head">
            <div className="e-card-label">{new Date(letter.sent_at).toLocaleString("ko-KR")}</div>
            {!letter.viewed_at && <span className="e-badge-new">새 편지</span>}
          </div>
          <div className="e-card-title">{letter.title}</div>
          {letter.signedUrl && (
            <video src={letter.signedUrl} controls className="e-media" onPlay={() => markViewed(letter)} />
          )}
          <VideoDownloadButton
            path={letter.video_url}
            fileName={`가족영상편지-${letter.sent_at.slice(0, 10)}.webm`}
          />
        </div>
      ))}
    </AppShell>
  );
}
