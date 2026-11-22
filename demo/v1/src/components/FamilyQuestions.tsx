import { useEffect, useState } from "react";
import { getSupabase } from "../lib/supabase";
import {
  FAMILY_ID_PREFIX,
  FAMILY_MAX_ACTIVE,
  FAMILY_OPTION_MAX,
  FAMILY_QUESTION_MAX,
  familyQuestionError,
  type FamilyQuestionRow,
} from "../lib/familyQuestions";

// 보호자 상세 화면의 "부모님께 묻고 싶은 질문".
// 2차 테스트 의견 — "부모님께 궁금한 질문을 보호자가 직접 만들 수 있으면 좋겠다"(2026-11-22).
//
// 어르신이 답하기 쉽게: 질문은 짧게(40자), 답은 고르는 방식(2~3개, 각 12자), 켜 둔 질문은 2개까지.
// 직접 쓰는 답은 어르신께 어렵고, 질문이 많아지면 매일 안부가 길어져 그만두신다.

const EXAMPLES = ["오늘 경로당 다녀오셨어요?", "오늘 병원이나 약국 다녀오셨어요?", "이번 주말에 저희 가도 괜찮으세요?"];

const PRESETS: { label: string; options: string[] }[] = [
  { label: "네 / 아니요", options: ["네", "아니요"] },
  { label: "했어요 / 아직이요", options: ["했어요", "아직이요"] },
  { label: "좋아요 / 그저 그래요 / 안 좋아요", options: ["좋아요", "그저 그래요", "안 좋아요"] },
];

interface RecentAnswer {
  date: string;
  choice: string;
}

