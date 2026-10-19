CREATE TABLE public.app_counter (id int PRIMARY KEY, count bigint NOT NULL DEFAULT 0);
GRANT SELECT ON public.app_counter TO anon, authenticated;
GRANT ALL ON public.app_counter TO service_role;
ALTER TABLE public.app_counter ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read counter" ON public.app_counter FOR SELECT TO anon, authenticated USING (true);
INSERT INTO public.app_counter (id, count) VALUES (1, 2350);
CREATE OR REPLACE FUNCTION public.bump_counter() RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.app_counter SET count = count + 1 WHERE id = 1 RETURNING count;
$$;
GRANT EXECUTE ON FUNCTION public.bump_counter() TO anon, authenticated;