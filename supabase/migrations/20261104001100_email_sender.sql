-- ============================================================================
-- Emails now come from lakwamotorcycles@gmail.com (set GMAIL_USER / GMAIL_APP_PASSWORD in
-- Edge Functions → Secrets), and staff alerts for new join requests go there too.
-- Safe to re-run.
-- ============================================================================

insert into private.secrets values ('staff_notify_email', 'lakwamotorcycles@gmail.com')
  on conflict (key) do update set value = excluded.value;

-- Check: should show lakwamotorcycles@gmail.com
select value as staff_notify_email from private.secrets where key = 'staff_notify_email';
