import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { BrandLink } from "../components/BrandLink";
import { RiskDot, RiskPill } from "../components/RiskDot";
import { MedicalDisclaimer } from "../components/MedicalDisclaimer";
import { PushToggle } from "../components/PushToggle";
import { TrialNotice } from "../components/TrialNotice";
import { getSupabase, supabaseConfigured } from "../lib/supabase";
import { getErrorMessage } from "../lib/errors";
import { assertWritten } from "../lib/write";
import type { RiskLevel } from "../config/riskConstants";
import { todaySeoul } from "../lib/date";
import { hasAnswers } from "../lib/checkin";

export const SCREEN_ID = "gList";

interface ElderRow {
  id: string;
  name: string;
  relationship: string;
  priority_status: RiskLevel;
  // 관리자 계정은 모든 어르신을 볼 수 있지만(읽기 전용) 고칠 수는 없다.
  // 누구 것인지 알아야 수정·삭제를 보여줄지 정할 수 있다.
  family_account_id: string;
}

type TodayStatus = "done" | "skipped" | "pending";

const LEVELS: RiskLevel[] = ["안전", "위험", "심각"];
const LEVEL_COLOR: Record<RiskLevel, string> = {
  안전: "var(--safe)",
  위험: "var(--warn)",
  심각: "var(--crit)",
};
// gAdmin.tsx와 동일한 정렬 기준 — 심각/위험이 있는 어르신이 위로 오게 해서
// 여러 어르신을 등록해둔 보호자가 목록에서 바로 확인할 수 있게 한다
const SEVERITY: Record<RiskLevel, number> = { 심각: 0, 위험: 1, 안전: 2 };
const TODAY_LABEL: Record<TodayStatus, string> = { done: "오늘 완료", skipped: "오늘 건너뜀", pending: "오늘 아직" };

// 요약 타일 왼쪽의 등급 색 띠 — CSS의 --stat-color로 넘긴다
const statStyle = (color: string) => ({ "--stat-color": color }) as CSSProperties;

