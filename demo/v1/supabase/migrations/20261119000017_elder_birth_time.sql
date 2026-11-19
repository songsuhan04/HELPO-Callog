-- 어르신 태어난 시각(선택). 오늘의 운세에서 시주(時柱)와 오행을 셀 때만 쓴다.
-- 3회차 기술 멘토링(2026-11-19) "운세에 태어난 시간과 이름까지 기입하도록".
-- 보호자는 부모님이 태어난 시각을 모르는 경우가 많아 비워 둘 수 있게 한다(null = 모름).
-- birth_date와 같은 행·같은 권한(RLS)을 따르므로 정책을 새로 만들지 않는다.
alter table public.elder_profile
  add column if not exists birth_time time without time zone;

comment on column public.elder_profile.birth_time is '태어난 시각(선택). 오늘의 운세 시주 계산용. null이면 모름';
