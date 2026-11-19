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
import { apiHeaders } from "../lib/api";
import {
  selectDailyQuestions,
  usableQuestions,
  type Category,
  type DailyQuestion,
  type QuestionOption,
  type Severity,
} from "../lib/questions";

export const SCREEN_ID = "eCheck";

// lib/riskScoring.ts가 위험도 계산에 쓰는 구조화된 응답 신호. 근거: 기능설계서.md §3, plan "P0"
interface AnsweredQuestion {
  /** 질문 표의 항목 id — 표현이 달라도 같은 질문임을 알아볼 수 있게 남긴다 */
  id?: string;
  question: string;
  category: Category;
  choice: string;
  severity: Severity;
}

// 지병을 읽는 데 이 시간을 넘기면 공통 질문만으로 시작한다. 서버에 닿지 못해 화면이 직접
// 고르는 상황이라 이 조회도 느릴 가능성이 높고, 어르신을 더 기다리게 할 이유가 없다.
const CONDITION_LOOKUP_MS = 3000;

export default function ECheck() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<DailyQuestion[]>([]);
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
      const date = todaySeoul();

      // 1. 새벽 크론이 미리 넣어둔 질문. 평소에는 여기서 끝난다.
      const prepared = await fetchDailyPrompt(elderId!, date);
      let list = usableQuestions(prepared?.questions);

      // 2. 없으면 서버에 고르게 한다(크론 뒤에 등록된 어르신 등). 서버도 AI를 부르지 않고
      //    질문 표에서 고르므로 곧바로 온다. 그래도 제한시간은 둔다 — 응답이 오지 않을 때
      //    어르신이 "준비하고 있어요"만 보며 기다리지 않도록.
      //    AbortSignal.timeout은 구형 웹뷰에 없을 수 있어 컨트롤러를 직접 쓴다.
      if (!list) {
        // 헤더(세션 토큰)는 시계를 켜기 전에 준비한다 — 8초는 서버 응답을 기다리는 시간이다
        const headers = await apiHeaders();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
          const resp = await fetch("/api/generate-questions", {
            method: "POST",
            headers,
            body: JSON.stringify({ elderProfileId: elderId, date }),
            signal: controller.signal,
          });
          // 서버가 거절(401·403)하거나 오류를 내도 본문은 JSON이다. 예전에는 그걸 "질문 0개"로
          // 받아들여 "준비된 질문이 없습니다"에서 멈췄다.
          if (resp.ok) list = usableQuestions((await resp.json()).questions);
        } catch {
          // 아래에서 화면이 직접 고른다
        } finally {
          clearTimeout(timer);
        }
      }

      // 3. 서버에 닿지 못했으면 화면이 같은 질문 표에서 직접 고른다. 날짜와 어르신이 같으면
      //    서버가 골랐을 것과 같은 질문이 나온다. 예전에는 여기서 "오늘 별일 없으셨어요?"
      //    한 문항으로 대신했고, 그날 안부가 질문 하나로 끝났다.
      if (!list) {
        const lookup = supabase
          .from("elder_condition")
          .select("condition_type")
          .eq("elder_profile_id", elderId)
          .then(({ data }) => (data ?? []).map((r) => r.condition_type as string));
        const giveUp = new Promise<string[]>((resolve) => setTimeout(() => resolve([]), CONDITION_LOOKUP_MS));
        const conditions = await Promise.race([lookup, giveUp]).catch(() => [] as string[]);
        list = selectDailyQuestions(conditions, date, elderId ?? "");
      }

      // 여기서 daily_checkin에 행을 만들지 않는다. 예전에는 새로고침 대비로 질문을 미리
      // 저장했는데, 그러면 어르신이 아무것도 답하지 않았는데 그날 행이 생긴다. 보호자 목록·
      // 위험도 계산·무응답 알림이 모두 "행이 있으면 응답한 것"으로 보기 때문에, 화면만 열고
      // 나간 어르신이 "오늘 완료"로 보이고 무응답 알림까지 막혔다.
      // 준비한 질문은 서버가 daily_prompt에 저장한다(api/generate-questions.ts).
      setQuestions(list);
      setLoading(false);
    }

    load();
  }, []);

  // 문항 중간이면 이전 문항으로(잘못 고른 답을 고치도록), 첫 문항이면 처음 화면으로 간다.
  // 근거: 실사용 피드백 — "설문할 때 뒤로가기 버튼이 없어졌어"
  // 예전에는 첫 문항에서 브라우저 뒤로가기(navigate(-1))를 했는데, 이제 링크를 열면 바로
  // 첫 질문이 나오므로(eInvited) 뒤로가기는 앱 밖으로 나가 버린다. 처음 화면(119 버튼이 있는 곳)으로 보낸다.
  function goBack() {
    if (index > 0) {
      setAnswers((prev) => prev.slice(0, -1));
      setIndex((i) => i - 1);
    } else {
      navigate("/elder/home");
    }
  }

  function answer(option: QuestionOption) {
    const question = questions[index];
    const next = [
      ...answers,
      {
        id: question.id,
        question: question.question,
        category: question.category,
        choice: option.text,
        severity: option.severity,
      },
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
    apiHeaders()
      .then((headers) =>
        fetch("/api/assess-risk", {
          method: "POST",
          headers,
          body: JSON.stringify({ elderProfileId: elderId, date }),
        })
      )
      .catch(() => {});
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
