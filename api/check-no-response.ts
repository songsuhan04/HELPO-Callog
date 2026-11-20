import type { VercelRequest, VercelResponse } from "@vercel/node";
import { seoulNow, todaySeoul } from "../lib/seoulDate";
import { createClient } from "@supabase/supabase-js";
import { sendPushForElder } from "../lib/sendPush";
import { authorizeCron } from "../lib/cronAuth";

// 기능설계서.md §3/§6 오픈 이슈 — "안부 시각으로부터 7시간 넘게 무응답이면 위험 신호로 본다".
// 근거: Help4/발표 자료/위험도가중치 근거자료.docx 및 팀 논의.
// 다른 위험도 계산(lib/riskScoring.ts)은 어르신이 뭔가 했을 때(안부체크 완료, 음성분석 완료)만
// 재계산되는데, "아무것도 안 했다"는 부재는 트리거할 사용자 행동이 없다. 그래서 이 엔드포인트만
// 유일하게 스스로 주기적으로 확인하는 배치(Vercel Cron)로 만들었다.
// 실행 주기: GitHub Actions가 매시간 이 엔드포인트를 부른다(.github/workflows/check-no-response.yml).
// Vercel Hobby 플랜은 크론을 하루 1번만 돌릴 수 있어서, 예전에는 21:00 KST에 몰아서 확인했다.
// 안부 시각이 08:00이면 7시간째인 15:00에는 아무 일도 일어나지 않고 21:00에야 알림이 갔다 —
// 임계값이 7시간인데 실제로는 13시간이 걸린 셈이다. 임계값을 낮추는 것보다 이 주기를 고치는
// 쪽이 효과가 크다(7시간 그대로 두고도 6시간 빨라진다). 근거: docs/근거자료-임계값.md
// vercel.json의 하루 1회 크론은 GitHub Actions가 멈췄을 때를 대비해 남겨둔다(중복 실행은 안전하다).
const NO_RESPONSE_ALERT_HOURS = 7;


export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!authorizeCron(req, res)) return;

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    res.status(200).json({ status: "skipped", reason: "supabase not configured" });
    return;
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const now = seoulNow();
  const today = todaySeoul();

  const { data: elders, error } = await admin.from("elder_profile").select("id,name,checkin_time");
  if (error) {
    res.status(500).json({ status: "failed", error: error.message });
    return;
  }

  let flagged = 0;
  for (const elder of elders ?? []) {
    const { data: checkin } = await admin
      .from("daily_checkin")
      .select("id,answers,skipped")
      .eq("elder_profile_id", elder.id)
      .eq("date", today)
      .maybeSingle();
    // 행이 있다고 응답한 것이 아니다. 답변이 하나도 없는 행이 있으면 무응답 알림이
    // 조용히 걸러졌다 — 어르신이 하루 종일 아무 말이 없어도 보호자에게 아무것도 가지 않는다.
    // 이 알림은 "앱을 열지 않았다"는 것을 알리는 마지막 장치라 특히 새면 안 된다.
    const answered =
      Boolean(checkin?.skipped) || (Array.isArray(checkin?.answers) && checkin.answers.length > 0);
    if (answered) continue; // 이미 응답함 — 대상 아님

    const [h, m] = (elder.checkin_time as string).slice(0, 5).split(":").map(Number);
    // now가 Z로 못박힌 Date라 setUTC*로 맞춰야 서버 타임존과 무관하게 같은 결과가 나온다
    const deadline = new Date(now);
    deadline.setUTCHours(h + NO_RESPONSE_ALERT_HOURS, m, 0, 0);
    if (now < deadline) continue; // 아직 7시간 안 지남

    const { data: existing } = await admin
      .from("risk_assessment")
      .select("level,triggered_by")
      .eq("elder_profile_id", elder.id)
      .eq("date", today)
      .maybeSingle();
    if (existing?.level === "심각") continue; // 이미 더 심각한 판정이 있으면 낮추지 않음

    // 오늘 이미 무응답으로 알렸으면 다시 보내지 않는다.
    // 하루 한 번 돌 때는 필요 없던 처리인데, 매시간 돌게 되면서 필요해졌다 — 응답이 계속
    // 없으면 같은 알림이 매시간 가고, 그러면 보호자가 알림을 꺼버린다. 알림을 끄는 순간
    // 이 기능은 아무 의미가 없어진다.
    const flaggedToday = Boolean(
      (existing?.triggered_by as { no_response_hours?: number } | null)?.no_response_hours
    );
    if (flaggedToday) continue;

    await admin.from("risk_assessment").upsert(
      {
        elder_profile_id: elder.id,
        date: today,
        level: "위험",
        reason: `안부 시각(${elder.checkin_time.slice(0, 5)})으로부터 ${NO_RESPONSE_ALERT_HOURS}시간 넘게 응답이 없어요. 전화로 안부를 확인해 보세요`,
        triggered_by: { no_response_hours: NO_RESPONSE_ALERT_HOURS },
      },
      { onConflict: "elder_profile_id,date" }
    );
    await admin.from("elder_profile").update({ priority_status: "위험" }).eq("id", elder.id);

    // 무응답은 앱을 열지 않았다는 뜻이므로, 알림이 없으면 보호자가 알 방법이 사실상 없다
    await sendPushForElder(admin, elder.id as string, {
      title: `${(elder.name as string) ?? "어르신"}님이 아직 안부를 남기지 않으셨어요`,
      body: `안부 시각(${(elder.checkin_time as string).slice(0, 5)})으로부터 ${NO_RESPONSE_ALERT_HOURS}시간 넘게 응답이 없어요. 전화로 안부를 확인해 보세요`,
      url: `/guardian/elders/${elder.id}`,
      tag: `noresp-${elder.id}-${today}`,
    });
    flagged++;
  }

  res.status(200).json({ status: "ok", checked: elders?.length ?? 0, flagged });
}
