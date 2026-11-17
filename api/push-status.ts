import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authorizeCron } from "../lib/cronAuth";

// 웹 푸시 설정 진단용. 알림이 안 갈 때 원인이 "환경변수가 안 보인다"인지
// "키 형식이 틀렸다"인지 대시보드를 열지 않고 바로 구분하기 위해 만들었다.
//
// ⚠️ 키 값 자체는 절대 응답에 담지 않는다. 존재 여부와 길이·형식 위반만 알려준다.
// (공개키 87자, 비밀키 43자, 둘 다 URL-safe base64라 '='/'+'/'/' 가 없어야 정상)
//
// 크론 비밀값이 있어야 응답한다(2026-11-18). 예전에는 누구나 열 수 있어서, 서버에 등록된
// 환경변수 이름과 키 길이가 그대로 보였다. 값은 아니지만 공격자에게 설정을 알려 줄 이유가
// 없다. 진단할 때는 크론 비밀값을 Authorization: Bearer 헤더에 실어 부른다.
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (!authorizeCron(req, res)) return;
  const raw = (v: string | undefined) => v;
  const clean = (v: string | undefined) =>
    v?.trim().replace(/^VITE_VAPID_PUBLIC_KEY=/, "").replace(/^VAPID_(PUBLIC|PRIVATE)_KEY=/, "") || undefined;
  const pub = clean(raw(process.env.VITE_VAPID_PUBLIC_KEY));
  const priv = clean(raw(process.env.VAPID_PRIVATE_KEY));

  const describe = (v: string | undefined, expectedLen: number) => {
    if (!v) return { present: false };
    return {
      present: true,
      length: v.length,
      expectedLength: expectedLen,
      lengthOk: v.length === expectedLen,
      hasNamePrefix: v.includes("="),
      hasNonUrlSafeChars: /[+/]/.test(v),
      hasWhitespace: /\s/.test(v),
    };
  };

  // 이름 오타/접두어 누락을 찾기 위해 VAPID가 들어간 환경변수 "이름"만 나열한다.
  // 값은 담지 않는다 — 이름은 비밀이 아니고, 이게 없으면 무엇이 잘못 등록됐는지 알 수 없다.
  const vapidVarNames = Object.keys(process.env).filter((k) => /vapid/i.test(k)).sort();

  res.status(200).json({
    publicKey: describe(pub, 87),
    privateKey: describe(priv, 43),
    // sendPush.ts의 ensureConfigured()와 동일한 조건
    wouldSendPush: Boolean(pub && priv),
    registeredVapidVarNames: vapidVarNames,
  });
}
