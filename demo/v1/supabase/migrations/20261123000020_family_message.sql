-- 가족 한마디: 보호자가 어르신께 짧은 글을 남긴다.
--
-- 왜: 영상편지를 끄면서(매일 촬영 부담) 보호자 → 어르신 방향의 연락이 앱 안에서 사라졌다.
-- "감시가 아닌 소통"인데 보호자는 받기만 하는 구조가 됐다(2026-11-23 지적). 글은 보내는 쪽도
-- 받는 쪽도 부담이 없고, 어르신 화면에서는 큰 글씨와 읽어주기로 보여 드린다.
--
-- 60자까지, 하루에 어르신당 10개까지. 어르신 기기는 읽기와 "읽음 표시"만 할 수 있다
-- (읽음 표시는 아래 함수로만 — 어르신이 글 내용을 바꾸지 못하게).

create table if not exists public.family_message (
  id uuid primary key default gen_random_uuid(),
  elder_profile_id uuid not null references public.elder_profile(id) on delete cascade,
  family_account_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 60),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

comment on table public.family_message is '가족 한마디 — 보호자가 어르신께 남기는 짧은 글(60자). 어르신 처음·완료 화면에 보인다(2026-11-23)';

create index if not exists family_message_elder_recent
  on public.family_message (elder_profile_id, created_at desc);

-- 하루에 어르신당 10개까지(장난이나 실수로 쏟아지지 않게)
create or replace function public.family_message_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(*) from family_message
    where elder_profile_id = new.elder_profile_id
      and (created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date
  ) >= 10 then
    raise exception 'family_message_daily_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists family_message_guard on public.family_message;
create trigger family_message_guard
  before insert on public.family_message
  for each row execute function public.family_message_guard();

alter table public.family_message enable row level security;

-- 보호자: 자기 어르신에게 보내고, 보낸 것을 보고, 지운다(익명 세션 = 어르신 기기는 안 됨)
create policy "family reads own elder messages" on public.family_message
  for select using (owns_elder(elder_profile_id) and is_real_user());

create policy "family sends to own elder" on public.family_message
  for insert with check (
    owns_elder(elder_profile_id) and family_account_id = auth.uid() and is_real_user()
  );

create policy "family deletes own elder messages" on public.family_message
  for delete using (owns_elder(elder_profile_id) and is_real_user());

-- 어르신 기기: 자기에게 온 글만 읽는다
create policy "elder reads own messages" on public.family_message
  for select using (is_my_elder(elder_profile_id));

-- 관리자: 전체 읽기
create policy "admin reads all family messages" on public.family_message
  for select using (is_admin());

-- 어르신 기기의 "읽음 표시" — 수정 권한을 주지 않고 이 함수로 read_at만 채운다
create or replace function public.mark_family_message_read(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update family_message
     set read_at = now()
   where id = p_id
     and read_at is null
     and is_my_elder(elder_profile_id);
$$;

revoke all on function public.mark_family_message_read(uuid) from public;
grant execute on function public.mark_family_message_read(uuid) to authenticated;
