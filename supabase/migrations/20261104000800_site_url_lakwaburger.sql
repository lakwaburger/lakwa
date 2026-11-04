-- ============================================================================
-- The site moved to its own domain: links in emails now use https://lakwaburger.com
-- Run once the domain is live. Safe to re-run.
-- ============================================================================

insert into private.secrets values ('site_url', 'https://lakwaburger.com')
  on conflict (key) do update set value = excluded.value;

-- Check: should show https://lakwaburger.com
select private.site_url();
