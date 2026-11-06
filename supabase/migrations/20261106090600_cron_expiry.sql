-- Scheduled cancellation of unpaid bank transfer orders.
--
-- pg_cron is available on Supabase local and cloud. Scheduling by job name
-- updates an existing job, so replaying the migration does not create
-- duplicate jobs.

create extension if not exists pg_cron;

select cron.schedule(
  'expire-unpaid-orders',
  '* * * * *',
  $job$select public.expire_unpaid_orders();$job$
);
