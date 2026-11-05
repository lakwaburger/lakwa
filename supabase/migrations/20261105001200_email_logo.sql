-- ============================================================================
-- Emails: show the Motos LAKWA pennant logo in the red header bar instead of plain text.
-- The image is served by the website: <site_url>/assets/img/logo.png
-- If an email app blocks images, the alt text "LAKWA Burger Cafe" shows instead.
-- Run AFTER 20261104001100_email_sender.sql. Safe to re-run.
-- ============================================================================

create or replace function private.send_email(p_to text, p_subject text, p_body text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  hook text := private.secret('email_hook_secret');
  url text := private.secret('email_function_url');
  html text;
begin
  if coalesce(hook, '') = '' or coalesce(url, '') = '' or coalesce(private.secret('email_enabled'), 'false') <> 'true' then
    return false;
  end if;
  html := '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1a1e1f">'
       || '<div style="background:#b10b0e;padding:14px 24px;text-align:center">'
       || '<a href="' || private.site_url() || '/" style="text-decoration:none;color:#e5e1d7;font-weight:bold;font-size:20px">'
       || '<img src="' || private.site_url() || '/assets/img/logo.png" width="126" height="60" alt="LAKWA Burger Cafe"'
       || ' style="display:inline-block;border:0;width:126px;height:60px;color:#e5e1d7;font-weight:bold;font-size:20px"></a></div>'
       || '<div style="padding:24px;background:#ffffff;border:1px solid #eee">' || p_body || '</div>'
       || '<p style="font-size:12px;color:#777;padding:12px 24px">Kalye Artisano, Lio Estate, Villa Libertad, El Nido, Palawan · (0931) 154-9766</p></div>';
  perform net.http_post(
    url := url,
    headers := jsonb_build_object('x-hook-secret', hook, 'Content-Type', 'application/json'),
    body := jsonb_build_object('to', p_to, 'subject', p_subject, 'html', html)
  );
  return true;
end $$;
