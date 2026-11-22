import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { BackButton } from "../components/BackButton";
import { Chip } from "../components/Chip";
import { CONDITION_CATEGORIES, CONDITIONS, getConditionsByCategory } from "../domain/conditions";
import {
  MAX_CONDITION_QUESTIONS,
  conditionQuestionCount,
  conditionsWithoutQuestion,
  previewQuestions,
} from "../lib/questions";
import { getSupabase, supabaseConfigured } from "../lib/supabase";
import { getErrorMessage } from "../lib/errors";
import { ConsentItem } from "../components/ConsentItem";

export const SCREEN_ID = "cond";

// 지병 선택 — 등록 흐름(어르신 정보 다음)과 수정 흐름(대상자 상세에서 진입) 양쪽에서 재사용.
//
// 수정 흐름이 없어서 한 번 등록하면 지병을 바꿀 방법이 없었는데, 지병은 안부 질문 생성과
// 위험도 가중치의 핵심 입력이라(고혈압+복약 ×1.5, 당뇨+결식 ×2.0) 새로 진단받거나 잘못
// 고른 경우 반드시 고칠 수 있어야 한다. 근거: 실사용 피드백
//
// 저장은 "기존 삭제 후 새로 삽입"이다. 예전에는 insert만 해서 이 화면에 다시 들어오면
// 같은 지병이 중복으로 쌓였다.
export default function Cond() {
  const { elderId } = useParams<{ elderId: string }>();
  const location = useLocation();
  const state = location.state as { fromSignup?: boolean; mode?: "edit" } | null;
  const fromSignup = Boolean(state?.fromSignup);
  const isEdit = state?.mode === "edit";
  const navigate = useNavigate();

  const [selected, setSelected] = useState<string[]>([]);
  const [customText, setCustomText] = useState("");
  // 수정 흐름에서는 이미 동의한 상태로 등록된 어르신이므로 다시 받지 않는다
  const [consentHealth, setConsentHealth] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(isEdit);

  useEffect(() => {
    if (!isEdit || !supabaseConfigured || !elderId) return;
    getSupabase()
      .from("elder_condition")
      .select("condition_type,custom_text")
      .eq("elder_profile_id", elderId)
      .then(({ data, error }) => {
        if (error) {
          setError(getErrorMessage(error, "지병 정보를 불러오지 못했어요"));
        } else {
          const rows = data ?? [];
          setSelected(rows.filter((r) => r.condition_type !== "custom").map((r) => r.condition_type as string));
          setCustomText((rows.find((r) => r.condition_type === "custom")?.custom_text as string) ?? "");
        }
        setLoadingExisting(false);
      });
  }, [isEdit, elderId]);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // 미리보기는 실제로 질문을 고르는 코드와 같은 표에서 뽑는다(src/lib/questions.ts).
  // 예전에는 이 화면만의 목록으로 보여줘서, 여기 적힌 것과 어르신께 나가는 질문이 달랐다.
  const preview = previewQuestions(selected);
  const rotatesConditions = conditionQuestionCount(selected) > MAX_CONDITION_QUESTIONS;
  const uncovered = conditionsWithoutQuestion(selected)
    .map((id) => CONDITIONS.find((c) => c.id === id)?.label)
    .filter((label): label is string => Boolean(label));
  const riskNotes = CONDITIONS.filter((c) => selected.includes(c.id) && c.riskNote);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      const supabase = getSupabase();

      // 기존 지병을 먼저 비운다 — 다시 들어왔을 때 중복으로 쌓이지 않게.
      // 삭제와 삽입을 한 트랜잭션으로 묶을 수 없어 그 사이에 실패하면 지병이 비게 되는데,
      // 아래 삽입 실패 시 에러를 그대로 띄워 다시 저장하도록 안내한다.
      const { error: delError } = await supabase.from("elder_condition").delete().eq("elder_profile_id", elderId);
      if (delError) throw delError;

      const rows = selected.map((id) => ({ elder_profile_id: elderId, condition_type: id }));
      if (customText.trim()) {
        rows.push({ elder_profile_id: elderId!, condition_type: "custom", custom_text: customText.trim() } as never);
      }
      if (rows.length > 0) {
        const { error } = await supabase.from("elder_condition").insert(rows);
        if (error) throw error;
      }

      navigate(isEdit ? `/guardian/elders/${elderId}` : `/guardian/elders/${elderId}/invite`);
    } catch (err) {
      setError(getErrorMessage(err, "지병을 저장하지 못했어요"));
    } finally {
      setLoading(false);
    }
  }

  if (loadingExisting) return <AppShell><p className="g-sub">불러오는 중...</p></AppShell>;

  return (
    <AppShell>
      <BackButton />
      <div className="g-header">{isEdit ? "지병 수정" : fromSignup ? "가족 · 계정 · 4 / 4" : "지병 선택"}</div>
      <h1 className="g-title">앓고 계신 병을 골라주세요</h1>
      <p className="g-sub">고른 병에 맞춰 질문이 바뀌어요.</p>

      {CONDITION_CATEGORIES.map((category) => (
        <div className="u-mb16" key={category}>
          <div className="g-header">{category}</div>
          {getConditionsByCategory(category).map((c) => (
            <Chip key={c.id} label={c.label} selected={selected.includes(c.id)} onClick={() => toggle(c.id)} />
          ))}
        </div>
      ))}

      <div className="g-field">
        <label>직접 입력 (목록에 없는 경우)</label>
        <input value={customText} onChange={(e) => setCustomText(e.target.value)} placeholder="예: 갑상선 질환" />
      </div>

      <div className="g-card u-mb16">
        <div className="g-card-title">
          <span>어르신께 매일 물을 질문 {preview.length}개</span>
        </div>
        <ol className="g-questions">
          {preview.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ol>
        <div className="g-note g-note--plain">
          같은 질문을 날마다 다른 말로 여쭤요. 질문 수는 매일 같아요.
          <div>· 보호자가 직접 만든 질문(상세 화면 "부모님께 묻고 싶은 질문")은 이 뒤에 더해져요.</div>
          {rotatesConditions && (
            <div>· 지병 질문은 하루 {MAX_CONDITION_QUESTIONS}개까지 묻고, 날마다 돌아가며 바뀌어요.</div>
          )}
          {uncovered.length > 0 && (
            <div>· 아직 맞춤 질문이 없는 지병: {uncovered.join(", ")}. 공통 질문으로 살펴요.</div>
          )}
        </div>
        {riskNotes.length > 0 && (
          <div className="g-note">
            {riskNotes.map((c) => (
              <div key={c.id}>· {c.label} — {c.riskNote}</div>
            ))}
          </div>
        )}
      </div>

      {/* 개인정보보호법 §23 대응 — 건강정보는 민감정보라 일반 개인정보 동의와 별도로
          받아야 하고, 보호자가 어르신을 대신해 입력하므로 대리 동의 확인 문구도 필요하다.
          근거: Help4/법적문제 피해가기 공략.pdf §1, 체크리스트 1번
          ⚠️ 예전에는 지병을 하나도 고르지 않으면 이 동의를 건너뛸 수 있게 해뒀는데, 근거 문서가
          "지병 정보 및 매일 응답하는 안부 체크리스트 데이터"를 모두 민감정보로 규정하고 있어
          잘못된 처리였다. 안부 응답은 지병 입력 여부와 무관하게 항상 수집되므로 항상 필수다.
          수정 흐름에서는 등록 때 이미 받았으므로 다시 요구하지 않는다. */}
      {!isEdit && (
        <ConsentItem
          checked={consentHealth}
          onChange={setConsentHealth}
          label="(필수) 건강 관련 민감정보 수집·이용에 동의해요"
          detail={
            <>
              <div>수집 항목: 지병명(사전 정의 목록 또는 직접 입력), 매일의 안부 체크 응답(복약·식사·외출·몸 상태 등), 말하기 안부 음성</div>
              <div>수집 목적: 지병에 맞춘 안부 질문 생성, 위험도 산정 시 가중치 반영</div>
              <div>보유 기간: 어르신 등록 해제 시까지</div>
              <div>대리 입력: 보호자가 어르신을 대신하여 입력하며, 어르신 본인의 사전 동의를 받았다는 것을 전제로 해요.</div>
              <div>동의를 거부할 권리가 있으나, 안부 응답 자체가 건강에 관한 정보에 해당하므로 동의하지 않으면 서비스를 이용할 수 없어요.</div>
            </>
          }
        />
      )}

      {error && <p className="g-error">{error}</p>}
      <button
        className="g-button"
        onClick={handleSubmit}
        disabled={loading || (!isEdit && !consentHealth) || !supabaseConfigured}
      >
        {loading ? "저장 중..." : isEdit ? "고친 내용 저장하기" : "저장하고 초대하기"}
      </button>
    </AppShell>
  );
}
