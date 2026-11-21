-- The original palette is a working publishing example for a fictional title.
UPDATE mods SET draft = json_set(draft, '$.sample', json('true'), '$.summary', 'Five orchard colors, from sunlit pear to deep spruce. This sample is for a fictional game.')
WHERE id = 'f0fd573c-c229-5438-a2f4-61e6e6bb35da';
UPDATE releases SET meta = json_set(meta, '$.sample', json('true'), '$.summary', 'Five orchard colors, from sunlit pear to deep spruce. This sample is for a fictional game.')
WHERE mod_id = 'f0fd573c-c229-5438-a2f4-61e6e6bb35da';
