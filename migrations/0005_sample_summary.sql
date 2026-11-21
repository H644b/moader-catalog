-- The website displays the sample disclosure with the game name.
UPDATE mods SET draft = json_set(draft, '$.summary', 'A five-color orchard palette, from sunlit pear to deep spruce.')
WHERE id = 'f0fd573c-c229-5438-a2f4-61e6e6bb35da';
UPDATE releases SET meta = json_set(meta, '$.summary', 'A five-color orchard palette, from sunlit pear to deep spruce.')
WHERE mod_id = 'f0fd573c-c229-5438-a2f4-61e6e6bb35da';
