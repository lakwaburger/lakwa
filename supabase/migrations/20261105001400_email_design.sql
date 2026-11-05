-- ============================================================================
-- Email design to match the website: off-white page, red header with the Motos LAKWA logo,
-- red rounded buttons, teal footer with address, phone and links (like the site footer).
-- Plain ASCII on purpose (special characters are HTML entities), so copy / paste can't garble it.
-- Run AFTER 20261105001300_email_text_fix.sql. Safe to re-run.
-- ============================================================================

create or replace function private.button(href text, label text) returns text
language sql immutable set search_path = '' as $$
  select '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 8px"><tr><td bgcolor="#b10b0e" style="background:#b10b0e;border-radius:10px"><a href="'
    || href
    || '" style="display:inline-block;padding:15px 26px;font-family:Unbounded, Arial Black, Arial, Helvetica, sans-serif;font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#e5e1d7;text-decoration:none;border-radius:10px">'
    || label
    || '</a></td></tr></table>'
$$;

create or replace function private.send_email(p_to text, p_subject text, p_body text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  hook text := private.secret('email_hook_secret');
  url text := private.secret('email_function_url');
  site text := private.site_url();
  html text;
begin
  if coalesce(hook, '') = '' or coalesce(url, '') = '' or coalesce(private.secret('email_enabled'), 'false') <> 'true' then
    return false;
  end if;
  html := '<div style="margin:0;padding:0;background:#e5e1d7"><link href="https://fonts.googleapis.com/css2?family=Jost:wght@700&family=Space+Grotesk:wght@400;700&display=swap" rel="stylesheet"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#e5e1d7" style="background:#e5e1d7;font-family:Space Grotesk, Helvetica Neue, Arial, Helvetica, sans-serif;color:#1a1e1f"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;border-collapse:separate"><tr><td align="center" bgcolor="#b10b0e" style="background:#b10b0e;padding:22px 24px;border-radius:16px 16px 0 0"><a href="'
    || site
    || '/" style="text-decoration:none;color:#e5e1d7;font-family:Jost, Futura, Century Gothic, Arial, Helvetica, sans-serif;font-weight:700;font-size:24px"><img src="'
    || site
    || '/assets/img/logo.png" width="147" height="70" alt="LAKWA Burger Cafe" style="display:block;border:0;width:147px;height:70px;color:#e5e1d7;font-family:Jost, Futura, Century Gothic, Arial, Helvetica, sans-serif;font-weight:700;font-size:24px"></a></td></tr><tr><td bgcolor="#f6f3ec" style="background:#f6f3ec;padding:34px 32px 30px;font-family:Space Grotesk, Helvetica Neue, Arial, Helvetica, sans-serif;font-size:16px;line-height:1.6;color:#1a1e1f">'
    || p_body
    || '</td></tr><tr><td bgcolor="#49747e" style="background:#49747e;padding:24px 32px 26px;border-radius:0 0 16px 16px;font-family:Space Grotesk, Helvetica Neue, Arial, Helvetica, sans-serif;font-size:13px;line-height:1.7;color:#e5e1d7"><div style="font-family:Jost, Futura, Century Gothic, Arial, Helvetica, sans-serif;font-weight:700;font-size:20px;letter-spacing:-0.02em;color:#e5e1d7;margin-bottom:6px">Lakwa Burger Cafe</div>Kalye Artisano, Lio Estate, Villa Libertad, El Nido, Palawan<br><a href="tel:+639311549766" style="color:#e5e1d7;text-decoration:underline">(0931) 154-9766</a> &nbsp;&middot;&nbsp; <a href="'
    || site
    || '/" style="color:#e5e1d7;text-decoration:underline">lakwaburger.com</a> &nbsp;&middot;&nbsp; <a href="https://www.instagram.com/lakwamotorcycles/" style="color:#e5e1d7;text-decoration:underline">Instagram</a> &nbsp;&middot;&nbsp; <a href="https://www.facebook.com/lakwatseromotorcycles" style="color:#e5e1d7;text-decoration:underline">Facebook</a></td></tr><tr><td align="center" style="padding:16px 12px 0;font-family:Space Grotesk, Helvetica Neue, Arial, Helvetica, sans-serif;font-size:11px;line-height:1.5;color:#6b6f70">Lakwa Burger Cafe &middot; the kitchen of Lakwa Motorcycle Tours, El Nido</td></tr></table></td></tr></table></div>';
  perform net.http_post(
    url := url,
    headers := jsonb_build_object('x-hook-secret', hook, 'Content-Type', 'application/json'),
    body := jsonb_build_object('to', p_to, 'subject', p_subject, 'html', html)
  );
  return true;
end $$;
