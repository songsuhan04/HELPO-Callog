import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { BackButton } from "../components/BackButton";
import { getSupabase, supabaseConfigured } from "../lib/supabase";
import { getAuthErrorMessage, isEmailTakenError } from "../lib/errors";
import { GoogleButton } from "../components/GoogleButton";
import { ConsentItem } from "../components/ConsentItem";
import { PasswordField } from "../components/PasswordField";

export const SCREEN_ID = "signup";

// 계정 만들기 1~2단계: 이메일+비밀번호로 즉시 가입(이메일 인증 없음 — Supabase Auth의
// "Confirm email"을 꺼둔 상태를 전제로 한다. Resend 샌드박스 제약(계정 소유자 본인 외
// 발송 불가)으로 팀원 가입이 막혔던 문제를 해결하기 위해 OTP 코드 이메일 흐름을 제거했다.
// 3~4단계(어르신 정보/지병 선택)는 reg.tsx/cond.tsx 라우트로 이어진다.
export default function Signup() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [consent, setConsent] = useState(false);
  const [consentOverseas, setConsentOverseas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 이미 가입된 이메일일 때는 문구만 띄우면 막다른 길이 된다 — 다음에 할 일을 버튼으로 준다
  const [emailTaken, setEmailTaken] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEmailTaken(false);
    if (password !== passwordConfirm) {
      setError("비밀번호가 서로 다릅니다");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await getSupabase().auth.signUp({ email, password });
      if (error) throw error;

      // 이미 가입된 이메일이면 Supabase가 이메일 존재 여부를 숨기려고 에러 대신
      // identities가 빈 사용자를 돌려준다. 예전에는 이 경우 아무 말 없이 로그인 화면으로
      // 보내서 "가입이 안 된다"로만 보였다. 근거: 실사용 피드백
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setError("이미 가입된 이메일입니다.");
        setEmailTaken(true);
        return;
      }

      if (!data.session) {
        // "Confirm email"이 켜져 있는 환경이라면 세션이 바로 생기지 않는다
        setError("가입 확인이 필요합니다. 로그인 화면에서 로그인해주세요.");
        return;
      }
      navigate("/guardian/elders/new", { state: { fromSignup: true } });
    } catch (err) {
      // 실제로 오는 경로는 422 에러다(인증 로그로 확인). 위의 identities 검사만으로는 안 잡힌다.
      if (isEmailTakenError(err)) setEmailTaken(true);
      setError(getAuthErrorMessage(err, "가입에 실패했습니다"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <BackButton to="/" />
      <div className="g-header">가족 · 계정 만들기</div>
      <h1 className="g-title">이메일과 비밀번호를 입력해주세요</h1>
      <form onSubmit={handleSubmit}>
        <div className="g-field">
          <label>이메일</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={!supabaseConfigured} />
        </div>
        <PasswordField
          label="비밀번호"
          value={password}
          onChange={setPassword}
          minLength={8}
          disabled={!supabaseConfigured}
          autoComplete="new-password"
        />
        <PasswordField
          label="비밀번호 확인"
          value={passwordConfirm}
          onChange={setPasswordConfirm}
          disabled={!supabaseConfigured}
          autoComplete="new-password"
        />
        <a href="/terms" target="_blank" rel="noreferrer" className="g-link" style={{ marginBottom: 10 }}>
          이용약관 및 개인정보 처리 안내 보기
        </a>
        {/* 개인정보보호법 §23·§28-8 대응 — 일반 개인정보 동의와 국외이전(Google Gemini) 동의를
            분리된 체크박스로 구성. 근거: Help4/법적문제 피해가기 공략.pdf §1, §3, 체크리스트 1번 */}
        <ConsentItem
          checked={consent}
          onChange={setConsent}
          label="(필수) 개인정보 수집·이용에 동의합니다"
          detail={
            <>
              <div>수집 항목: 이메일, 비밀번호(암호화 저장), 어르신 성함·생년월일·관계·전화번호, 안부체크 응답 기록</div>
              <div>수집 목적: 회원 가입 및 계정 관리, 안부 확인 서비스 제공, 위험도 산정</div>
              <div>보유 기간: 회원 탈퇴 시까지(영상편지 파일은 발송 후 7일 뒤 자동 삭제)</div>
              <div>동의를 거부할 권리가 있으나, 동의하지 않으면 회원가입이 불가능합니다.</div>
            </>
          }
        />
        <ConsentItem
          checked={consentOverseas}
          onChange={setConsentOverseas}
          label="(필수) 개인정보 국외 이전에 동의합니다"
          detail={
            <>
              <div>수령자: Google LLC (Gemini API)</div>
              <div>이전 국가: 미국 등 Google 서버 소재국</div>
              <div>이전 항목: 음성 파일, 안부 체크리스트 응답 텍스트</div>
              <div>이전 목적: AI 기반 안부 분석(발화 내용·위험 신호 확인)</div>
              <div>보유 기간: 자체 서버에는 저장하지 않고 분석 처리 후 Google API 정책에 따라 처리됩니다.</div>
              <div>동의를 거부할 권리가 있으나, 동의하지 않으면 회원가입이 불가능합니다.</div>
            </>
          }
        />
        {error && <p className="g-error">{error}</p>}
        {/* 비밀번호를 잊어 새로 가입하려는 경우가 많다. 문구만 띄우면 여기서 길이 끊긴다. */}
        {emailTaken && (
          <div className="g-inline-actions">
            <button
              type="button"
              className="g-button g-button--secondary"
              onClick={() => navigate("/", { state: { login: true } })}
            >
              이 이메일로 로그인하기
            </button>
            <button
              type="button"
              className="g-button g-button--secondary"
              onClick={() => navigate("/forgot")}
            >
              비밀번호 재설정하기
            </button>
          </div>
        )}
        <GoogleButton disabled={!consent || !consentOverseas || !supabaseConfigured} label="구글로 가입하기" />
        <div className="g-or">또는 이메일로</div>
        <button className="g-button" type="submit" disabled={loading || !consent || !consentOverseas || !supabaseConfigured}>
          {loading ? "가입 중..." : "다음 — 어르신 정보"}
        </button>
      </form>
    </AppShell>
  );
}
