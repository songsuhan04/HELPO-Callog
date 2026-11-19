// 기능 켜고 끄기.
//
// 영상편지(videoLetters): 2026-11-18 잠시 끈다. 체험에서 어르신이 영상 촬영을 어려워하셨고
// (사업·기술 멘토링 11/11~12 "영상에 초점을 버리고 대체할 것을 찾기"), 그 자리를 오늘의 운세로
// 바꾸는 중이다. 코드와 DB는 그대로 두고 화면에서만 숨긴다 — true로 바꾸면 그대로 돌아온다.
//  - 끄면: 어르신 처음·완료 화면의 영상 카드와 버튼, 보호자 상세의 "영상편지 보내기"와 영상 목록,
//    영상 화면 주소(/elder/record, /elder/letters, /guardian/elders/:id/letter)가 모두 사라진다.
//  - 이미 저장된 영상은 보관 기간(config/retention.ts)이 지나면 새벽 크론이 그대로 지운다.
//
// 태어난 시각(birthTime): 보호자 화면에서 어르신 태어난 시각(선택)을 받고, 운세에서 시주를 센다.
// DB에 elder_profile.birth_time 칸이 있어야 한다(supabase/migrations/20261119000017_elder_birth_time.sql).
// 칸이 없는데 켜면 어르신 등록·운세 조회가 "없는 칸" 오류로 멈추므로, 마이그레이션을 적용한 뒤에 켠다.
export const FEATURES = {
  videoLetters: false,
  birthTime: true,
} as const;
