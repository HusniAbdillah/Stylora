CREATE FUNCTION public.stylora_install_dispatch_secret_20261108(p_secret text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE existing_id uuid;
BEGIN
  IF p_secret IS NULL OR p_secret !~ '^[A-Za-z0-9_-]{43,128}$' THEN
    RAISE EXCEPTION 'DISPATCH_SECRET_INVALID';
  END IF;
  SELECT id INTO existing_id FROM vault.secrets WHERE name='stylora_dispatch_secret';
  IF existing_id IS NULL THEN
    PERFORM vault.create_secret(p_secret,'stylora_dispatch_secret','Stylora repair-only credential');
  ELSE
    PERFORM vault.update_secret(existing_id,p_secret);
  END IF;
  RETURN EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name='stylora_dispatch_secret' AND decrypted_secret=p_secret);
END; $$;
REVOKE ALL ON FUNCTION public.stylora_install_dispatch_secret_20261108(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stylora_install_dispatch_secret_20261108(text) TO service_role;
NOTIFY pgrst, 'reload schema';
