import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assessRisk } from "../lib/riskScoring";
import { authenticate, canAccessElder } from "../lib/requestAuth";
import { geminiAudioMime } from "../lib/audioMime";
import { retryTransient } from "../lib/retry";

// 이 음성이 어느 어르신의 어느 날 기록인지. 요청에는 음성 ID만 오므로 여기서 거슬러 올라간다.
async function checkinOfVoice(
  admin: SupabaseClient,
  voiceResponseId: string
): Promise<{ elder_profile_id: string; date: string } | null> {
  const { data: voice } = await admin
    .from("voice_response")
    .select("daily_checkin_id")
    .eq("id", voiceResponseId)
    .maybeSingle();
  if (!voice?.daily_checkin_id) return null;
  const { data: checkin } = await admin
    .from("daily_checkin")
    .select("elder_profile_id,date")
    .eq("id", voice.daily_checkin_id)
    .maybeSingle();
  return (checkin as { elder_profile_id: string; date: string } | null) ?? null;
}

async function assessRiskForVoice(admin: SupabaseClient, voiceResponseId: string): Promise<void> {
  const checkin = await checkinOfVoice(admin, voiceResponseId);
  if (!checkin) return;
  await assessRisk(admin, checkin.elder_profile_id, checkin.date);
}

// 음성 분석 — 실패해도 하루 기록은 이미 저장되어 있으므로 안전하게 무시된다 (fire-and-forget).
// 근거: docs/기능설계서.md §2.2, plan §"Gemini 연동 범위"
//
// 오디오 내려받기와 Gemini 호출을 합쳐 실측 17초가 걸린다. 상한을 적어두지 않으면 더 짧은
// 기본값에 걸려 조용히 잘리고, 그러면 실패 이유조차 남지 않는다.
export const config = { maxDuration: 60 };

