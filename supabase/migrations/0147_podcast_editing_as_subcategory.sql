-- Move all podcast-editing subcategories under music-audio
UPDATE skill_categories
SET parent_category_id = (SELECT id FROM skill_categories WHERE slug = 'music-audio'),
    sort_order = sort_order + 50
WHERE parent_category_id = (SELECT id FROM skill_categories WHERE slug = 'podcast-editing');

-- Delete the podcast-editing parent category
DELETE FROM skill_categories WHERE slug = 'podcast-editing';
