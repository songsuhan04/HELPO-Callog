import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 어르신 데이터를 다루는 API(질문 생성·위험도 판정·음성 분석)의 호출자 확인.
//
// 예전에는 세 API 모두 요청 방식(POST)만 보고 통과시켰다. 저장소가 public이라 주소가
// 그대로 드러나 있으므로, 주소만 알면 누구나 팀 계정으로 Gemini를 부를 수 있었다.
// 비용만의 문제도 아니다. 질문 생성은 요청에 적힌 어르신 ID로 그날 질문(daily_prompt)을
// 서비스 롤로 덮어쓰고, 위험도 판정은 보호자 화면의 등급을 다시 쓴다 — 남의 어르신 것도
// 바꿀 수 있었다. 근거: 2회차 기술 멘토링(2026-11-12) 지적.
//
// 호출자는 둘이다.
//  - 보호자: 정식 계정. 그 어르신을 등록한 계정이어야 한다.
//  - 어르신: 익명 세션. 초대 링크의 토큰은 처음 한 번 연결할 때만 쓰이고(redeem_invite),
//    그 뒤로는 세션이 곧 신원이다(elder_device.auth_user_id). 그래서 링크 토큰이 아니라
//    세션을 본다. 보호자가 연결을 끊으면(revoked_at) 그 세션은 더 통과하지 못한다.
//
// 설정이 빠졌을 때는 닫히는 쪽으로 실패한다(lib/cronAuth.ts와 같은 이유) — 확인할 수단이
// 없는데 통과시키면 예전과 같아진다.

export interface Caller {
  /** 서비스 롤 클라이언트. 확인을 통과한 뒤 핸들러가 그대로 이어 쓴다 */
  admin: SupabaseClient;
  userId: string;
  isAnonymous: boolean;
}

/** 요청에 실린 세션이 진짜인지 본다. 막았으면 null(응답은 여기서 보낸다). */
export async function authenticate(req: VercelRequest, res: VercelResponse): Promise<Caller | null> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("authenticate: Supabase 설정이 없어 요청을 거부합니다");
    res.status(503).json({ error: "supabase_not_configured" });
    return null;
  }

  const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
  if (!token) {
    res.status(401).json({ error: "unauthorized" });
    return null;
  }

  const admin = createClient(supabaseUrl, serviceKey);
  // 토큰을 직접 풀어보지 않고 Supabase에 묻는다 — 만료·로그아웃·삭제된 계정까지 걸러진다
  const { data, error } = await admin.auth.getUser(token);
  const user = data?.user;
  if (error || !user) {
    res.status(401).json({ error: "unauthorized" });
    return null;
  }
  return { admin, userId: user.id, isAnonymous: Boolean(user.is_anonymous) };
}

/** 이 호출자가 그 어르신의 보호자이거나 그 어르신 본인(연결된 세션)인가 */
export async function canAccessElder(caller: Caller, elderProfileId: string): Promise<boolean> {
  if (!caller.isAnonymous) {
    const { data: owned } = await caller.admin
      .from("elder_profile")
      .select("id")
      .eq("id", elderProfileId)
      .eq("family_account_id", caller.userId)
      .maybeSingle();
    if (owned) return true;
  }
  const { data: device } = await caller.admin
    .from("elder_device")
    .select("id")
    .eq("elder_profile_id", elderProfileId)
    .eq("auth_user_id", caller.userId)
    .is("revoked_at", null)
    .maybeSingle();
  return Boolean(device);
}

/**
 * 세션 확인과 어르신 접근 확인을 한 번에. 요청에 어르신 ID가 바로 들어 있는 API가 쓴다.
 * 통과하면 Caller, 막았으면 null(응답은 여기서 보낸다).
 */
export async function authorizeElderAccess(
  req: VercelRequest,
  res: VercelResponse,
  elderProfileId: unknown
): Promise<Caller | null> {
  const caller = await authenticate(req, res);
  if (!caller) return null;
  if (typeof elderProfileId !== "string" || !elderProfileId) {
    res.status(400).json({ error: "elderProfileId required" });
    return null;
  }
  if (!(await canAccessElder(caller, elderProfileId))) {
    res.status(403).json({ error: "forbidden" });
    return null;
  }
  return caller;
}
