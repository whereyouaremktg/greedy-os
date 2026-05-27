create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text unique,
  name text not null,
  category text,
  unit text not null default 'unit',
  active boolean not null default true,
  shopify_product_id text unique,
  shopify_handle text,
  image_url text,
  notes text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_name_idx on public.products (name);
create index products_active_idx on public.products (active) where active = true;

create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();

alter table public.products enable row level security;
create policy "auth read"  on public.products for select to authenticated using (true);
create policy "auth write" on public.products for all    to authenticated using (true) with check (true);

-- Link manufacturing runs (optional)
alter table public.manufacturing_runs
  add column product_id uuid references public.products(id) on delete set null;

create index manufacturing_runs_product_idx on public.manufacturing_runs (product_id);
