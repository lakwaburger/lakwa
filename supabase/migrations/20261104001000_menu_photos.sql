-- ============================================================================
-- Menu photos hosted on the site (assets/img/menu) instead of Squarespace, whose image server is
-- blocked on some networks (the cafe's Starlink). Items without a real photo get an AI-made one.
-- Never overwrites photos uploaded in Staff → Menu & prices. Safe to re-run.
-- ============================================================================

update public.menu_items set image_url = '/assets/img/menu/classic-burgers-double-cheese.jpg' where id = 'ed6e31c5-223d-4730-abe9-6750f6b9ce62' and (image_url is null or image_url like '%squarespace-cdn.com%');  -- Double Cheese
update public.menu_items set image_url = '/assets/img/menu/signature-burgers-chimi-churri.jpg' where id = 'e152074f-5226-43c2-9fe5-bcaa82a7b8b2' and (image_url is null or image_url like '%squarespace-cdn.com%');  -- Chimi Churri
update public.menu_items set image_url = '/assets/img/menu/burgers-plain-burger.jpg' where id = 'dfa8435f-c1d1-4e3f-af3e-13c01dadd010' and (image_url is null or image_url like '%squarespace-cdn.com%');  -- Plain Burger
update public.menu_items set image_url = '/assets/img/menu/signature-burgers-arugula-burger.jpg' where id = '61184dd7-1dc7-4213-b8be-ff9500fdfa46' and (image_url is null or image_url like '%squarespace-cdn.com%');  -- Arugula burger
update public.menu_items set image_url = '/assets/img/menu/signature-burgers-tropic-thunder.jpg' where id = '5d88fa39-77aa-4af3-831e-df54f057edf7' and (image_url is null or image_url like '%squarespace-cdn.com%');  -- Tropic Thunder
update public.menu_items set image_url = '/assets/img/menu/signature-burgers-tropic-thunder.jpg' where id = '45864996-40bb-410c-a9f5-9d3c999aa98a' and (image_url is null or image_url like '%squarespace-cdn.com%');  -- Tropic Thunder
update public.menu_items set image_url = '/assets/img/menu/signature-burgers-blue-cheese.jpg' where id = '3bbb9c24-0a63-445a-a81c-72b47fa1fd02' and (image_url is null or image_url like '%squarespace-cdn.com%');  -- Blue Cheese
update public.menu_items set image_url = '/assets/img/menu/signature-burgers-tuna-chunks.jpg' where id = '1e66b39f-23c5-4f62-962a-d984d2f23f55' and (image_url is null or image_url like '%squarespace-cdn.com%');  -- Tuna Chunks
update public.menu_items set image_url = '/assets/img/menu/add-ons-french-fries.jpg' where id = 'f2e24a33-4bae-41ca-8428-6f9b2ed1f433' and (image_url is null or image_url like '%squarespace-cdn.com%');  -- French Fries
update public.menu_items set image_url = '/assets/img/menu/add-ons-cheese.jpg' where id = '5b7d8fe2-baa4-4c18-9238-bc3af68bbd22' and (image_url is null or image_url like '%squarespace-cdn.com%');  -- Cheese
update public.menu_items set image_url = '/assets/img/menu/add-ons-caramelized-onion.jpg' where id = '8988ae51-f21a-47dd-91ac-a388bebc46b6' and (image_url is null or image_url like '%squarespace-cdn.com%');  -- Caramelized onion
update public.menu_items set image_url = '/assets/img/menu/add-ons-egg.jpg' where id = 'f92d610a-c610-43b8-bd53-c1b71e920b44' and (image_url is null or image_url like '%squarespace-cdn.com%');  -- Egg
update public.menu_items set image_url = '/assets/img/menu/add-ons-crispy-chicken-patty.jpg' where id = 'b685bc03-4cff-496d-9137-b1b214130c64' and (image_url is null or image_url like '%squarespace-cdn.com%');  -- Crispy chicken patty
update public.menu_items set image_url = '/assets/img/menu/add-ons-chimi-churri-sauce.jpg' where id = '86892311-6f3b-429d-87ba-8069a7034e03' and (image_url is null or image_url like '%squarespace-cdn.com%');  -- Chimi churri sauce
update public.menu_items set image_url = '/assets/img/menu/add-ons-blue-cheese.jpg' where id = '66de695f-7d6e-48f4-9b60-6d8e93b09aec' and (image_url is null or image_url like '%squarespace-cdn.com%');  -- Blue Cheese
update public.menu_items set image_url = '/assets/img/menu/add-ons-mango-pineapple-jam.jpg' where id = '90739d7e-0483-4c88-809f-256d3f942d74' and (image_url is null or image_url like '%squarespace-cdn.com%');  -- Mango Pineapple Jam

-- Check: should be 0
select count(*) as without_photo from public.menu_items where image_url is null or image_url like '%squarespace-cdn.com%';
