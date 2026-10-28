import { useState } from "react";
import { signInWithGoogle } from "../lib/googleAuth";
import { getErrorMessage } from "../lib/errors";

interface GoogleButtonProps {
  /** 동의 체크가 끝나기 전에는 누르지 못하게 하는 화면(계정 만들기)에서 넘긴다 */
  disabled?: boolean;
  label?: string;
}

// 구글 로고는 외부에서 불러오지 않고 인라인 SVG로 둔다 — 네트워크가 느리면 버튼이
// 반쯤 빈 채로 보이고, 어르신 가족이 쓰는 화면에서 그건 신뢰를 깎는다.
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.600v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.1z" />
      <path fill="#34A853" d="M24 46c6 0 11-2 14.6-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.5 2.1-5.8 0-10.6-3.9-12.4-9.1H4.3v5.7C7.9 41 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.6 28.1c-.4-1.3-.7-2.7-.7-4.1s.3-2.8.7-4.1v-5.7H4.3C2.8 17.1 2 20.4 2 24s.8 6.9 2.3 9.8l7.3-5.7z" />
      <path fill="#EA4335" d="M24 10.8c3.3 0 6.2 1.1 8.5 3.3l6.3-6.3C35 4.3 30 2 24 2 15.4 2 7.9 7 4.3 14.2l7.3 5.7c1.8-5.2 6.6-9.1 12.4-9.1z" />
    </svg>
  );
}

export function GoogleButton({ disabled, label = "구글로 계속하기" }: GoogleButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
      // 성공하면 구글로 이동하므로 여기로 돌아오지 않는다.
    } catch (err) {
      setError(getErrorMessage(err, "구글 로그인을 시작하지 못했습니다"));
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="g-button g-button--google" onClick={go} disabled={disabled || busy}>
        <GoogleMark />
        <span>{busy ? "구글로 이동 중..." : label}</span>
      </button>
      {error && <p className="g-error">{error}</p>}
    </>
  );
}
