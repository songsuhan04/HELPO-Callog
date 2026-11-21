// 웹 푸시 알림 수신용 서비스워커.
//
// 위험도는 계산·기록되고 있었지만 보호자가 앱을 직접 열어야만 알 수 있었다.
// "조기 감지"가 서비스의 핵심 가치인데 감지 결과가 도달하지 않는 문제를 메우기 위해
// 표준 Web Push(무료)를 쓴다. iOS는 홈 화면에 추가한 경우에만 동작한다(iOS 16.4+).
//
// 이 파일은 빌드 대상이 아니라 public/에 그대로 복사되므로 평범한 JS로 작성한다.

self.addEventListener("install", () => {
  // 새 서비스워커를 기다리지 않고 바로 활성화 — 알림 설정을 켠 직후에 동작해야 한다
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// 크롬은 "설치 가능한 앱"인지 판단할 때 fetch 핸들러의 존재를 본다. 없으면 홈 화면에
// 추가해도 진짜 앱(WebAPK)이 아니라 단순 바로가기로 붙어 동작이 달라진다.
//
// ⚠️ 여기서 절대 캐시하지 말 것. 이 앱은 배포 후에도 열려 있던 탭이 예전 코드를 계속
// 쓰는 문제로 여러 번 고생했는데, 서비스워커가 캐시까지 하기 시작하면 그 문제가 훨씬
// 심해진다(사용자가 앱을 지웠다 깔아야 겨우 갱신되는 상태가 된다).
// 요청을 그대로 네트워크로 흘려보내기만 한다.
self.addEventListener("fetch", () => {
  // 의도적으로 event.respondWith()를 호출하지 않는다 → 브라우저 기본 동작(네트워크)에 맡긴다
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // 서버가 JSON이 아닌 걸 보낸 경우에도 알림 자체는 띄운다
    payload = {};
  }

  const title = payload.title || "Callog(콜록)";
  const options = {
    body: payload.body || "확인이 필요한 알림이 있어요.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // 같은 어르신에 대한 알림이 여러 번 오면 쌓이지 않고 최신 것으로 대체된다
    tag: payload.tag || "callog-risk",
    renotify: true,
    data: { url: payload.url || "/guardian" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/guardian";

  // 이미 열려 있는 탭이 있으면 그 탭을 쓰고, 없으면 새로 연다
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
