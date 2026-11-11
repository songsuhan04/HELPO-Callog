// 카카오톡 같은 "앱 안에 들어있는 브라우저"(인앱 브라우저) 감지와 탈출.
//
// 어르신은 링크를 카톡으로 받으시니 사실상 전부 인앱 브라우저로 여신다. 그런데 여기서는
// 어르신께 필요한 것이 거의 다 빠진 채로 열린다 — 읽어주기(speechSynthesis)가 아예 없고,
// 설치도 알림도 되지 않는다.
// 근거: 실사용 — 갤럭시 카톡에서 "이 브라우저는 읽어주기를 지원하지 않아요"가 떴다.
//
// 보호자용 /guide에도 같은 경고가 있지만 어르신은 그 화면을 보실 일이 없다. 정작 인앱
// 브라우저로 여는 사람은 어르신이다. 그래서 어르신 화면에서 직접 안내한다.
//
// 메뉴에서 "다른 브라우저로 열기"를 찾으실 수 있는 어르신은 거의 없다 — 실사용에서
// "부모님은 카톡에서 다른 브라우저로 여는 방법을 모르신다"고 확인됐다. 버튼 하나로 나가게 한다.

export type InApp = "kakao" | "other" | null;

export function detectInApp(): InApp {
  if (typeof navigator === "undefined") return null;

  // 개발 중에만 쓰는 흉내내기(?inapp=kakao). 인앱 브라우저는 UA로만 가려지는데, 데스크톱
  // 브라우저로는 그 UA를 만들 수 없어서 이 화면들을 눈으로 확인할 방법이 없었다.
  // 배포본에서는 이 블록이 통째로 빠진다.
  if (import.meta.env.DEV) {
    const forced = new URLSearchParams(window.location.search).get("inapp");
    if (forced === "kakao" || forced === "other") return forced;
    if (forced === "none") return null;
  }

  const ua = navigator.userAgent;
  if (/KAKAOTALK/i.test(ua)) return "kakao";
  if (/NAVER\(inapp|Instagram|FBAN|FBAV|Line\//i.test(ua)) return "other";
  return null;
}

export function isAndroid(): boolean {
  return typeof navigator !== "undefined" && /Android/.test(navigator.userAgent);
}

export function isIOS(): boolean {
  return typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
}

/**
 * 바깥 브라우저로 내보낸다.
 *
 * 카카오의 openExternal 스킴은 개발자들이 널리 쓰지만 카카오 공식 문서에는 없다.
 * 조용히 실패할 수 있으므로 이 함수의 성공을 전제하면 안 된다 — 호출하는 화면은
 * 수동 안내를 항상 함께 띄워두어야 한다.
 */
export function escapeInApp(): void {
  const url = window.location.href;

  if (detectInApp() === "kakao") {
    window.location.href = "kakaotalk://web/openExternal?url=" + encodeURIComponent(url);
    return;
  }

  if (isAndroid()) {
    // 안드로이드 표준 intent 스킴으로 크롬에 직접 넘긴다.
    const stripped = url.replace(/^https?:\/\//, "");
    window.location.href = `intent://${stripped}#Intent;scheme=https;package=com.android.chrome;end`;
  }
  // 아이폰의 카톡 외 인앱 브라우저는 강제로 내보낼 방법이 없다 — 수동 안내만 남는다.
}

/** 주소 복사. 탈출 버튼이 안 먹을 때의 마지막 수단이라 실패 여부를 돌려준다. */
export async function copyAppUrl(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(window.location.href);
    return true;
  } catch {
    return false;
  }
}
