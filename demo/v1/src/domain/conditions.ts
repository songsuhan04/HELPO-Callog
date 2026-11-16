// 지병 목록과 보호자에게 보여주는 위험도 안내 문구.
// 근거: docs/기능설계서.md §3 위험도 판정 로직
//
// 지병별 질문은 여기 두지 않는다. 예전에는 이 파일이 미리보기용 질문 목록을 따로 갖고
// 있었는데, 실제로 어르신께 나가는 질문(서버)과 달랐다. 질문은 저장소 루트의
// lib/questionBank.ts 한 곳에만 있고, 화면은 src/lib/questions.ts를 거쳐 쓴다.

export type ConditionCategory = "순환·대사" | "뇌·신경" | "근골격" | "호흡·감각";

export interface ConditionDef {
  id: string;
  label: string;
  category: ConditionCategory;
  riskNote?: string;
}

export const CONDITIONS: ConditionDef[] = [
  { id: "htn", label: "고혈압", category: "순환·대사", riskNote: "약을 놓친 날의 위험을 1.5배로 봅니다" },
  { id: "diabetes", label: "당뇨병", category: "순환·대사", riskNote: "식사를 거른 날의 위험을 2배로 봅니다 (저혈당)" },
  { id: "hyperlipidemia", label: "고지혈증", category: "순환·대사" },
  { id: "heart", label: "심장질환", category: "순환·대사" },
  { id: "stroke", label: "뇌졸중 병력", category: "뇌·신경" },
  { id: "dementia", label: "치매·인지저하", category: "뇌·신경" },
  { id: "parkinsons", label: "파킨슨병", category: "뇌·신경" },
  { id: "depression", label: "우울증", category: "뇌·신경" },
  { id: "arthritis", label: "관절염", category: "근골격", riskNote: "외출이 적은 것을 위험으로 보지 않습니다" },
  { id: "osteoporosis", label: "골다공증", category: "근골격" },
  { id: "copd", label: "만성폐질환·천식", category: "호흡·감각" },
  { id: "ckd", label: "만성신장질환", category: "호흡·감각" },
  { id: "eye", label: "백내장·녹내장", category: "호흡·감각" },
  { id: "hearing", label: "난청", category: "호흡·감각" },
];

export const CONDITION_CATEGORIES: ConditionCategory[] = ["순환·대사", "뇌·신경", "근골격", "호흡·감각"];

export function getConditionsByCategory(category: ConditionCategory): ConditionDef[] {
  return CONDITIONS.filter((c) => c.category === category);
}
