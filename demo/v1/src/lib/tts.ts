// 어르신 화면 전용 "읽어주기" — 브라우저 내장 speechSynthesis 사용 (별도 API 키 불필요)
//
// 예전 구현은 실패해도 아무 표시가 없어서 "눌러도 아무 일이 없다"는 신고가 있었다.
// speechSynthesis는 조용히 실패하는 경우가 많아(음성 목록 미로딩, 한국어 음성 없음,
// cancel 직후 speak 시 무시되는 크롬 버그, 아이폰 무음 스위치) 원인을 알려줄 수단이 필요하다.

export type SpeakFailure = "unsupported" | "no-korean-voice" | "error";

let cachedVoices: SpeechSynthesisVoice[] = [];

/** 음성 목록은 비동기로 로드된다 — 첫 호출에서 빈 배열이 오는 브라우저가 있어 기다렸다 다시 읽는다 */
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const now = window.speechSynthesis.getVoices();
  if (now.length > 0) {
    cachedVoices = now;
    return Promise.resolve(now);
  }
  return new Promise((resolve) => {
    const done = () => {
      cachedVoices = window.speechSynthesis.getVoices();
      resolve(cachedVoices);
    };
    const timer = setTimeout(done, 1000);
    window.speechSynthesis.addEventListener(
      "voiceschanged",
      () => {
        clearTimeout(timer);
        done();
      },
      { once: true }
    );
  });
}

function pickKoreanVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  return voices.find((v) => v.lang?.toLowerCase().startsWith("ko"));
}

export function isSpeaking(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && window.speechSynthesis.speaking;
}

export function stopSpeaking() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
}

/**
 * 텍스트를 읽어준다. 실패하면 onFailure로 원인을 알려 화면에서 안내할 수 있게 한다.
 * onEnd는 성공/실패와 무관하게 읽기가 끝났을 때 호출된다(버튼 상태 되돌리기 용).
 */
export async function speak(
  text: string,
  handlers: { onFailure?: (reason: SpeakFailure) => void; onEnd?: () => void } = {},
  options: { restart?: boolean } = {}
): Promise<void> {
  const { onFailure, onEnd } = handlers;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    onFailure?.("unsupported");
    onEnd?.();
    return;
  }

  const synth = window.speechSynthesis;

  if (synth.speaking || synth.pending) {
    synth.cancel();
    if (!options.restart) {
      // 이미 읽고 있으면 멈추기만 한다(같은 버튼을 토글로 쓰기 위함)
      onEnd?.();
      return;
    }
    // 이어 읽기(다음 질문·다시 듣기): 멈춘 뒤 새로 읽는다. cancel 직후 바로 speak하면
    // 크롬이 무시하는 버그가 있어 잠깐 기다린다(위 머리말).
    await new Promise((r) => setTimeout(r, 80));
  }

  const voices = cachedVoices.length > 0 ? cachedVoices : await loadVoices();
  const korean = pickKoreanVoice(voices);

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ko-KR";
  utterance.rate = 0.95;
  // lang만 지정하면 한국어 음성이 있어도 엉뚱한 음성이 잡히거나 아무 소리도 안 나는 경우가 있어
  // 실제 음성 객체를 직접 지정한다. 한국어 음성이 아예 없으면 그 사실을 알려준다.
  if (korean) utterance.voice = korean;
  else onFailure?.("no-korean-voice");

  utterance.onend = () => onEnd?.();
  utterance.onerror = (e) => {
    // 사용자가 중간에 멈춘 경우(cancel)는 실패로 보지 않는다
    if (e.error !== "canceled" && e.error !== "interrupted") onFailure?.("error");
    onEnd?.();
  };

  synth.speak(utterance);
}

/** 실패 원인별 안내 문구 — 어르신도 읽을 수 있게 짧고 구체적으로 */
export function speakFailureMessage(reason: SpeakFailure): string {
  switch (reason) {
    case "unsupported":
      return "이 브라우저는 읽어주기를 지원하지 않아요.";
    case "no-korean-voice":
      return "기기에 한국어 음성이 없어 읽어주지 못했어요.";
    default:
      return "읽어주기에 실패했어요. 소리가 꺼져 있지 않은지 확인해주세요.";
  }
}