function shortDate(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

export function FamilyQuestions({ elderId }: { elderId: string }) {
  const [rows, setRows] = useState<FamilyQuestionRow[] | null>(null);
  const [recent, setRecent] = useState<Record<string, RecentAnswer[]>>({});
  const [text, setText] = useState("");
  const [preset, setPreset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    supabase
      .from("family_question")
      .select("id,question,options,active,created_at")
      .eq("elder_profile_id", elderId)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        // 표가 아직 없거나 읽지 못하면 이 칸을 통째로 숨긴다 — 상세 화면의 다른 내용은 그대로
        if (error) setRows(null);
        else setRows((data ?? []) as FamilyQuestionRow[]);
      });
    // 최근 2주 답에서 보호자 질문의 답만 골라 둔다
    supabase
      .from("daily_checkin")
      .select("date,answers")
      .eq("elder_profile_id", elderId)
      .order("date", { ascending: false })
      .limit(14)
      .then(({ data }) => {
        const map: Record<string, RecentAnswer[]> = {};
        for (const row of data ?? []) {
          const answers = Array.isArray(row.answers) ? (row.answers as { id?: string; choice?: string }[]) : [];
          for (const a of answers) {
            if (!a?.id?.startsWith(FAMILY_ID_PREFIX) || !a.choice) continue;
            const qid = a.id.slice(FAMILY_ID_PREFIX.length);
            (map[qid] ??= []).push({ date: row.date as string, choice: a.choice });
          }
        }
        setRecent(map);
      });
  }, [elderId]);

  if (rows === null) return null;

  const activeCount = rows.filter((r) => r.active).length;
  const canAdd = activeCount < FAMILY_MAX_ACTIVE;
  const trimmed = text.trim();

  async function add() {
    if (trimmed.length < 2 || busy) return;
    setBusy(true);
    setError(null);
    const { data, error } = await getSupabase()
      .from("family_question")
      .insert({ elder_profile_id: elderId, question: trimmed, options: PRESETS[preset].options })
      .select("id,question,options,active,created_at")
      .single();
    setBusy(false);
    if (error || !data) {
      setError(familyQuestionError(error?.message));
      return;
    }
    setRows((prev) => [...(prev ?? []), data as FamilyQuestionRow]);
    setText("");
  }

  async function toggle(row: FamilyQuestionRow) {
    setBusy(true);
    setError(null);
    const { data, error } = await getSupabase()
      .from("family_question")
      .update({ active: !row.active })
      .eq("id", row.id)
      .select("id,question,options,active,created_at")
      .single();
    setBusy(false);
    if (error || !data) {
      setError(familyQuestionError(error?.message));
      return;
    }
    setRows((prev) => (prev ?? []).map((r) => (r.id === row.id ? (data as FamilyQuestionRow) : r)));
  }

  async function remove(row: FamilyQuestionRow) {
    if (!window.confirm(`"${row.question}" 질문을 지울까요? 지금까지 받은 답은 안부 기록에 그대로 남아요.`)) return;
    setBusy(true);
    setError(null);
    const { error } = await getSupabase().from("family_question").delete().eq("id", row.id);
    setBusy(false);
    if (error) {
      setError(familyQuestionError(error.message));
      return;
    }
    setRows((prev) => (prev ?? []).filter((r) => r.id !== row.id));
  }

  return (
    <div className="g-card g-section">
      <div className="g-card-title">
        <span>부모님께 묻고 싶은 질문</span>
        <span>
          켜 둔 질문 {activeCount} / {FAMILY_MAX_ACTIVE}
        </span>
      </div>
      <p className="g-sub u-m0 u-mb12">
        매일 안부 질문 끝에 "가족이 궁금해해요"라고 함께 여쭤요. 위험도 계산에는 들어가지 않아요.
      </p>

      {rows.map((row) => {
        const answers = (recent[row.id] ?? []).slice(0, 3);
        return (
          <div key={row.id} className={row.active ? "g-fq-item" : "g-fq-item g-fq-item--off"}>
            <div className="g-fq-body">
              <div className="g-fq-question">{row.question}</div>
              <div className="g-fq-meta">
                답: {row.options.join(" / ")}
                {!row.active && " · 꺼 둠"}
              </div>
              <div className="g-fq-answers">
                {answers.length > 0
                  ? answers.map((a) => (
                      <span key={a.date}>
                        {shortDate(a.date)} <b>{a.choice}</b>
                      </span>
                    ))
                  : "아직 받은 답이 없어요"}
              </div>
            </div>
            <button type="button" className="g-rowaction" onClick={() => toggle(row)} disabled={busy || (!row.active && !canAdd)}>
              {row.active ? "끄기" : "켜기"}
            </button>
            <button type="button" className="g-rowaction g-rowaction--danger" onClick={() => remove(row)} disabled={busy}>
              삭제
            </button>
          </div>
        );
      })}

      {canAdd ? (
        <div className="g-fq-form">
          <div className="g-field u-mb8">
            <label htmlFor="fq-text">질문 ({FAMILY_QUESTION_MAX}자까지)</label>
            <input
              id="fq-text"
              value={text}
              maxLength={FAMILY_QUESTION_MAX}
              onChange={(e) => setText(e.target.value)}
              placeholder="예: 오늘 경로당 다녀오셨어요?"
            />
          </div>
          <div className="g-fq-examples" aria-label="예시 질문">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="g-fq-example" onClick={() => setText(ex)}>
                {ex}
              </button>
            ))}
          </div>
          <div className="g-field u-mb8">
            <label>어르신이 고를 답 ({FAMILY_OPTION_MAX}자 이내)</label>
            <div className="g-fq-presets">
              {PRESETS.map((p, i) => (
                <button
                  key={p.label}
                  type="button"
                  className={i === preset ? "g-chip g-chip--selected" : "g-chip"}
                  aria-pressed={i === preset}
                  onClick={() => setPreset(i)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="g-button g-button--secondary" onClick={add} disabled={busy || trimmed.length < 2}>
            {busy ? "저장 중..." : "질문 추가"}
          </button>
        </div>
      ) : (
        <p className="g-legal u-mt8">질문은 {FAMILY_MAX_ACTIVE}개까지 켤 수 있어요. 새 질문을 넣으려면 하나를 꺼 주세요.</p>
      )}
      {error && <p className="g-error">{error}</p>}
    </div>
  );
}
