-- Terralis commerce, design-learning, and fulfillment foundation.
-- Run in a dedicated Supabase project before enabling live checkout.

create extension if not exists pgcrypto;

create table if not exists public.designs (
  id uuid primary key default gen_random_uuid(),
  anonymous_session_id text,
  place_slug text not null,
  place_kind text not null check (place_kind in ('city', 'state', 'country')),
  scene jsonb not null,
  source text not null default 'customizer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key,
  order_number text not null unique,
  status text not null default 'checkout_pending',
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'usd',
  stripe_session_id text unique,
  stripe_payment_intent_id text,
  prodigi_order_id text,
  fulfillment_status text,
  customer_email text,
  preview_url text,
  artwork_url text not null,
  artwork_status text not null default 'ready',
  design_scene jsonb not null,
  print_config jsonb not null,
  shipping_address jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fulfillment_events (
  id bigint generated always as identity primary key,
  order_id uuid references public.orders(id) on delete cascade,
  provider text not null,
  event_type text not null,
  provider_event_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  session_id text not null,
  event_name text not null,
  path text,
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  received_at timestamptz not null default now()
);

create index if not exists designs_place_slug_idx on public.designs(place_slug, created_at desc);
create index if not exists orders_status_idx on public.orders(status, created_at desc);
create index if not exists analytics_event_name_idx on public.analytics_events(event_name, received_at desc);
create index if not exists analytics_place_idx on public.analytics_events((properties->>'place'), received_at desc);

alter table public.designs enable row level security;
alter table public.orders enable row level security;
alter table public.fulfillment_events enable row level security;
alter table public.analytics_events enable row level security;

-- Browser clients never write these tables directly. Next.js server routes use
-- the service role after validating payloads, prices, and webhook signatures.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('artwork', 'artwork', true, 4000000, array['image/png', 'image/jpeg'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;
