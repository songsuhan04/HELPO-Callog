-- 저장소 파일 크기·형식 제한.
--
-- 왜: 두 버킷 모두 크기·형식 제한이 없었다(2026-11-23 보안 점검). 업로드 권한은 RLS로
-- "자기 어르신 폴더"에만 열려 있지만, 그 안에는 아무 크기·아무 형식의 파일이나 올릴 수 있었다.
--
-- 형식은 와일드카드로 받는다. 브라우저가 "audio/webm;codecs=opus"처럼 매개변수를 붙여
-- 보내는 경우가 있어 정확한 값으로 막으면 정상 녹음이 거절될 수 있다(iOS는 mp4, 그 외는 webm).
-- 크기: 실제 음성 파일은 최대 0.5MB(평균 0.12MB, 2026-11-23 기준). 녹음 시간 상한이 따로
-- 없으므로 음성은 10MB(aac 128kbps 기준 약 10분), 영상편지는 50MB로 넉넉히 둔다.

update storage.buckets
   set file_size_limit = 10 * 1024 * 1024,
       allowed_mime_types = array['audio/*']
 where id = 'voice';

update storage.buckets
   set file_size_limit = 50 * 1024 * 1024,
       allowed_mime_types = array['video/*']
 where id = 'letters';
