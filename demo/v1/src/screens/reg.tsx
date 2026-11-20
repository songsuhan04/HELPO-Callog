import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { BackButton } from "../components/BackButton";
import { getSupabase, supabaseConfigured } from "../lib/supabase";
import { getErrorMessage } from "../lib/errors";
import { assertWritten } from "../lib/write";
import { formatPhone } from "../lib/phone";
import { FEATURES } from "../config/features";

// 태어난 시각 칸은 DB에 있을 때만 읽는다(config/features.ts birthTime)
const REG_COLUMNS: string = FEATURES.birthTime
  ? "name,relationship,gender,phone,checkin_time,birth_date,birth_time"
  : "name,relationship,gender,phone,checkin_time,birth_date";

interface RegRow {
  name: string | null;
  relationship: string | null;
  gender: string | null;
  phone: string | null;
  checkin_time: string | null;
  birth_date: string | null;
  birth_time?: string | null;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTES = Array.from({ length: 60 }, (_, m) => m);

export const SCREEN_ID = "reg";

// 어르신 등록 — 최초 가입(계정 만들기 3/4)과 "어르신 추가"(1가족:N어르신) 양쪽에서 재사용.
// elderId가 있으면(=/guardian/elders/:elderId/edit) 등록이 아니라 기존 정보 수정 모드로 동작한다.
// 근거: 실사용 피드백 — "대상자 목록에서 어르신 정보를 수정할 방법이 없다"
// 성별은 선택 입력이다(nullable). 위험도 계산에는 쓰지 않는다 — 문헌의 성별 층화 근거가
// 당뇨는 숫자가 없고 고혈압은 등급 B·이질성 I²=93.2%의 뇌졸중 한정 수치여서, 이것으로
// 가중치를 나누면 남성 민감도를 낮추게 되어 "애매하면 위험 쪽으로" 원칙과 충돌한다.
// 근거: Help4/발표 자료/위험도가중치 근거자료.docx §4.1 근거④, §4.2, §7.1
//
// 생신은 선택 입력이다. 어르신 화면의 "오늘의 운세"(features/fortune)에만 쓴다.
// DB에는 양력 날짜 한 칸(birth_date)만 있어서, 음력으로 적으면 저장하기 전에 양력으로 바꾼다.
// 어르신들은 음력 생신을 쓰시는 경우가 많아 음력 입력을 받는다. 수정 화면에서는 저장된
// 양력 날짜로 보인다.
export default function Reg() {
  const navigate = useNavigate();
  const location = useLocation();
  const { elderId } = useParams<{ elderId: string }>();
  const isEdit = Boolean(elderId);
  const fromSignup = Boolean((location.state as { fromSignup?: boolean } | null)?.fromSignup);

  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [gender, setGender] = useState("");
  const [phone, setPhone] = useState("");
  const [checkinTime, setCheckinTime] = useState("08:00");
  const [birthCalendar, setBirthCalendar] = useState<"solar" | "lunar">("solar");
  const [birthLeap, setBirthLeap] = useState(false);
  const [birthYear, setBirthYear] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthDay, setBirthDay] = useState("");
  // 태어난 시각(선택). "" = 모름. 운세의 시주 계산에만 쓴다(config/features.ts birthTime)
  const [birthHour, setBirthHour] = useState("");
  const [birthMinute, setBirthMinute] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingElder, setLoadingElder] = useState(isEdit);

  useEffect(() => {
    if (!isEdit || !supabaseConfigured) return;
    getSupabase()
      .from("elder_profile")
      .select(REG_COLUMNS)
      .eq("id", elderId)
      .single()
      .then(({ data: raw, error }) => {
        const data = raw as unknown as RegRow | null;
        if (error) {
          setError(getErrorMessage(error, "어르신 정보를 불러오지 못했습니다"));
        } else if (data) {
          setName(data.name ?? "");
          setRelationship(data.relationship ?? "");
          setGender(data.gender ?? "");
          setPhone(data.phone ?? "");
          setCheckinTime(data.checkin_time?.slice(0, 5) ?? "08:00");
          const [bh, bmi] = (data.birth_time ?? "").split(":");
          if (bh && bmi) {
            setBirthHour(String(Number(bh)));
            setBirthMinute(String(Number(bmi)));
          }
          const [by, bm, bd] = ((data.birth_date as string | null) ?? "").split("-");
          if (by && bm && bd) {
            setBirthYear(by);
            setBirthMonth(String(Number(bm)));
            setBirthDay(String(Number(bd)));
          }
        }
        setLoadingElder(false);
      });
  }, [isEdit, elderId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const birthDate = await toBirthDate(birthCalendar, birthLeap, birthYear, birthMonth, birthDay);
      const pad = (n: number) => String(n).padStart(2, "0");
      // 시만 고르고 분을 비우면 0분으로 본다. 생신이 없으면 시각도 저장하지 않는다
      const birthTime =
        birthDate && birthHour !== "" ? `${pad(Number(birthHour))}:${pad(Number(birthMinute || "0"))}` : null;
      const timeField = FEATURES.birthTime ? { birth_time: birthTime } : {};
      const supabase = getSupabase();
      if (isEdit) {
        // .select()가 없으면 RLS로 0건이 되어도 에러가 아니라 성공으로 돌아온다 — 그러면
        // 이름을 바꿔도 아무 일이 없는데 화면만 넘어간다. 바뀐 행을 직접 확인한다.
        const { data, error } = await supabase
          .from("elder_profile")
          .update({
            name,
            relationship,
            gender: gender || null,
            phone: phone || null,
            checkin_time: checkinTime,
            birth_date: birthDate,
            ...timeField,
          })
          .eq("id", elderId)
          .select("id");
        if (error) throw error;
        assertWritten(data, "이 어르신의 정보를 수정할");
        navigate(`/guardian/elders/${elderId}`);
        return;
      }
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("로그인이 필요합니다");
      const { data, error } = await supabase
        .from("elder_profile")
        .insert({
          family_account_id: userData.user.id,
          name,
          relationship,
          gender: gender || null,
          phone: phone || null,
          checkin_time: checkinTime,
          birth_date: birthDate,
          ...timeField,
        })
        .select("id")
        .single();
      if (error) throw error;
      navigate(`/guardian/elders/${data.id}/conditions`, { state: { fromSignup } });
    } catch (err) {
      setError(getErrorMessage(err, isEdit ? "수정에 실패했습니다" : "어르신 등록에 실패했습니다"));
    } finally {
      setLoading(false);
    }
  }

  if (loadingElder) return <AppShell><p>불러오는 중...</p></AppShell>;

  return (
    <AppShell>
      <BackButton />
      <div className="g-header">{isEdit ? "어르신 정보 수정" : fromSignup ? "가족 · 계정 · 3 / 4" : "어르신 등록"}</div>
      <h1 className="g-title">어르신 정보</h1>
      <p className="g-sub">어르신이 직접 입력하지 않습니다.</p>
      <form onSubmit={handleSubmit}>
        <div className="g-field">
          <label>성함</label>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={10} required />
        </div>
        <div className="g-field">
          <label>나와의 관계</label>
          <input value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="예: 어머니" required />
        </div>
        <div className="g-field">
          <label>성별 (선택)</label>
          <select value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">선택하지 않음</option>
            <option value="female">여성</option>
            <option value="male">남성</option>
          </select>
        </div>
        <div className="g-field">
          <label>어르신 전화번호 (전화하기 버튼에 사용)</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            placeholder="010-0000-0000"
            maxLength={13}
          />
        </div>
        <div className="g-field">
          <label>생신 (선택 — 어르신 화면의 오늘의 운세에 써요)</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={birthCalendar}
              onChange={(e) => setBirthCalendar(e.target.value as "solar" | "lunar")}
              aria-label="양력 또는 음력"
              style={{ width: "auto" }}
            >
              <option value="solar">양력</option>
              <option value="lunar">음력</option>
            </select>
            <input inputMode="numeric" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} placeholder="1950" aria-label="태어난 해" style={{ width: 80 }} />
            <span>년</span>
            <input inputMode="numeric" value={birthMonth} onChange={(e) => setBirthMonth(e.target.value)} placeholder="3" aria-label="태어난 달" style={{ width: 52 }} />
            <span>월</span>
            <input inputMode="numeric" value={birthDay} onChange={(e) => setBirthDay(e.target.value)} placeholder="10" aria-label="태어난 날" style={{ width: 52 }} />
            <span>일</span>
          </div>
          {birthCalendar === "lunar" && (
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, fontWeight: 400 }}>
              <input type="checkbox" checked={birthLeap} onChange={(e) => setBirthLeap(e.target.checked)} style={{ width: "auto" }} />
              윤달이에요
            </label>
          )}
          {birthCalendar === "lunar" && <div className="g-legal" style={{ marginTop: 4 }}>음력은 양력 날짜로 바꿔 저장합니다.</div>}
        </div>
        {FEATURES.birthTime && (
          <div className="g-field">
            <label htmlFor="birth-hour">태어난 시각 (선택 — 모르면 비워 두세요)</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select id="birth-hour" value={birthHour} onChange={(e) => setBirthHour(e.target.value)} aria-label="태어난 시" style={{ width: "auto" }}>
                <option value="">모름</option>
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              <span>시</span>
              <select
                value={birthMinute}
                onChange={(e) => setBirthMinute(e.target.value)}
                aria-label="태어난 분"
                disabled={birthHour === ""}
                style={{ width: "auto" }}
              >
                <option value="">0</option>
                {MINUTES.slice(1).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <span>분</span>
            </div>
            <div className="g-legal" style={{ marginTop: 4 }}>
              오늘의 운세에서 시주(태어난 시각의 기둥)를 볼 때만 써요. 시주는 2시간 단위로 바뀌어서 분까지 넣으면 더 정확해요.
            </div>
          </div>
        )}
        <div className="g-field">
          <label>안부 묻는 시각</label>
          <input type="time" value={checkinTime} onChange={(e) => setCheckinTime(e.target.value)} required />
        </div>
        {error && <p className="g-error">{error}</p>}
        <button className="g-button" type="submit" disabled={loading || !supabaseConfigured}>
          {loading ? "저장 중..." : isEdit ? "수정 완료" : "다음 — 지병 확인"}
        </button>
      </form>
    </AppShell>
  );
}

// 생신 입력 → DB에 넣을 양력 "YYYY-MM-DD". 비워 두면 null(운세 없음).
// 없는 날짜면 이유를 담아 던진다 — 화면이 오류 문구로 보여 준다.
async function toBirthDate(
  calendar: "solar" | "lunar",
  leap: boolean,
  yearText: string,
  monthText: string,
  dayText: string
): Promise<string | null> {
  if (!yearText.trim() && !monthText.trim() && !dayText.trim()) return null;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const thisYear = new Date().getFullYear();
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) || year < 1900 || year > thisYear) {
    throw new Error("생신을 다시 확인해주세요. 년·월·일을 숫자로 적거나, 모두 비워 두세요.");
  }
  if (calendar === "lunar") {
    // 만세력 라이브러리가 커서 음력을 고른 경우에만 불러온다
    const { lunarToSolarDate } = await import("../features/fortune/saju");
    const solar = lunarToSolarDate(year, month, day, leap);
    if (!solar) throw new Error("없는 음력 날짜예요. 달·날짜와 윤달 여부를 다시 확인해주세요.");
    return solar;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("없는 날짜예요. 년·월·일을 다시 확인해주세요.");
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}
