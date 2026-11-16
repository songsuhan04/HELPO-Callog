import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assessRisk } from "../lib/riskScoring";
import { authorizeElderAccess } from "../lib/requestAuth";

// 안부 체크 완료 시점에 위험도를 계산해 risk_assessment/elder_profile.priority_status에 반영한다.
// 근거: docs/기능설계서.md §3, plan "P0: 위험도 판정 로직 실제 연결"
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }
  const { elderProfileId, date } = req.body ?? {};
  if (!elderProfileId || !date) {
    res.status(400).json({ error: "elderProfileId and date required" });
    return;
  }

  // 위험도는 보호자 화면의 등급과 알림을 움직인다. 그 어르신의 보호자이거나 어르신 본인의
  // 세션일 때만 다시 계산하게 한다(lib/requestAuth.ts).
  const caller = await authorizeElderAccess(req, res, elderProfileId);
  if (!caller) return;

  try {
    await assessRisk(caller.admin, elderProfileId, date, "checkin");
    res.status(200).json({ status: "ok" });
  } catch (err) {
    res.status(200).json({ status: "failed", error: err instanceof Error ? err.message : String(err) });
  }
}
