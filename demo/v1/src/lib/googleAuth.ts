import { getSupabase, supabaseConfigured } from "./supabase";

// 구글 로그인.
//
// 이메일/비밀번호 가입을 없애지 않고 '추가'한다. 체험 중인 가정이 이미 이메일로
// 가입해 쓰고 있어서, 기존 경로를 끊으면 그분들이 다시 가입해야 한다.
//
// 구글을 쓰면 이메일 소유 검증이 따라온다 — 4차 개정에서 Resend 샌드박스 제약으로
// 이메일 인증을 제거한 뒤 비어 있던 자리다(기능설계서 §2.6).

export const googleAuthAvailable = supabaseConfigured;

/**
 * 구글 동의 화면으로 보낸다. 성공하면 이 함수는 돌아오지 않는다 — 브라우저가
 * 구글로 이동하고, 끝나면 /auth/callback 으로 돌아온다.
 *
 * redirectTo를 현재 origin으로 잡는 이유: 로컬(5173)과 배포본이 같은 코드를 쓰는데
 * 주소를 하드코딩하면 로컬에서 로그인할 때 배포본으로 튕긴다. Supabase 대시보드의
 * Redirect URLs에 두 주소가 모두 등록돼 있어야 동작한다.
 */
export async function signInWithGoogle(): Promise<void> {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + "/auth/callback" },
  });
  if (error) throw error;
}