export default function GList() {
  const navigate = useNavigate();
  const [elders, setElders] = useState<ElderRow[]>([]);
  const [todayStatus, setTodayStatus] = useState<Record<string, TodayStatus>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [myAccountId, setMyAccountId] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }
    const supabase = getSupabase();
    supabase
      .from("elder_profile")
      .select("id,name,relationship,priority_status,family_account_id")
      .order("created_at", { ascending: true })
      .then(async ({ data, error }) => {
        if (error) {
          setError(error.message);
          setLoading(false);
          return;
        }
        const rows = (data ?? []) as ElderRow[];
        setElders(rows);
        setLoading(false);

        // 클릭해서 상세로 들어가지 않아도 오늘 안부 상태를 목록에서 바로 볼 수 있게.
        // 근거: 실사용 피드백 — "목록에서 한눈에 편하게 볼 수 있으면 좋겠다"
        const ids = rows.map((r) => r.id);
        if (ids.length === 0) return;
        const today = todaySeoul();
        const { data: checkins } = await supabase
          .from("daily_checkin")
          .select("elder_profile_id,skipped,answers")
          .eq("date", today)
          .in("elder_profile_id", ids);
        const statusMap: Record<string, TodayStatus> = {};
        for (const c of checkins ?? []) {
          // 행이 있다고 완료가 아니다 — 실제로 답한 것이 있어야 완료다.
          // 아무것도 답하지 않은 행은 "오늘 아직"으로 남겨 보호자가 잘못 안심하지 않게 한다.
          if (c.skipped) statusMap[c.elder_profile_id as string] = "skipped";
          else if (hasAnswers(c)) statusMap[c.elder_profile_id as string] = "done";
        }
        setTodayStatus(statusMap);
      });
    supabase.rpc("is_admin").then(({ data }) => setIsAdmin(Boolean(data)));
    supabase.auth.getUser().then(({ data }) => setMyAccountId(data.user?.id ?? null));
  }, []);

  async function logout() {
    await getSupabase().auth.signOut();
    navigate("/");
  }

  // 회원 탈퇴 — 약관에 "보유 기간: 회원 탈퇴 시까지"라고 써놓고 정작 탈퇴 수단이 없었다.
  // 되돌릴 수 없고 어르신 기록까지 전부 사라지므로 이메일을 직접 입력해 확인받는다.
  async function deleteAccount() {
    const supabase = getSupabase();
    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email ?? "";
    const typed = window.prompt(
      `정말 탈퇴하시겠어요?\n\n등록한 어르신 ${elders.length}명의 안부 기록·음성·영상편지가 모두 지워지고 되돌릴 수 없어요.\n\n확인을 위해 이메일을 그대로 입력해 주세요:\n${email}`
    );
    if (typed === null) return;
    if (typed.trim() !== email) {
      setError("이메일이 같지 않아 탈퇴를 취소했어요.");
      return;
    }
    setDeletingAccount(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("로그인이 필요해요");
      const resp = await fetch("/api/delete-account", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await resp.json();
      if (json.status !== "ok") throw new Error(json.error ?? "탈퇴하지 못했어요");
      await supabase.auth.signOut();
      navigate("/");
    } catch (err) {
      setError(getErrorMessage(err, "탈퇴하지 못했어요"));
      setDeletingAccount(false);
    }
  }

  async function deleteElder(elder: ElderRow) {
    if (!window.confirm(`${elder.name}님을 목록에서 삭제할까요? 관련된 안부 기록·영상편지·위험도 이력이 모두 함께 지워지고 되돌릴 수 없어요.`)) return;
    try {
      // 수정과 마찬가지로 .select()가 없으면 RLS로 0건이 되어도 성공으로 돌아온다.
      // 그러면 화면에서만 사라지고 새로고침하면 되살아난다.
      const { data, error } = await getSupabase()
        .from("elder_profile")
        .delete()
        .eq("id", elder.id)
        .select("id");
      if (error) throw error;
      assertWritten(data, "이 어르신을 삭제할");
      setElders((prev) => prev.filter((e) => e.id !== elder.id));
    } catch (err) {
      setError(getErrorMessage(err, "지우지 못했어요"));
    }
  }

  // 목록을 세지 않고도 오늘 상태가 한눈에 보이도록 위쪽에 등급별 인원을 먼저 놓는다
  const counts = Object.fromEntries(
    LEVELS.map((level) => [level, elders.filter((e) => e.priority_status === level).length])
  ) as Record<RiskLevel, number>;

  // gAdmin.tsx와 동일하게 심각/위험이 있는 어르신을 목록 위쪽으로 — 어르신이 여러 명이면
  // 매번 스크롤해서 찾지 않아도 바로 눈에 들어오게 한다
  const sorted = [...elders].sort((a, b) => {
    const levelDiff = SEVERITY[a.priority_status] - SEVERITY[b.priority_status];
    return levelDiff !== 0 ? levelDiff : a.name.localeCompare(b.name);
  });

  return (
    <AppShell
      aside={
        <>
          <BrandLink />
          <div className="g-aside-actions">
            {isAdmin && (
              <button className="g-back" onClick={() => navigate("/admin")}>
                관리자 대시보드
              </button>
            )}
            <button className="g-back" onClick={logout}>
              로그아웃
            </button>
            <button className="g-back g-back--danger" onClick={deleteAccount} disabled={deletingAccount}>
              {deletingAccount ? "탈퇴 처리 중..." : "회원 탈퇴"}
            </button>
            <PushToggle />
          </div>
          <div className="g-aside-foot">
            위험도는 진단이 아니라 참고용 신호예요.
            <div className="g-build">빌드 {__BUILD_ID__}</div>
          </div>
        </>
      }
    >
      <div className="g-toolbar">
        <div>
          <h1 className="g-title">대상자 목록</h1>
          <p className="g-sub">등록된 어르신 {elders.length}명의 오늘 상태예요.</p>
        </div>
        <button className="g-button" onClick={() => navigate("/guardian/elders/new")}>
          어르신 추가
        </button>
      </div>

      {elders.length > 0 && (
        <div className="g-stats">
          {LEVELS.map((level) => (
            <div key={level} className="g-stat" style={statStyle(LEVEL_COLOR[level])}>
              <div className="g-stat-label">{level}</div>
              <div className="g-stat-value">
                {counts[level]}
                <small>명</small>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="g-error">{error}</p>}
      {loading && <p className="g-sub">불러오는 중...</p>}
      {!loading && elders.length === 0 && !error && (
        <>
          <p className="g-sub">아직 등록한 어르신이 없어요. 어르신을 등록하면 초대 링크를 만들 수 있어요.</p>
          <button className="g-button" onClick={() => navigate("/guardian/elders/new")}>
            어르신 등록하기
          </button>
        </>
      )}

      {elders.length > 0 && (
        <div className="g-card">
          <div className="g-card-title">
            <span>대상자</span>
          </div>
          {sorted.map((elder) => {
            const status = todayStatus[elder.id] ?? "pending";
            return (
            <button
              key={elder.id}
              className="g-list-item"
              onClick={() => navigate(`/guardian/elders/${elder.id}`)}
            >
              <RiskDot level={elder.priority_status} />
              <div className="g-list-body">
                <div className="g-list-name">{elder.name}</div>
                <div className="g-list-meta">
                  {elder.relationship}
                  <span className={`g-today-badge g-today-badge--${status}`}>{TODAY_LABEL[status]}</span>
                </div>
              </div>
              <RiskPill level={elder.priority_status} />
              {/* 관리자 계정은 모든 어르신이 목록에 뜨지만 남의 어르신은 고칠 수 없다.
                  버튼을 그대로 두면 눌러도 아무 일이 없어서 고장으로 보인다. */}
              {elder.family_account_id === myAccountId && (
                <>
                  <span
                    role="button"
                    className="g-rowaction"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/guardian/elders/${elder.id}/edit`);
                    }}
                  >
                    수정
                  </span>
                  <span
                    role="button"
                    className="g-rowaction g-rowaction--danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteElder(elder);
                    }}
                  >
                    삭제
                  </span>
                </>
              )}
              <span className="g-chev">›</span>
            </button>
            );
          })}
        </div>
      )}

      {!loading && <TrialNotice />}

      <MedicalDisclaimer />
    </AppShell>
  );
}
