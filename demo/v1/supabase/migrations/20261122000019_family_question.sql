-- 보호자가 직접 만드는 질문("부모님께 묻고 싶은 질문").
--
-- 왜: 2차 테스트 의견 — "부모님께 궁금한 질문을 보호자가 직접 만들 수 있으면 좋겠다"(2026-11-22).
-- 매일 질문(daily_prompt, 서버가 고름)은 건드리지 않는다. 어르신 화면이 오늘 질문 뒤에
-- 켜져 있는 보호자 질문을 붙여서 묻고, 답은 다른 답과 함께 daily_checkin.answers에 남는다
-- (category "family", severity "ok" → 위험도 점수에 영향 없음).
--
-- 어르신이 답하기 어렵지 않게: 질문 40자, 답은 고르는 방식 2~3개(각 12자), 켜 둔 질문은 어르신당 2개까지.

create table if not exists public.family_question (
  id uuid primary key default gen_random_uuid(),
  elder_profile_id uuid not null references public.elder_profile(id) on delete cascade,
  family_account_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 2 and 40),
  options text[] not null check (array_length(options, 1) between 2 and 3),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.family_question is '보호자가 만든 질문. 어르신 화면이 매일 질문 뒤에 붙여 묻는다. 위험도 점수에는 들어가지 않는다(2026-11-22)';

create index if not exists family_question_elder_active
  on public.family_question (elder_profile_id) where active;

-- 선택지 길이와 "켜 둔 질문 2개까지"는 표 제약으로 적기 어려워 트리거로 막는다
create or replace function public.family_question_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from unnest(new.options) o where char_length(btrim(o)) not between 1 and 12) then
    raise exception 'family_question_option_length' using errcode = 'P0001';
  end if;
  if new.active and (
    select count(*) from family_question
    where elder_profile_id = new.elder_profile_id and active and id <> new.id
  ) >= 2 then
    raise exception 'family_question_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists family_question_guard on public.family_question;
create trigger family_question_guard
  before insert or update on public.family_question
  for each row execute function public.family_question_guard();

alter table public.family_question enable row level security;

-- 보호자: 자기 어르신의 질문만 보고, 만들고, 끄고, 지운다(익명 세션 = 어르신 기기는 안 됨)
create policy "family reads own elder questions" on public.family_question
  for select using (owns_elder(elder_profile_id) and is_real_user());

create policy "family adds own elder questions" on public.family_question
  for insert with check (
    owns_elder(elder_profile_id) and family_account_id = auth.uid() and is_real_user()
  );

create policy "family updates own elder questions" on public.family_question
  for update using (owns_elder(elder_profile_id) and is_real_user())
  with check (owns_elder(elder_profile_id) and is_real_user());

create policy "family deletes own elder questions" on public.family_question
  for delete using (owns_elder(elder_profile_id) and is_real_user());

-- 어르신 기기: 자기에게 켜져 있는 질문만 읽는다
create policy "elder reads active questions" on public.family_question
  for select using (active and is_my_elder(elder_profile_id));

-- 관리자: 전체 읽기
create policy "admin reads all family questions" on public.family_question
  for select using (is_admin());
