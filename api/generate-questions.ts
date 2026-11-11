import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { generateQuestions } from "../lib/dailyQuestions";

// 그날 첫 안부에서 미리 만들어둔 질문이 없을 때 쓰는 즉석 생성 경로.
//
// 평소에는 새벽 크론이 미리 만들어두므로 여기까지 오지 않는다(어르신을 기다리게 하지 않기
// 위함 — 근거: 실사용 피드백 "버퍼링이 걸린다"). 크론 뒤에 등록된 어르신이나 크론이 시간
// 안에 다 처리하지 못한 경우를 위해 남겨둔다.
//
// 만든 질문은 daily_prompt에 저장한다. 예전에는 화면(eCheck)이 daily_checkin에 직접 넣었는데,
// 그러면 어르신이 아무것도 답하지 않았는데도 그날 행이 생긴다. 보호자 목록·위험도 계산·
// 무응답 알림이 모두 "그날 행이 있으면 응답한 것"으로 보기 때문에, 화면만 열고 나간 어르신이
// "오늘 완료"로 보이고 무응답 알림까지 막혔다. 미리 만들어둔 것과 실제로 답한 기록은
// 성격이 다르므로 저장 위치도 나눈다.
//
// 문항 생성·검증 규칙은 lib/dailyQuestions.ts에 있다(크론과 같은 로직을 쓴다).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }
  const {
    conditions = [],
    recentQuestions = [],
    elderProfileId,
    date,
  } = (req.body ?? {}) as {
    conditions?: string[];
    recentQuestions?: string[];
    elderProfileId?: string;
    date?: string;
  };

  const result = await generateQuestions(process.env.GEMINI_API_KEY, conditions, recentQuestions);

  // 새로고침해도 같은 질문이 나오도록 저장해둔다. 저장에 실패해도 질문은 그대로 돌려준다 —
  // 저장 실패가 안부를 막을 이유는 없다(다음에 열면 질문이 새로 만들어질 뿐이다).
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (elderProfileId && date && supabaseUrl && serviceKey) {
    const admin = createClient(supabaseUrl, serviceKey);
    const { error } = await admin.from("daily_prompt").upsert(
      {
        elder_profile_id: elderProfileId,
        date,
        questions: result.questions,
        source: result.source,
        // 크론 경로(lib/prepareDailyPrompts.ts)와 같은 자리에 남겨야 둘을 한 번에 세어볼 수 있다.
        // 이 경로는 주제를 만들지 않으므로 질문 출처만 적는다.
        notes: { questionSource: result.source },
      },
      { onConflict: "elder_profile_id,date" }
    );
    if (error) console.error("generate-questions: daily_prompt upsert failed", error.message);
  }

  res.status(200).json(result);
}
