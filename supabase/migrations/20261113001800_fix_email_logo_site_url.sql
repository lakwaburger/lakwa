-- Correct the public base URL used by all transactional emails.
-- The previous value pointed at the old GitHub Pages project path, so the email
-- header image URL was invalid. The repository's existing assets/img/logo.png
-- is the Lakwa Motors mark used on the Earth School membership card.
update private.secrets
set value = 'https://lakwaburger.com'
where key = 'site_url';
