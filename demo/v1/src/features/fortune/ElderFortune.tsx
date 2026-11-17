import { SpeakButton } from "../../components/SpeakButton";
import { todaySeoul } from "../../lib/date";
import { birthFromSolarDate, getFortune } from "./saju";

// 어르신 화면의 "오늘의 운세" 카드. 안부를 마친 뒤에 보여 준다(완료 화면, 이미 마친 날의 처음 화면).
//
// 왜 넣었나: 2회차 기술 멘토링(2026-11-12)에서 "매일 열 이유가 될 재미 요소 하나"가 과제로
// 나왔다. 안부를 마치면 열리게 해서, 운세를 보러 들어온 김에 안부도 남기게 한다.
//
// 만세력 라이브러리(lunar-javascript)가 커서 이 파일은 화면에서 React.lazy로 불러온다.
// 그래야 운세를 보는 화면에서만 받는다.
//
// 생일은 보호자가 어르신 정보에 적은 값(양력)을 쓴다. 없으면 운세 대신 등록 안내만 보여 준다.

const SECTIONS = [
  { key: "general", icon: "☀️", title: "오늘의 운세" },
  { key: "love", icon: "💞", title: "가족·친구운" },
  { key: "health", icon: "🌿", title: "건강운" },
] as const;

export default function ElderFortune({ birthDate }: { birthDate: string | null }) {
  const birth = birthFromSolarDate(birthDate);
  const fortune = birth ? getFortune(birth, todaySeoul()) : null;

  if (!fortune) {
    return (
      <div className="e-card">
        <div className="e-card-label">🔮 오늘의 운세</div>
        <p className="e-meta">가족이 생신을 등록하면 매일 오늘의 운세를 볼 수 있어요.</p>
      </div>
    );
  }

  const spoken = SECTIONS.map((s) => `${s.title}. ${fortune.texts[s.key]}`).join(" ");

  return (
    <div className="e-card">
      <div className="e-card-label">🔮 오늘의 운세</div>
      <p className="e-meta" style={{ marginBottom: 10 }}>
        타고난 기운은 {fortune.saju.dayMaster}({fortune.saju.dayMasterPlain}), 오늘은 {fortune.todayGanZhi}일이에요.
      </p>
      {SECTIONS.map((s) => (
        <div key={s.key} className="e-fortune-item">
          <div className="e-fortune-head">
            {s.icon} {s.title}
          </div>
          <p className="e-fortune-text">{fortune.texts[s.key]}</p>
        </div>
      ))}
      <SpeakButton text={spoken} />
      <p className="e-fortune-note">재미로 봐 주세요.</p>
    </div>
  );
}
