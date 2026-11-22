import { getSupabase } from "./supabase";
import { getDeviceId } from "./deviceId";

const ELDER_PROFILE_KEY = "callog.elderProfileId";

export interface RedeemResult {
  elderProfileId: string;
  name: string;
}

// 초대 토큰을 익명 세션에 바인딩한다 (기기 변경/재초대 등 예외 처리는 redeem_invite RPC 내부에서 처리)
// 근거: docs/기능설계서.md §2.5, plan §"어르신 접근 방식"
export async function redeemInvite(token: string): Promise<RedeemResult> {
  const supabase = getSupabase();
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
  }
  const { data, error } = await supabase.rpc("redeem_invite", {
    p_token: token,
    p_device: getDeviceId(),
  });
  if (error) throw error;
  const result = data as RedeemResult;
  window.localStorage.setItem(ELDER_PROFILE_KEY, result.elderProfileId);
  return result;
}

export function getStoredElderProfileId(): string | null {
  return window.localStorage.getItem(ELDER_PROFILE_KEY);
}

// 이 기기에 저장하는 "오늘 운세를 열었다" 같은 기억은 어르신마다 따로 둔다.
// 예전에는 기기 하나에 하나뿐이라, 한 휴대폰으로 두 어르신 링크를 열면 앞사람이 연 복주머니가
// 뒷사람에게도 이미 열린 채로 보였다(2026-11-22 확인).
export function elderScopedKey(base: string): string {
  return `${base}.${getStoredElderProfileId() ?? "none"}`;
}

export function clearStoredElderProfileId(): void {
  window.localStorage.removeItem(ELDER_PROFILE_KEY);
}

// 재방문 시 토큰 없이 세션 유효성만 가볍게 확인 ("계정처럼 계속 유지")
//
// touch_elder_device()는 연결이 끊겼을 때 에러를 내지 않고 false를 돌려준다. 예전에는
// 여기서 error만 보고 `return !error` 했는데, false가 와도 error는 null이라 항상 통과했다.
// 그래서 보호자가 어르신을 삭제해도(elder_device가 CASCADE로 사라져도) 어르신 기기에서는
// 예전 링크로 계속 설문이 됐다. 초대 해제도 같은 이유로 실제로 막히지 않았다.
// 반환값을 반드시 확인한다.
//
// 결과는 셋으로 나눈다(2026-11-19). 예전에는 통신 오류도 false(연결 끊김)로 돌려줘서, 잠깐
// 신호가 약한 순간에 화면을 넘기면 어르신 기기의 연결 정보가 지워지고 초대 링크를 다시
// 받아야 했다. 끊김(revoked)과 일시 오류(error)는 다르게 다룬다.
//  - ok: 연결돼 있음
//  - revoked: 세션이 없거나 보호자가 연결을 끊음 → 처음 화면으로
//  - error: 통신 오류 → 막지 않는다. 데이터는 어차피 서버 권한(RLS·API 확인)이 지킨다
export type ElderDeviceStatus = "ok" | "revoked" | "error";

export async function touchElderDevice(): Promise<ElderDeviceStatus> {
  try {
    const supabase = getSupabase();
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return "revoked";
    const { data, error } = await supabase.rpc("touch_elder_device");
    if (error) return "error";
    return data === true ? "ok" : "revoked";
  } catch {
    return "error";
  }
}
