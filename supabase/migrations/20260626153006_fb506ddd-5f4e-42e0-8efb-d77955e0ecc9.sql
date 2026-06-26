
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Storage policies: per-user folder isolation
CREATE POLICY "research-docs read own"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'research-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "research-docs insert own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'research-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "research-docs update own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'research-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "research-docs delete own"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'research-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
