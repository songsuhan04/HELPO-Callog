import { useState } from "react";
import { copyAppUrl, detectInApp, escapeInApp, isIOS } from "../lib/inAppBrowser";

// 어르신 화면에 붙는 인앱 브라우저 안내.
//
// 빨간 경고로 만들지 않았다. 어르신 잘못이 아니고, 겁을 드리면 아예 그만두신다.
// "고장났다"가 아니라 "이렇게 하시면 됩니다"로 읽혀야 한다.
//
// ── 왜 모드가 둘인가 ───────────────────────────────────────────────
// 바깥 브라우저로 나가는 것이 어디서나 안전하지는 않다.
//
// 초대 화면(/e/:token)에서는 안전하다. 토큰이 주소에 실려 있어서, 크롬으로 옮겨가도
// 거기서 초대를 받으면 된다. 오히려 그래야 한다 — 어르신이 계속 쓰실 브라우저에 묶인다.
//
// 그런데 이미 연결을 마친 뒤의 화면(안부 질문 등)에서는 주소에 토큰이 없다. 연결 증표가
// 전부 카톡 쪽 저장소에 있으므로, 거기서 크롬으로 나가면 세션이 없어 연결이 풀린 것처럼
// 보인다. 읽어주기 하나 때문에 그날 안부를 통째로 못 하시게 되는 건 손해다.
// 그래서 그때는 내보내지 않고, 가족에게 무엇을 부탁하면 되는지만 알려드린다.
// (근본 해결은 기기 바인딩 완화다 — redeem_invite의 bound_to_other_device 참고)

interface Props {
  /** 안내 머리글에 붙일 말. 예: "읽어주기는" */
  reason?: string;
  /**
   * 바깥 브라우저로 내보내도 되는 화면인지.
   * 주소에 초대 토큰이 있는 화면에서만 true로 둔다. 기본값은 안전한 쪽(false).
   */
  allowEscape?: boolean;
}

export function InAppBrowserNotice({ reason, allowEscape = false }: Props) {
  const app = detectInApp();
  const [copied, setCopied] = useState(false);
  if (!app) return null;

  const here = app === "kakao" ? "카카오톡" : "지금 이 앱";

  if (!allowEscape) {
    return (
      <div className="e-escape">
        <p className="e-escape-title">
          {reason ? `${reason} ${here} 안에서는 되지 않아요.` : `${here} 안에서 열려 있어요.`}
        </p>
        <p className="e-escape-sub">
          안부 여쭙는 건 그대로 하실 수 있어요. 그냥 이어서 하셔도 괜찮습니다.
        </p>
        <p className="e-escape-sub">
          소리로 읽어드리는 걸 쓰시려면, 가족분께 <b>"인터넷 창에서 열도록 링크를 다시
          보내달라"</b>고 말씀해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="e-escape">
      <p className="e-escape-title">
        {reason ? `${reason} ${here} 안에서는 되지 않아요.` : `${here} 안에서 열려 있어요.`}
      </p>
      <p className="e-escape-sub">아래 단추를 누르시면 인터넷 창으로 옮겨드려요.</p>

      <button className="e-primary" onClick={escapeInApp}>
        인터넷 창으로 열기
      </button>

      <p className="e-escape-sub">단추를 눌러도 그대로이면, 이렇게 해주세요.</p>
      <ol className="e-escape-steps">
        {isIOS() ? (
          <>
            <li>
              화면 <b>아래쪽 공유 단추</b>(네모에 화살표)를 누르세요
            </li>
            <li>
              <b>Safari로 열기</b>를 누르세요
            </li>
          </>
        ) : (
          <>
            <li>
              화면 <b>오른쪽 아래 점 세 개</b>를 누르세요
            </li>
            <li>
              <b>다른 브라우저로 열기</b> 또는 <b>Chrome</b>을 고르세요
            </li>
          </>
        )}
      </ol>

      <button className="e-secondary" onClick={async () => setCopied(await copyAppUrl())}>
        {copied ? "주소를 복사했어요" : "주소 복사하기"}
      </button>
      {copied && <p className="e-escape-sub">인터넷 창을 열고 주소칸에 붙여넣어 주세요.</p>}
    </div>
  );
}
