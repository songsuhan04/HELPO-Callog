import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 회원 탈퇴 — 보호자 계정과 딸린 데이터를 모두 파기한다.
//
// 이용약관에 "보유 기간: 회원 탈퇴 시까지"라고 명시해두고 정작 탈퇴할 방법이 없었다.
// 개인정보보호법상 정보주체의 파기 요구에 응할 수단이기도 하므로 반드시 있어야 한다.
//
// ⚠️ 스토리지 파일은 DB의 cascade로 지워지지 않는다. auth.users를 지우면 family_account →
// elder_profile → 안부/음성/위험도까지 연쇄 삭제되지만 음성·영상 파일은 그대로 남는다.
// 그래서 파일을 먼저 지우고(경로를 알아내려면 elder_profile 행이 아직 있어야 한다)
// 그 다음에 계정을 지운다. 순서를 바꾸면 고아 파일이 된다.

async function listAllFiles(admin: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  // Storage list는 한 단계씩만 보여주므로 날짜 폴더까지 두 단계를 훑는다
  // (경로 규칙: <elder_profile_id>/<yyyy-mm-dd>/<uuid>.<ext>)
  const paths: string[] = [];
  const { data: dateDirs } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  for (const dir of dateDirs ?? []) {
    const { data: files } = await admin.storage.from(bucket).list(`${prefix}/${dir.name}`, { limit: 1000 });
    for (const f of files ?? []) paths.push(`${prefix}/${dir.name}/${f.name}`);
  }
  return paths;
}

/** 어르신들의 음성·영상 파일을 스토리지에서 지운다. 계정 탈퇴와 어르신 삭제 양쪽에서 쓴다. */
export async function deleteElderFiles(admin: SupabaseClient, elderIds: string[]): Promise<number> {
  let removed = 0;
  for (const elderId of elderIds) {
    for (const bucket of ["voice", "letters"] as const) {
      const paths = await listAllFiles(admin, bucket, elderId);
      if (paths.length === 0) continue;
      const { error } = await admin.storage.from(bucket).remove(paths);
      if (error) console.error("deleteElderFiles: remove failed", bucket, error.message);
      else removed += paths.length;
    }
  }
  return removed;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey || !anonKey) {
    res.status(200).json({ status: "skipped", reason: "supabase not configured" });
    return;
  }

  // 본인만 자기 계정을 지울 수 있어야 한다 — 요청자의 토큰으로 신원을 먼저 확인한다.
  // 서비스 롤로 곧장 지우면 남의 계정도 지울 수 있는 엔드포인트가 되어버린다.
  const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
  if (!token) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await caller.auth.getUser();
  const user = userData?.user;
  if (userErr || !user || user.is_anonymous) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const admin = createClient(supabaseUrl, serviceKey);

  try {
    const { data: elders } = await admin.from("elder_profile").select("id").eq("family_account_id", user.id);
    const elderIds = (elders ?? []).map((e) => e.id as string);

    // 파일 먼저 — 계정을 지우면 어떤 어르신의 파일이었는지 알 수 없게 된다
    const removedFiles = await deleteElderFiles(admin, elderIds);

    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) throw delErr;

    res.status(200).json({ status: "ok", elders: elderIds.length, removedFiles });
  } catch (err) {
    // 내부 오류 문구는 로그에만 남긴다. 화면은 error가 없으면 "탈퇴하지 못했어요"를 띄운다(2026-11-23 보안 점검)
    console.error("delete-account: 탈퇴 실패", err instanceof Error ? err.message : err);
    res.status(500).json({ status: "failed" });
  }
}
