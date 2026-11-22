import { getSupabase } from "./supabase";
import type { DailyQuestion } from "./questions";

// 보호자가 직접 만든 질문("부모님께 묻고 싶은 질문", family_question 표).
//
// 매일 질문(서버가 고름)은 그대로 두고, 어르신 화면이 그 뒤에 켜져 있는 보호자 질문을 붙인다.
// 선택지는 모두 severity "ok" — 보호자가 쓴 질문 때문에 위험도가 오르거나 알림이 가면 안 된다.
// 답은 다른 답과 함께 daily_checkin.answers에 남고, id가 "family:<질문 id>"라 다시 찾을 수 있다.

export const FAMILY_ID_PREFIX = "family:";
export const FAMILY_MAX_ACTIVE = 2;
export const FAMILY_QUESTION_MAX = 40;
export const FAMILY_OPTION_MAX = 12;

export interface FamilyQuestionRow {
  id: string;
  question: string;
  options: string[];
  active: boolean;
  created_at: string;
}

// 보호자 질문을 읽다가 느리거나 실패해도 오늘 안부는 평소대로 시작해야 한다
const LOOKUP_MS = 3000;

export async function fetchFamilyQuestionsForElder(elderId: string): Promise<DailyQuestion[]> {
  const lookup = getSupabase()
    .from("family_question")
    .select("id,question,options")
    .eq("elder_profile_id", elderId)
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(FAMILY_MAX_ACTIVE)
    .then(({ data, error }) => {
      if (error) return [];
      return (data ?? [])
        .filter((r) => typeof r.question === "string" && Array.isArray(r.options) && r.options.length >= 2)
        .map(
          (r): DailyQuestion => ({
            id: `${FAMILY_ID_PREFIX}${r.id as string}`,
            question: r.question as string,
            category: "family",
            options: (r.options as string[]).map((text) => ({ text, severity: "ok" as const })),
          })
        );
    });
  const giveUp = new Promise<DailyQuestion[]>((resolve) => setTimeout(() => resolve([]), LOOKUP_MS));
  return Promise.race([lookup, giveUp]).catch(() => []);
}

// DB 트리거가 보내는 오류를 보호자가 알아들을 말로
export function familyQuestionError(message: string | undefined): string {
  if (message?.includes("family_question_limit")) return `켜 둔 질문은 ${FAMILY_MAX_ACTIVE}개까지예요. 하나를 끄고 다시 해 주세요.`;
  if (message?.includes("family_question_option_length")) return `답은 ${FAMILY_OPTION_MAX}자까지 쓸 수 있어요.`;
  return "저장하지 못했어요. 잠시 뒤 다시 해 주세요.";
}
