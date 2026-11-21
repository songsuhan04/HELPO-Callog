import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { BrandLink } from "../components/BrandLink";
import { BackButton } from "../components/BackButton";
import { RiskDot, RiskPill } from "../components/RiskDot";
import { MedicalDisclaimer } from "../components/MedicalDisclaimer";
import { getSupabase, supabaseConfigured } from "../lib/supabase";
import { getErrorMessage } from "../lib/errors";
import type { RiskLevel } from "../config/riskConstants";

export const SCREEN_ID = "gAdmin";

const SEVERITY: Record<RiskLevel, number> = { 심각: 0, 위험: 1, 안전: 2 };

interface ElderRow {
  id: string;
  name: string;
  relationship: string;
  priority_status: RiskLevel;
  family_account: { email: string } | null;
}

interface RiskRow {
  elder_profile_id: string;
  level: RiskLevel;
  reason: string;
  date: string;
}

export default function GAdmin() {
  const navigate = useNavigate();
  const [access, setAccess] = useState<"checking" | "ok" | "denied">("checking");
  const [elders, setElders] = useState<ElderRow[]>([]);
  const [riskByElder, setRiskByElder] = useState<Record<string, RiskRow>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseConfigured) {
      setAccess("denied");
      return;
    }
    const supabase = getSupabase();

    supabase.rpc("is_admin").then(({ data }) => {
      if (!data) {
        setAccess("denied");
        return;
      }
      setAccess("ok");

      Promise.all([
        supabase
          .from("elder_profile")
          .select("id,name,relationship,priority_status,family_account:family_account_id(email)"),
        supabase
          .from("risk_assessment")
          .select("elder_profile_id,level,reason,date")
          .order("date", { ascending: false }),
      ])
        .then(([eldersRes, riskRes]) => {
          if (eldersRes.error) throw eldersRes.error;
          if (riskRes.error) throw riskRes.error;

          const latestRisk: Record<string, RiskRow> = {};
          for (const row of (riskRes.data ?? []) as RiskRow[]) {
            if (!latestRisk[row.elder_profile_id]) latestRisk[row.elder_profile_id] = row;
          }
          setRiskByElder(latestRisk);
          setElders((eldersRes.data ?? []) as unknown as ElderRow[]);
        })
        .catch((err) => setError(getErrorMessage(err, "데이터를 불러오지 못했어요")))
        .finally(() => setLoading(false));
    });
  }, []);

  if (access === "checking") return null;
  if (access === "denied") return <AppShell><p className="g-error">관리자 권한이 없어요.</p></AppShell>;

  const sorted = [...elders].sort((a, b) => {
    const levelDiff = SEVERITY[a.priority_status] - SEVERITY[b.priority_status];
    return levelDiff !== 0 ? levelDiff : a.name.localeCompare(b.name);
  });
  const counts = elders.reduce(
    (acc, e) => ({ ...acc, [e.priority_status]: (acc[e.priority_status] ?? 0) + 1 }),
    {} as Record<RiskLevel, number>
  );

  const statStyle = (color: string) => ({ "--stat-color": color }) as CSSProperties;

  return (
    <AppShell
      aside={
        <>
          <BrandLink />
          <div className="g-aside-actions">
            <BackButton to="/guardian" />
          </div>
          <div className="g-aside-foot">
            전체 가족의 데이터를 읽기만 해요. 고치고 지우는 건 각 보호자만 할 수 있어요.
            <div className="g-build">빌드 {__BUILD_ID__}</div>
          </div>
        </>
      }
    >
      <div className="g-toolbar">
        <div>
          <div className="g-header">관리자 대시보드</div>
          <h1 className="g-title">전체 현황</h1>
          <p className="g-sub">전체 가족의 데이터를 읽기 전용으로 봐요.</p>
        </div>
      </div>

      <div className="g-stats">
        <div className="g-stat" style={statStyle("var(--primary)")}>
          <div className="g-stat-label">전체</div>
          <div className="g-stat-value">
            {elders.length}
            <small>명</small>
          </div>
        </div>
        <div className="g-stat" style={statStyle("var(--warn-fg)")}>
          <div className="g-stat-label">위험</div>
          <div className="g-stat-value">
            {counts["위험"] ?? 0}
            <small>명</small>
          </div>
        </div>
        <div className="g-stat" style={statStyle("var(--crit-fg)")}>
          <div className="g-stat-label">심각</div>
          <div className="g-stat-value">
            {counts["심각"] ?? 0}
            <small>명</small>
          </div>
        </div>
      </div>

      {error && <p className="g-error">{error}</p>}
      {loading && <p className="g-sub">불러오는 중...</p>}
      {!loading && sorted.length === 0 && !error && <p className="g-sub">등록된 어르신이 없어요.</p>}

      {sorted.length > 0 && (
        <div className="g-card">
          <div className="g-card-title">
            <span>대상자</span>
            <span>위험도순</span>
          </div>
          {sorted.map((elder) => {
            const risk = riskByElder[elder.id];
            return (
              <button
                key={elder.id}
                className="g-list-item"
                onClick={() => navigate(`/guardian/elders/${elder.id}`)}
              >
                <RiskDot level={elder.priority_status} />
                <div className="g-list-body">
                  <div className="g-list-name">
                    {elder.name}
                    <small>{elder.relationship}</small>
                  </div>
                  <div className="g-list-meta">보호자: {elder.family_account?.email ?? "알 수 없음"}</div>
                  {risk && <div className="g-list-meta">{risk.reason}</div>}
                </div>
                <RiskPill level={elder.priority_status} />
                <span className="g-chev">›</span>
              </button>
            );
          })}
        </div>
      )}

      <MedicalDisclaimer />
    </AppShell>
  );
}
