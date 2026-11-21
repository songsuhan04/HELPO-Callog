-- 사용 기록: 운세를 열었는지, "사주 더보기"를 눌렀는지, 보호자가 신년운세에 관심을 보였는지.
--
-- 왜: 체험 기간에는 운세 자세히 보기를 무료로 열어 두고, 몇 명이 누르는지로 결제 근거를
-- 만든다(2026-11-21 팀 결정). 지금은 운세를 열었는지가 어르신 휴대폰(localStorage)에만 남아서
-- 서버에서 셀 수 없었다.
--
-- 내용 없이 "무엇을, 언제, 누가(어르신/보호자 ID)"만 남긴다. 같은 날 같은 기록은 한 번만
-- (명수를 세려는 것이지 클릭 수를 세려는 것이 아니다).

create table if not exists public.usage_event (
  id bigint generated always as identity primary key,
  event text not null check (event in ('fortune_open', 'saju_more_open', 'newyear_interest')),
  elder_profile_id uuid references public.elder_profile(id) on delete cascade,
  family_account_id uuid references auth.users(id) on delete cascade,
  date date not null default ((now() at time zone 'Asia/Seoul')::date),
  created_at timestamptz not null default now(),
  -- 어르신 기록은 어르신 ID, 보호자 기록은 보호자 ID 중 정확히 하나
  constraint usage_event_owner check ((elder_profile_id is null) <> (family_account_id is null))
);

comment on table public.usage_event is '운세 열기·사주 더보기·신년운세 관심 기록. 내용 없이 누가·언제만. 유료화 근거용(2026-11-21)';

-- 같은 날 같은 기록은 한 번만
create unique index if not exists usage_event_elder_daily
  on public.usage_event (event, elder_profile_id, date) where elder_profile_id is not null;
-- 보호자 관심은 계정당 한 번만
create unique index if not exists usage_event_family_once
  on public.usage_event (event, family_account_id) where family_account_id is not null;

alter table public.usage_event enable row level security;

-- 어르신 세션: 운세 기록만, 본인 것만 남긴다
create policy "elder logs own usage" on public.usage_event
  for insert with check (
    elder_profile_id is not null
    and event in ('fortune_open', 'saju_more_open')
    and is_my_elder(elder_profile_id)
  );

-- 보호자: 신년운세 관심만, 본인 계정으로만 남기고 자기 것만 읽는다(버튼 상태 표시)
create policy "family logs own interest" on public.usage_event
  for insert with check (
    family_account_id = auth.uid()
    and event = 'newyear_interest'
    and is_real_user()
  );

create policy "family reads own interest" on public.usage_event
  for select using (family_account_id = auth.uid() and is_real_user());

-- 관리자는 전체를 읽는다(집계용)
create policy "admin reads all usage" on public.usage_event
  for select using (is_admin());
