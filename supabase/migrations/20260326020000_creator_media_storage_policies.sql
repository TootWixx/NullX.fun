-- Fix Supabase Storage RLS blocking avatar/background uploads
-- Bucket: creator-media
-- Client uploads to: profiles/<auth.uid()>/<avatar|background>.<ext>

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "creator-media: insert own profiles" ON storage.objects;
CREATE POLICY "creator-media: insert own profiles"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'creator-media'
    AND split_part(name, '/', 2) = auth.uid()::text
  );

DROP POLICY IF EXISTS "creator-media: update own profiles" ON storage.objects;
CREATE POLICY "creator-media: update own profiles"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'creator-media'
    AND split_part(name, '/', 2) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'creator-media'
    AND split_part(name, '/', 2) = auth.uid()::text
  );

DROP POLICY IF EXISTS "creator-media: delete own profiles" ON storage.objects;
CREATE POLICY "creator-media: delete own profiles"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'creator-media'
    AND split_part(name, '/', 2) = auth.uid()::text
  );

