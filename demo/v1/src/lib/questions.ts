// 안부 질문 표와 고르는 규칙은 저장소 루트의 lib/에 한 벌만 있고, 서버와 화면이 같이 쓴다.
//
// 화면 쪽에 따로 베껴 두지 않는 이유: 예전에 지병 선택 화면의 "오늘 물을 질문" 미리보기가
// 자기만의 질문 목록을 갖고 있었고, 실제로 나가는 질문과 달랐다. 표가 두 벌이면 한쪽만
// 고쳐진다. 화면에서는 이 파일을 거쳐서만 가져다 쓴다.
//
// 개발 서버가 저장소 루트의 파일을 읽을 수 있게 vite.config.ts에 server.fs.allow를 열어뒀다.
export {
  MAX_CONDITION_QUESTIONS,
  conditionQuestionCount,
  conditionsWithoutQuestion,
  expectedQuestionCount,
  previewQuestions,
  selectDailyQuestions,
  usableQuestions,
  type DailyQuestion,
} from "../../../../lib/dailyQuestions";
export type { Category, QuestionOption, Severity } from "../../../../lib/questionBank";
