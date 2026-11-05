begin;
set local lock_timeout='5s';

-- Native database scheduler: it runs without a browser, HTTP request or secret.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- Application API credentials do not administer the scheduler.
revoke all on schema cron from public,anon,authenticated,service_role;

-- A stable name makes this registration an upsert, never a duplicate timer.
select cron.schedule(
 'ushe-notifications-read-cleanup',
 '*/10 * * * *',
 'select private.purge_read_notifications();'
);

commit;
