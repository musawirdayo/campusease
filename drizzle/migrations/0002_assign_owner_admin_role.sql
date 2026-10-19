CREATE OR REPLACE FUNCTION public.assign_campusease_owner_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(new.email) = lower('abdulmusawirdayo35@gmail.com') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (new.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN new;
END;
$$;

CREATE TRIGGER assign_campusease_owner_role_after_signup
AFTER INSERT OR UPDATE OF email ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.assign_campusease_owner_role();
