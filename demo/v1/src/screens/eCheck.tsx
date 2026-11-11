import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { SpeakButton } from "../components/SpeakButton";
import { ProgressBar } from "../components/ProgressBar";
import { DisplaySettings } from "../components/DisplaySettings";
import { getStoredElderProfileId } from "../lib/elderSession";
import { getSupabase, supabaseConfigured } from "../lib/supabase";
import { todaySeoul } from "../lib/date";
import { fetchDailyPrompt } from "../lib/dailyPrompt";

export const SCREEN_ID = "eCheck";

type Category = "medication" | "meal" | "outing" | "mood" | "condition" | "other";
type Severity = "ok" | "warn" | "danger";

interface GeneratedOption {
  text: string;
  severity: Severity;
}

interface GeneratedQuestion {
  question: string;
  category: Category;
  options: GeneratedOption[];
}

// lib/riskScoring.ts가 위험도 계산에 쓰는 구조화된 응답 신호. 근거: 기능설계서.md §3, plan "P0"
interface AnsweredQuestion {
  question: string;
  category: Category;
  choice: string;
  severity: Severity;
}


export default function ECheck() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [answers, setAnswers] = useState<AnsweredQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [slow, setSlow] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // 3초가 지나도 안 뜨면 기다려도 되는 상황임을 알려드린다
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 3000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }
    const elderId = getStoredElderProfileId();
    const supabase = getSupabase();

    async function load() {
      // 새벽 크론이 미리 만들어둔 것이 있으면 그걸 쓴다 — AI 호출을 기다리지 않는다.
      // 근거: 실사용 피드백 — "버퍼링이 걸리더라"
      // 즉석 생성한 질문도 여기에 저장되므로, 새로고침해도 같은 질문이 나온다.
      const prepared = await fetchDailyPrompt(elderId!, todaySeoul());
      if (prepared?.questions && prepared.questions.length > 0) {
        setQuestions(prepared.questions as GeneratedQuestion[]);
        setLoading(false);
        return;
      }

      const [{ data: conditionRows }, { data: recentRows }] = await Promise.all([
        supabase.from("elder_condition").select("condition_type").eq("elder_profile_id", elderId),
        supabase
          .from("daily_checkin")
          .select("questions")
          .eq("elder_profile_id", elderId)
          .order("date", { ascending: false })
          .limit(3),
      ]);

      const conditions = (conditionRows ?? []).map((r) => r.condition_type as string);
      const recentQuestions = (recentRows ?? [])
        .flatMap((r) => ((r.questions as GeneratedQuestion[]) ?? []).map((q) => q.question))
        .slice(0, 12);

      let generated: GeneratedQuestion[] = [];
      // 제한시간을 둔다. 예전에는 없어서, AI 응답이 늦으면 어르신이 "준비하고 있어요..."만
      // 보며 언제까지인지 모른 채 기다리셨다(실사용 신고). catch는 네트워크가 끊겼을 때만
      // 걸리지 느린 것은 못 잡는다. 8초가 지나면 아래 기본 문항으로 넘어간다.
      // AbortSignal.timeout은 구형 웹뷰에 없을 수 있어 컨트롤러를 직접 쓴다.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const resp = await fetch("/api/generate-questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conditions, recentQuestions, elderProfileId: elderId, date: todaySeoul() }),
          signal: controller.signal,
        });
        const json = await resp.json();
        generated = json.questions ?? [];
      } catch {
        // 네트워크 실패 시에도 화면이 멈추지 않도록 최소 문항으로 진행
        generated = [
          {
            question: "오늘 별일 없으셨어요?",
            category: "other",
            options: [
              { text: "네, 괜찮아요", severity: "ok" },
              { text: "조금 힘들었어요", severity: "warn" },
            ],
          },
        ];
      } finally {
        clearTimeout(timer);
      }

      // 여기서 daily_checkin에 행을 만들지 않는다. 예전에는 새로고침 대비로 질문을 미리
      // 저장했는데, 그러면 어르신이 아무것도 답하지 않았는데 그날 행이 생긴다. 보호자 목록·
      // 위험도 계산·무응답 알림이 모두 "행이 있으면 응답한 것"으로 보기 때문에, 화면만 열고
      // 나간 어르신이 "오늘 완료"로 보이고 무응답 알림까지 막혔다.
      // 질문은 서버가 daily_prompt에 저장한다(api/generate-questions.ts).
      setQuestions(generated);
      setLoading(false);
    }

    load();
  }, []);

  // 문항 중간이면 이전 문항으로(잘못 고른 답을 고치도록), 첫 문항이면 설문 진입 전
  // 화면으로 나간다. 근거: 실사용 피드백 — "설문할 때 뒤로가기 버튼이 없어졌어"
  function goBack() {
    if (index > 0) {
      setAnswers((prev) => prev.slice(0, -1));
      setIndex((i) => i - 1);
    } else {
      navigate(-1);
    }
  }

  function answer(option: GeneratedOption) {
    const question = questions[index];
    const next = [
      ...answers,
      { question: question.question, category: question.category, choice: option.text, severity: option.severity },
    ];
    setAnswers(next);
    if (index + 1 < questions.length) {
      setIndex(index + 1);
    } else {
      finish(next);
    }
  }

  async function finish(finalAnswers: AnsweredQuestion[]) {
    const elderId = getStoredElderProfileId();
    const date = todaySeoul();
    setSaveError(null);
    // 저장 결과를 확인한다. 예전에는 그냥 넘어가서, 저장이 실패해도 어르신은 안부를 전한
    // 줄 알고 화면을 떠났다. 보호자에게는 아무것도 남지 않는다.
    const { error } = await getSupabase()
      .from("daily_checkin")
      .upsert(
        { elder_profile_id: elderId, date, answers: finalAnswers, skipped: false, questions },
        { onConflict: "elder_profile_id,date" }
      );
    if (error) {
      setSaveError("안부를 저장하지 못했어요. 잠시 후 다시 눌러주세요.");
      return;
    }
    // 위험도 계산은 fire-and-forget — 여기까지 왔으면 하루 기록은 이미 저장되어 있다
    fetch("/api/assess-risk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ elderProfileId: elderId, date }),
    }).catch(() => {});
    navigate("/elder/speech");
  }

  // 예전에는 이 화면이 글 한 줄뿐이라, 늦어질 때 어르신 눈에는 그냥 빈 화면이었다(실사용 신고).
  // 상단 막대를 남겨 "앱은 살아 있다"를 보이게 하고, 늦어지면 기다려도 된다고 알려드린다.
  if (loading)
    return (
      <AppShell variant="elder">
        <div className="e-topbar">
          <DisplaySettings />
          <span className="e-brand">Callog</span>
        </div>
        <div className="e-hero">
          <h1 className="e-question">오늘의 안부를 준비하고 있어요</h1>
          <p className="e-lead">잠시만 기다려 주세요.</p>
          {slow && <p className="e-meta">조금 늦어지고 있어요. 곧 시작됩니다.</p>}
        </div>
      </AppShell>
    );
  const question = questions[index];
  if (!question) return <AppShell variant="elder"><p className="e-lead">준비된 질문이 없습니다.</p></AppShell>;

  return (
    <AppShell variant="elder">
      <button className="e-back" onClick={goBack}>
        ← 이전
      </button>
      <div className="e-topbar">
        <DisplaySettings />
        <span className="e-brand">Callog</span>
      </div>
      {saveError && (
        <>
          <p className="e-error">{saveError}</p>
          <button className="e-primary" onClick={() => finish(answers)}>
            다시 보내기
          </button>
        </>
      )}
      <ProgressBar current={index + 1} total={questions.length} />
      <h1 className="e-question">{question.question}</h1>
      <SpeakButton text={question.question} />

      {question.options.map((option) => (
        <button key={option.text} className="e-choice" onClick={() => answer(option)}>
          {option.text}
        </button>
      ))}
    </AppShell>
  );
}
