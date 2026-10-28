import { useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { BrandLink } from "../components/BrandLink";

export const SCREEN_ID = "guide";

// 보호자용 안내. 로그인 없이 열리고, 초대 링크와 함께 보내는 용도다.
//
// 정적인 설명문으로 두지 않은 이유: 보호자가 막히는 지점이 전부 앱 바깥이다.
// 카카오톡 인앱 브라우저로 열었거나, 설치를 안 했거나(아이폰은 그래야 알림이 온다),
// 알림 권한을 한 번 거부했거나. 셋 다 본인은 뭐가 잘못됐는지 모른다.
// 그래서 지금 상태를 읽어서 해당하는 것만 눈에 띄게 한다.

type Perm = "default" | "granted" | "denied" | "unsupported";

function readEnv() {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  // 인앱 브라우저는 서비스워커·푸시·설치가 제한된다. 여기서 막히면 뒤가 전부 막힌다.
  const inApp = /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\//i.test(ua);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  const perm: Perm =
    typeof Notification === "undefined" ? "unsupported" : (Notification.permission as Perm);
  return { isIOS, isAndroid, inApp, standalone, perm };
}

export default function Guide() {
  const [env, setEnv] = useState<ReturnType<typeof readEnv> | null>(null);
  useEffect(() => setEnv(readEnv()), []);

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <AppShell aside={<BrandLink />}>
      <h1 className="g-title">Callog 사용 안내</h1>
      <p className="g-sub">
        혼자 계신 어르신께 하루 한 번 안부를 여쭙고, 평소와 다른 신호가 보이면 가족에게 알려드립니다.
      </p>

      <div className="gd-flow">
        {/* 글은 반드시 span 하나로 감싼다 — 안쪽 <b>가 flex 항목이 되면 줄이 칸으로 쪼개진다 */}
        <div className="gd-step"><b>1</b><span>가족이 어르신을 등록합니다</span></div>
        <div className="gd-step"><b>2</b><span>어르신께 링크를 보냅니다 — 어르신은 한 번만 누르시면 됩니다</span></div>
        <div className="gd-step"><b>3</b><span>어르신이 매일 짧은 질문에 답하십니다</span></div>
        <div className="gd-step"><b>4</b><span>이상 신호가 보이면 <b>가족에게 알림</b>이 갑니다</span></div>
      </div>
      <p className="gd-note">
        어르신은 계정도 비밀번호도 만들지 않습니다. 의료기기가 아니며, 표시되는 위험도는 진단이 아니라
        "확인해보세요"라는 신호입니다.
      </p>

      {env && (
        <>
          <h2 className="gd-h2">지금 이 기기 상태</h2>

          {env.inApp && (
            <div className="gd-card gd-card--stop">
              <h3>카카오톡 안에서 열려 있습니다</h3>
              <p>
                여기서는 <b>설치도 알림도 되지 않습니다.</b> 먼저 밖으로 꺼내주세요.
              </p>
              <p>
                화면 구석의 <b>⋯</b> 버튼 → <b>"다른 브라우저로 열기"</b>
                {env.isIOS ? " (Safari)" : env.isAndroid ? " (Chrome)" : ""}
              </p>
              <p className="gd-url">{appUrl}/guide</p>
            </div>
          )}

          {!env.inApp && (
            <div className={"gd-card " + (env.standalone ? "gd-card--ok" : "")}>
              <h3>{env.standalone ? "설치되어 있습니다" : "아직 설치하지 않으셨습니다"}</h3>
              {env.standalone ? (
                <p>홈 화면 아이콘으로 열고 계십니다. 매번 주소를 찾지 않으셔도 됩니다.</p>
              ) : env.isIOS ? (
                <>
                  <p>
                    <b>아이폰은 설치해야만 알림이 옵니다.</b> 설치하지 않으면 위험 신호가 와도 모르십니다.
                  </p>
                  <ol>
                    <li>화면 <b>아래 가운데 공유 버튼</b>(네모에 화살표 ↑)</li>
                    <li>메뉴를 <b>아래로 쓸어올려</b> <b>"홈 화면에 추가"</b></li>
                    <li>오른쪽 위 <b>"추가"</b></li>
                  </ol>
                </>
              ) : (
                <>
                  <p>설치하지 않아도 알림은 옵니다. 설치하면 매번 주소를 찾지 않으셔도 됩니다.</p>
                  <ol>
                    <li>주소창에 <b>설치 아이콘</b>이 보이면 누릅니다</li>
                    <li>안 보이면 <b>오른쪽 위 ⋮ → "앱 설치"</b> 또는 <b>"홈 화면에 추가"</b></li>
                  </ol>
                </>
              )}
            </div>
          )}

          {!env.inApp && (
            <div
              className={
                "gd-card " +
                (env.perm === "granted" ? "gd-card--ok" : env.perm === "denied" ? "gd-card--stop" : "")
              }
            >
              <h3>
                {env.perm === "granted"
                  ? "알림이 켜져 있습니다"
                  : env.perm === "denied"
                    ? "알림이 차단되어 있습니다"
                    : env.perm === "unsupported"
                      ? "이 브라우저는 알림을 지원하지 않습니다"
                      : "알림을 아직 켜지 않으셨습니다"}
              </h3>

              {env.perm === "granted" && (
                <p>위험 신호가 보이면 이 기기로 알려드립니다. 더 하실 것은 없습니다.</p>
              )}

              {env.perm === "default" && (
                <p>
                  로그인한 뒤 <b>대상자 목록</b> 화면에서 <b>"🔕 위험 알림 받기"</b>를 누르시면 됩니다.
                  허용 여부를 묻는 창이 뜨면 <b>허용</b>을 눌러주세요.
                </p>
              )}

              {env.perm === "denied" && (
                <>
                  <p>
                    전에 <b>거부</b>를 누르셨습니다. 브라우저가 다시 묻지 않으므로 설정에서 직접 풀어야 합니다.
                  </p>
                  {env.isIOS ? (
                    <ol>
                      <li>아이폰 <b>설정</b> 앱 → <b>알림</b></li>
                      <li>목록에서 <b>Callog</b>을 찾아 <b>"알림 허용"</b> 켜기</li>
                      <li>Callog이 목록에 없으면 아직 설치가 안 된 것입니다 — 위 설치 안내부터</li>
                    </ol>
                  ) : env.isAndroid ? (
                    <ol>
                      <li>Chrome 주소창 왼쪽 <b>자물쇠(또는 ⓘ)</b> 누르기</li>
                      <li><b>권한</b> 또는 <b>사이트 설정</b> → <b>알림</b> → <b>허용</b></li>
                      <li>안 보이면 Chrome <b>⋮ → 설정 → 사이트 설정 → 알림</b>에서 이 주소를 찾아 허용</li>
                    </ol>
                  ) : (
                    <ol>
                      <li>
                        <b>Safari</b>: 설정(⌘,) → <b>웹사이트</b> → <b>알림</b> → 이 주소를 <b>허용</b>으로 변경.
                        같은 화면 맨 아래 <b>"웹사이트에 알림 표시 권한 요청 허용"</b>도 켜져 있어야 합니다
                      </li>
                      <li>
                        <b>Chrome</b>: 주소창 왼쪽 <b>자물쇠</b> → <b>사이트 설정</b> → <b>알림</b> → <b>허용</b>
                      </li>
                      <li>바꾼 뒤 이 페이지를 새로고침하세요</li>
                    </ol>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}

      <h2 className="gd-h2">어르신께는</h2>
      <p className="gd-note">
        어르신은 이 안내를 보실 필요가 없습니다. <b>받으신 링크를 한 번만 누르시면</b> 됩니다.
        글씨가 작으면 화면 위 <b>"가+ 화면 설정"</b>에서 크게 바꾸실 수 있고, 질문을 소리로 읽어드리는
        <b> "읽어주기"</b>도 있습니다.
      </p>

      <a className="g-button" href="/">
        시작 화면으로
      </a>
      <a href="/terms" target="_blank" rel="noreferrer" className="g-link g-link--block">
        이용약관 및 개인정보 처리 안내
      </a>
    </AppShell>
  );
}
