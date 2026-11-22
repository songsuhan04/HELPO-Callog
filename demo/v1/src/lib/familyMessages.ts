import { getSupabase } from "./supabase";

// 가족 한마디(family_message) — 보호자가 어르신께 남기는 짧은 글.
// 영상편지를 끄면서 사라진 "보호자 → 어르신" 연락 길을 가볍게 되살린다(2026-11-23).

export const FAMILY_MESSAGE_MAX = 60;
/** 어르신 화면에는 최근 이 기간 안의 글만 보여 드린다 — 오래된 글이 계속 맨 위에 있지 않게 */
export const FAMILY_MESSAGE_SHOW_DAYS = 7;

export interface FamilyMessageRow {
  id: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

// 어르신 화면용: 가장 최근 글 하나. 못 읽으면 조용히 없는 것으로 본다(안부는 평소대로).
export async function fetchLatestFamilyMessage(elderId: string): Promise<FamilyMessageRow | null> {
  const since = new Date(Date.now() - FAMILY_MESSAGE_SHOW_DAYS * 86_400_000).toISOString();
  const { data, error } = await getSupabase()
    .from("family_message")
    .select("id,body,created_at,read_at")
    .eq("elder_profile_id", elderId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as FamilyMessageRow;
}

// 어르신이 화면에서 본 순간 "읽음"으로 남긴다. 보호자 화면에 "읽으셨어요"가 뜬다.
export function markFamilyMessageRead(id: string): void {
  void getSupabase().rpc("mark_family_message_read", { p_id: id });
}

export function familyMessageError(message: string | undefined): string {
  if (message?.includes("family_message_daily_limit")) return "한마디는 하루에 10개까지 보낼 수 있어요.";
  return "보내지 못했어요. 잠시 뒤 다시 해 주세요.";
}
