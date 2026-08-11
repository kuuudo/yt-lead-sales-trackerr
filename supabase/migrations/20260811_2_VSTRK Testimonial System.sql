-- ============================================
-- VSTRK Testimonial System
-- Migration: table, RLS, private storage bucket + policies
-- ============================================

-- ============================================
-- 1. TESTIMONIALS TABLE
-- ============================================

create table public.testimonials (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  rating               smallint not null check (rating between 1 and 5),
  content              text not null,
  name                 text not null,
  company              text,
  role                 text,
  avatar_url           text,
  video_url            text,
  status               text not null default 'pending'
                       check (status in ('pending', 'approved', 'rejected')),
  show_on_testimonials boolean not null default false,
  show_on_website      boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Keep updated_at current on every update.
create or replace function public.set_testimonials_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_testimonials_updated_at
before update on public.testimonials
for each row
execute function public.set_testimonials_updated_at();

-- Indexes for public testimonial queries.
create index idx_testimonials_show_on_testimonials
on public.testimonials (created_at desc)
where show_on_testimonials = true
  and status = 'approved';

create index idx_testimonials_show_on_website
on public.testimonials (created_at desc)
where show_on_website = true
  and status = 'approved';

create index idx_testimonials_user_id
on public.testimonials (user_id);

alter table public.testimonials enable row level security;


-- ============================================
-- 2. TESTIMONIALS RLS
-- ============================================

-- Authenticated users can submit only their own testimonial.
-- They cannot self-approve or self-publish.
create policy testimonials_insert_own
on public.testimonials
for insert
with check (
  user_id = auth.uid()
  and status = 'pending'
  and show_on_testimonials = false
  and show_on_website = false
);

-- Users can view their own submission.
create policy testimonials_select_own
on public.testimonials
for select
using (
  user_id = auth.uid()
);

-- Anonymous and authenticated visitors can only see testimonials
-- that are explicitly approved AND enabled for at least one
-- public destination.
create policy testimonials_select_public
on public.testimonials
for select
using (
  status = 'approved'
  and (
    show_on_testimonials = true
    or show_on_website = true
  )
);

-- Admin can view all testimonials for moderation.
create policy testimonials_select_admin
on public.testimonials
for select
using (
  lower(auth.jwt() ->> 'email') = 'alinospam2020@gmail.com'
);

-- Only the admin can modify testimonials.
create policy testimonials_update_admin
on public.testimonials
for update
using (
  lower(auth.jwt() ->> 'email') = 'alinospam2020@gmail.com'
)
with check (
  lower(auth.jwt() ->> 'email') = 'alinospam2020@gmail.com'
);

-- Only the admin can delete testimonials.
create policy testimonials_delete_admin
on public.testimonials
for delete
using (
  lower(auth.jwt() ->> 'email') = 'alinospam2020@gmail.com'
);


-- ============================================
-- 3. PRIVATE STORAGE BUCKET
-- ============================================

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'testimonial-media',
  'testimonial-media',
  false,
  104857600,
  array[
    'video/webm',
    'video/mp4',
    'video/quicktime',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
);


-- ============================================
-- 4. STORAGE RLS
-- ============================================

-- Path convention:
--
-- {user_id}/{testimonial_id}/video.<ext>
-- {user_id}/{testimonial_id}/avatar.<ext>


-- Owner can manage files under their own user_id folder.
create policy testimonial_media_owner_all
on storage.objects
for all
using (
  bucket_id = 'testimonial-media'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'testimonial-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);


-- Admin has full access to testimonial media.
create policy testimonial_media_admin_all
on storage.objects
for all
using (
  bucket_id = 'testimonial-media'
  and lower(auth.jwt() ->> 'email') = 'alinospam2020@gmail.com'
)
with check (
  bucket_id = 'testimonial-media'
  and lower(auth.jwt() ->> 'email') = 'alinospam2020@gmail.com'
);


-- Public visitors can only read media belonging to a testimonial
-- that is BOTH approved AND enabled for a public destination.
--
-- Pending/rejected testimonials cannot expose their media.
create policy testimonial_media_public_select
on storage.objects
for select
using (
  bucket_id = 'testimonial-media'
  and exists (
    select 1
    from public.testimonials t
    where (
      t.video_url = storage.objects.name
      or t.avatar_url = storage.objects.name
    )
    and t.status = 'approved'
    and (
      t.show_on_testimonials = true
      or t.show_on_website = true
    )
  )
);