-- One £6.99/month subscription per signed-in user, mirrored from Stripe by the webhook.
-- Users can read their own row; only the server (service role) writes it.
create table public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'none'
    check (status in ('none','trialing','active','past_due','unpaid','canceled','incomplete','incomplete_expired','paused')),
  trial_end timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
revoke all on public.subscriptions from anon, public, authenticated;
grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;
alter table public.subscriptions enable row level security;
create policy "own subscription read" on public.subscriptions for select to authenticated using (user_id = auth.uid());
create trigger subscriptions_touch before update on public.subscriptions for each row execute function public.touch_updated_at();
