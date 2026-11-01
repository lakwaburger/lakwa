-- Menu items from lakwamotorcycles.com/burger-cafe.
-- base_price = current price (registered customers keep paying this).
-- The public pays base_price + 20% (settings.markup_pct), rounded up to the peso.
-- Cheese is the real current price (₱249); the rest are STAND-INS — update in /staff/menu.
insert into public.menu_items (slug, name, description, base_price, image_url, category, sort_order) values
  ('cheese', 'Cheese',
   '120 GR. Beef Patty, home made brioche, Edam cheese, Ketchup and Lakwanaise.', 249,
   'https://images.squarespace-cdn.com/content/v1/66ee374b9956fe4e4593e2cc/2367956d-de03-40e6-ab71-cf893bb9dd0d/cheeseburegr.jpg',
   'Burgers', 1),
  ('bacon-cheese', 'Bacon Cheese',
   '120 GR Beef Patty, Home made Brioche, Edam Cheese, Bacon, Ketchup, Lakwanaise', 289,
   'https://images.squarespace-cdn.com/content/v1/66ee374b9956fe4e4593e2cc/6af2c29a-a075-4f87-accc-b6088e4961e0/baconburger.jpg',
   'Burgers', 2),
  ('crispy-chicken', 'Crispy Chicken',
   '150 GR Chicken Thigh Patty, Home made Brioche, IceBerg Lettuce, Ketchup, Lakwanaise', 269,
   'https://images.squarespace-cdn.com/content/v1/66ee374b9956fe4e4593e2cc/8fa4c3e6-25f3-4851-899f-f2d5eb9d4612/chiken.jpg',
   'Burgers', 3),
  ('mozzarella-fingers', 'Mozzarella Fingers',
   'Fried Breaded Mozzarella Sticks', 189,
   'https://images.squarespace-cdn.com/content/v1/66ee374b9956fe4e4593e2cc/30479f6d-31ce-4906-9ac3-adb5d10c35bb/cheesesticks.jpg',
   'Sides', 4)
on conflict (slug) do update set
  name = excluded.name, description = excluded.description, base_price = excluded.base_price,
  image_url = excluded.image_url, category = excluded.category, sort_order = excluded.sort_order;
