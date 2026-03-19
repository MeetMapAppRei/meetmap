-- ============================================================
--  MEET MAP — Supabase Database Setup
--  Run this in: supabase.com → Your Project → SQL Editor
-- ============================================================

-- 1. PROFILES (auto-created when user signs up)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  avatar_url text,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "Profiles are viewable by everyone" on public.profiles for select using (true);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. EVENTS
create table public.events (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  type text not null check (type in ('meet', 'car show', 'track day', 'cruise')),
  date date not null,
  time text,
  location text not null,
  city text not null,
  -- Full street address used for display + geocoding/map pinning.
  -- Example: "123 Main St, Riverside, CA 92501"
  address text,
  lat double precision,
  lng double precision,
  description text,
  tags text[] default '{}',
  host text,
  photo_url text,
  featured boolean default false,
  created_at timestamptz default now()
);
alter table public.events enable row level security;
create policy "Events are viewable by everyone" on public.events for select using (true);
create policy "Authenticated users can create events" on public.events for insert with check (auth.uid() = user_id);
create policy "Users can update own events" on public.events for update using (auth.uid() = user_id);
create policy "Users can delete own events" on public.events for delete using (auth.uid() = user_id);

-- If you're updating an existing project, you can re-run this line safely:
alter table public.events add column if not exists address text;

-- 2.5. FLYER IMPORT QUEUE (for AI extraction + approval)
-- Stores extracted flyer details that require approval before creating real events.
create table public.flyer_imports (
  id uuid default gen_random_uuid primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  source_url text not null,
  image_url text not null,
  status text not null check (status in ('pending', 'approved', 'rejected')) default 'pending',
  extracted jsonb not null default '{}'::jsonb,

  -- Flattened fields (so UI can quickly check required fields)
  title text,
  type text,
  date date,
  time text,
  location text,
  city text,
  address text,
  host text,
  description text,
  tags text[] default '{}',

  created_at timestamptz default now()
);

alter table public.flyer_imports enable row level security;
create policy "Flyer imports are viewable by owner" on public.flyer_imports
  for select using (auth.uid() = user_id);
create policy "Flyer imports are insertable by owner" on public.flyer_imports
  for insert with check (auth.uid() = user_id);
create policy "Flyer imports are updatable by owner" on public.flyer_imports
  for update using (auth.uid() = user_id);

-- 3. ATTENDEES
create table public.event_attendees (
  id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(event_id, user_id)
);
alter table public.event_attendees enable row level security;
create policy "Attendees viewable by everyone" on public.event_attendees for select using (true);
create policy "Authenticated users can rsvp" on public.event_attendees for insert with check (auth.uid() = user_id);
create policy "Users can remove own rsvp" on public.event_attendees for delete using (auth.uid() = user_id);

-- 4. COMMENTS
create table public.comments (
  id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  text text not null,
  created_at timestamptz default now()
);
alter table public.comments enable row level security;
create policy "Comments viewable by everyone" on public.comments for select using (true);
create policy "Authenticated users can comment" on public.comments for insert with check (auth.uid() = user_id);
create policy "Users can delete own comments" on public.comments for delete using (auth.uid() = user_id);

-- 5. STORAGE BUCKET for event photos
-- Run this separately in SQL Editor:
insert into storage.buckets (id, name, public) values ('event-photos', 'event-photos', true);
create policy "Anyone can view photos" on storage.objects for select using (bucket_id = 'event-photos');
create policy "Auth users can upload photos" on storage.objects for insert with check (bucket_id = 'event-photos' and auth.role() = 'authenticated');