// Gemini 호출 한 번에 기다리는 시간의 상한. 상한이 없을 때 Gemini가 느리면(새벽 2시대 =
// 미국 서부 오전, 2026-11-19·20 연속) 재시도까지 기다리다 함수가 60초에 통째로 잘렸다.
// 잘리면 아래 catch도 못 돌아서 "실패"조차 남지 않고 "대기 중"에 영영 멈춘다 — 보호자 화면에는
// 다시 분석할 단추도 안 나왔다. 그래서 전체 마감을 함수 상한보다 일찍 잡고, 시도마다 남은
// 시간만큼만 기다린다. 마감을 넘기면 "failed"로 남겨 보호자가 다시 분석할 수 있게 한다.
const ANALYZE_DEADLINE_MS = 50_000;
const GEMINI_ATTEMPT_MAX_MS = 35_000;
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }
  const { voiceResponseId } = req.body ?? {};
  if (!voiceResponseId) {
    res.status(400).json({ error: "voiceResponseId required" });
    return;
  }

  const geminiKey = process.env.GEMINI_API_KEY;

  // 음성 ID만 알면 누구나 분석을 돌릴 수 있었다(Gemini 비용, 그리고 받아쓴 내용과 위험도를
  // 다시 쓴다). 그 음성의 주인인 어르신 본인이거나 그 보호자일 때만 통과시킨다.
  // 없는 음성과 남의 음성을 같은 응답으로 막는다 — 어느 쪽인지 알려줄 이유가 없다.
  const caller = await authenticate(req, res);
  if (!caller) return;
  const admin = caller.admin;
  const owner = typeof voiceResponseId === "string" ? await checkinOfVoice(admin, voiceResponseId) : null;
  if (!owner || !(await canAccessElder(caller, owner.elder_profile_id))) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  if (!geminiKey) {
    await admin.from("voice_response").update({ analysis_status: "skipped" }).eq("id", voiceResponseId);
    res.status(200).json({ status: "skipped", reason: "no gemini key" });
    return;
  }

  const startedAt = Date.now();
  try {
    const { data: row, error } = await admin
      .from("voice_response")
      .select("audio_url")
      .eq("id", voiceResponseId)
      .single();
    if (error || !row) throw error ?? new Error("voice_response not found");

    const { data: signed } = await admin.storage.from("voice").createSignedUrl(row.audio_url, 300);
    if (!signed) throw new Error("failed to sign audio url");

    const audioResp = await fetch(signed.signedUrl, { signal: AbortSignal.timeout(10_000) });
    const audioBuffer = Buffer.from(await audioResp.arrayBuffer());

    // 한 번 삐끗하면 그날 음성 분석이 영구히 사라진다 — 어르신은 말씀을 남겼는데 보호자에게는
    // "분석 실패"만 남는다. 실제로 그런 일이 있었고, 나중에 같은 파일을 다시 돌리니 정상
    // 인식됐다. 일시적인 실패만 짧게 다시 시도한다(영구적 실패는 재시도해도 같다).
    const text = await retryTransient(
      async () => {
        const remaining = ANALYZE_DEADLINE_MS - (Date.now() - startedAt);
        // 남은 시간이 너무 적으면 시도하지 않는다 — 아래 오류는 재시도 대상이 아니라 바로 failed로 간다
        if (remaining < 5_000) throw new Error("analysis deadline reached");
        const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 시간이 다 되면 "The operation was aborted due to timeout" — lib/retry.ts가 timeout으로 알아본다
        signal: AbortSignal.timeout(Math.min(GEMINI_ATTEMPT_MAX_MS, remaining)),
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  // 안 들리는 부분을 그럴듯하게 지어내지 않도록 명시적으로 막는다.
                  // 실사용에서 주변 대화가 섞인 녹음을 어르신 본인의 말처럼 받아쓴 사례가 있었다.
                  text:
                    "이 음성은 독거 어르신의 안부 응답입니다. 아래 규칙을 지켜 한국어로 분석하고 JSON으로만 답하세요.\n" +
                    "1. transcript에는 실제로 명확히 들린 말만 적으세요. 추측하거나 문맥으로 보완하지 마세요.\n" +
                    "2. 들리지 않거나 알아들을 수 없으면 그 부분을 적지 말고 (불명확)으로 표시하세요.\n" +
                    "3. 발화가 전혀 없으면 transcript는 \"(발화 없음)\"으로만 하세요.\n" +
                    "4. 말소리가 여러 사람이거나 TV·주변 대화로 보이면 observations에 반드시 그 사실을 적으세요.\n" +
                    "5. speech_rate_wpm과 silence_ratio는 확신이 없으면 null로 두세요.\n" +
                    "형식: {\"transcript\": string, \"speech_rate_wpm\": number|null, \"silence_ratio\": number|null, \"observations\": string}",
                },
                { inline_data: { mime_type: geminiAudioMime(row.audio_url as string), data: audioBuffer.toString("base64") } },
              ],
            },
          ],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );
        const geminiJson = await geminiResp.json();
        if (!geminiResp.ok || geminiJson?.error) {
          const detail = geminiJson?.error?.message ?? "";
          // 상태 코드를 메시지에 남겨야 재시도 판단(lib/retry.ts)이 429/5xx를 알아본다
          throw new Error(`gemini request failed (${geminiResp.status})${detail ? `: ${detail}` : ""}`);
        }
        return (geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text ?? "") as string;
      },
      {
        onRetry: (attempt, err) =>
          console.error(`analyze-voice: 재시도 ${attempt}회`, err instanceof Error ? err.message : err),
      }
    );

    // responseMimeType을 지정해도 가끔 ```json ... ``` 코드블록으로 감싸서 응답하는 경우가 있어 방어적으로 벗겨낸다
    const unfenced = text.replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, "$1");

    let parsed: { transcript?: string; speech_rate_wpm?: number; silence_ratio?: number; observations?: string } = {};
    try {
      parsed = JSON.parse(unfenced);
    } catch {
      // Gemini가 JSON이 아닌 자유 텍스트로 답할 수 있음 — 원문은 analysis_json에 그대로 보존
    }

    await admin
      .from("voice_response")
      .update({
        analysis_status: "ok",
        analysis_json: { raw: text },
        transcript: parsed.transcript ?? null,
        speech_rate: parsed.speech_rate_wpm ?? null,
        silence_ratio: parsed.silence_ratio ?? null,
        observations: parsed.observations ?? null,
      })
      .eq("id", voiceResponseId);

    await assessRiskForVoice(admin, voiceResponseId);
    res.status(200).json({ status: "ok" });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    // 왜 실패했는지 남긴다. 예전에는 상태만 바꾸고 이유는 응답으로만 보냈는데, 그 응답을
    // 받는 쪽은 fire-and-forget이라 아무도 보지 않는다. Vercel 로그는 한 시간이면 사라져서
    // 나중에는 확인할 방법이 없었다.
    console.error("analyze-voice: 분석 실패", voiceResponseId, reason);
    await admin
      .from("voice_response")
      .update({ analysis_status: "failed", analysis_json: { error: reason } })
      .eq("id", voiceResponseId);
    await assessRiskForVoice(admin, voiceResponseId);
    // 내부 오류 문구(Gemini 응답 등)는 응답에 싣지 않는다 — 이유는 위 로그와 analysis_json에 남는다.
    // 화면은 error가 없으면 "분석하지 못했어요"를 띄운다(2026-11-23 보안 점검)
    res.status(200).json({ status: "failed" });
  }
}
