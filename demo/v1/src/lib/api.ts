import { getSupabase } from "./supabase";

// 우리 서버 API(/api/*)를 부를 때 붙이는 헤더.
//
// 질문 생성·위험도 판정·음성 분석은 서버가 호출자를 확인한다(lib/requestAuth.ts) —
// 그 어르신의 보호자이거나, 초대로 연결된 어르신 본인의 세션이어야 한다. 그래서 지금
// 세션의 토큰을 실어 보낸다. 보호자는 로그인 세션, 어르신은 익명 세션이며 꺼내는 법은 같다.
//
// 세션이 없으면 토큰 없이 보낸다. 서버가 401로 막고, 화면은 실패했을 때의 흐름을 탄다.
export async function apiHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const { data } = await getSupabase().auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // 세션을 읽지 못해도 요청 자체는 보낸다 — 막는 판단은 서버가 한다
  }
  return headers;
}
