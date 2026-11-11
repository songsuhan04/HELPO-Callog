// Supabase의 PostgrestError/AuthError는 항상 `instanceof Error`가 아니다 (PostgrestError는 일반
// 객체 { message, details, hint, code }). `err instanceof Error`로만 분기하면 실제 원인이
// 화면에서 사라지고 fallback 문구만 보이는 문제가 있어(redeem_invite RPC 에러에서 실사용 중 발견),
// message 속성이 있는 값이면 항상 그것을 쓰도록 통일한다.
export function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return fallback;
}

// create_invite/revoke_elder_access 등 RPC가 raise exception으로 던지는 코드성 메시지를
// 사용자에게 그대로 보여주면 의미가 안 통해서(예: "not_authorized"), 알려진 코드는 친절한
// 문구로 바꾸고 나머지는 getErrorMessage() 그대로 노출한다.
// 초대 관련 코드는 어르신이 직접 보신다. 그래서 "무슨 일이 났는지"가 아니라 "무엇을
// 하시면 되는지"로 적는다 — 어르신이 혼자 푸실 수 있는 건 어차피 없고, 가족에게
// 무엇을 부탁하면 되는지만 아시면 된다.
// 근거: 실사용 — 갤럭시에서 'bound to other device'라는 영어가 그대로 떴다.
const RPC_ERROR_MESSAGES: Record<string, string> = {
  not_authorized: "이 어르신에 대한 권한이 없습니다. 본인 계정으로 다시 로그인해주세요.",
  bound_to_other_device: "이 링크는 다른 창에서 이미 연결했어요. 가족에게 새 링크를 받아주세요.",
  invalid_token: "링크가 올바르지 않아요. 가족에게 새 링크를 받아주세요.",
  expired: "링크가 오래되어 만료됐어요. 가족에게 새 링크를 받아주세요.",
  revoked: "이 링크는 더 쓸 수 없어요. 가족에게 새 링크를 받아주세요.",
};

export function getRpcErrorMessage(err: unknown, fallback: string): string {
  const message = getErrorMessage(err, fallback);
  return RPC_ERROR_MESSAGES[message] ?? message;
}

// Supabase Auth는 영어 원문 메시지를 준다("Invalid login credentials", "User already
// registered" 등). 그대로 띄우면 무엇을 해야 하는지 알 수 없어서 한국어로 바꾼다.
// 실제 인증 로그에서 사용자가 부딪힌 것들을 우선 담았다.
// 문구가 버전마다 조금씩 달라질 수 있어 정확히 일치가 아니라 포함 여부로 판단한다.
const AUTH_ERROR_PATTERNS: [RegExp, string][] = [
  [/invalid login credentials/i, "이메일 또는 비밀번호가 올바르지 않습니다."],
  [/user already registered|already been registered/i, "이미 가입된 이메일입니다. 로그인해주세요."],
  [/password should be at least/i, "비밀번호가 너무 짧습니다. 8자 이상으로 입력해주세요."],
  [/new password should be different/i, "이전과 다른 비밀번호로 정해주세요."],
  [/email rate limit exceeded|over_email_send_rate_limit/i, "메일 발송이 잠시 제한되었습니다. 잠시 후 다시 시도해주세요."],
  [/you can only request this after/i, "잠시 후 다시 시도해주세요."],
  [/unable to validate email address|invalid format/i, "이메일 형식이 올바르지 않습니다."],
  [/email not confirmed/i, "이메일 확인이 완료되지 않았습니다."],
  [/token has expired|invalid or has expired/i, "링크가 만료되었습니다. 재설정 메일을 다시 요청해주세요."],
];

// "이미 가입된 이메일"은 두 경로로 온다 — 422 User already registered 에러와, 이메일 존재
// 여부를 숨기려고 identities를 비워서 돌려주는 성공 응답. 사용자가 할 일은 어느 쪽이든
// 같으므로(로그인하거나 비밀번호를 재설정하거나) 판단을 한 곳에 모아둔다.
export function isEmailTakenError(err: unknown): boolean {
  return /user already registered|already been registered/i.test(getErrorMessage(err, ""));
}

export function getAuthErrorMessage(err: unknown, fallback: string): string {
  const message = getErrorMessage(err, fallback);
  for (const [pattern, korean] of AUTH_ERROR_PATTERNS) {
    if (pattern.test(message)) return korean;
  }
  return message;
}
