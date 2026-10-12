-- Order tags are shown in English in the admin (Gift, Urgent, …).
-- Rename the seeded Bangla ones in place so tagged orders keep their tags.
-- Idempotent: skips a rename when the English tag already exists.
UPDATE tags t SET name = v.en
  FROM (VALUES
    ('উপহার', 'Gift'),
    ('জরুরি', 'Urgent'),
    ('আবার অর্ডার', 'Repeat order'),
    ('বাল্ক', 'Bulk'),
    ('কর্পোরেট', 'Corporate'),
    ('যাচাই দরকার', 'Needs check')
  ) AS v(bn, en)
 WHERE t.scope = 'ORDER' AND t.name = v.bn
   AND NOT EXISTS (SELECT 1 FROM tags x WHERE x.scope = 'ORDER' AND x.name = v.en);
