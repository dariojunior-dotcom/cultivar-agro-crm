-- CULTIVAR AGRO | Migracao de equipes (revisar e executar uma unica vez no SQL Editor)
-- Pre-requisitos: profiles(id,nome,papel,ativo,gestor_id), uma unica conta gestor ativa.
-- As tabelas comerciais devem manter as 35 politicas listadas em 17/11/2026.
-- Executar em transacao; erro provoca rollback.
BEGIN;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.profiles WHERE papel='gestor' AND ativo IS TRUE) <> 1 THEN
  RAISE EXCEPTION 'Esperado exatamente um gestor ativo antes da migracao. Nao alterado.';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename IN ('clientes','fazendas','metas','oportunidades','potenciais','safras','vendas','visitas') AND (coalesce(qual,'') NOT IN ('','can_access_owner(vendedor_id)') OR coalesce(with_check,'') NOT IN ('','can_access_owner(vendedor_id)'))) THEN
  RAISE EXCEPTION 'Politicas comerciais mudaram desde a auditoria. Nao alterado.';
 END IF;
END $$;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gestor_id uuid REFERENCES public.profiles(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS administrador_geral boolean NOT NULL DEFAULT false;
UPDATE public.profiles SET administrador_geral=true WHERE papel='gestor' AND ativo IS TRUE AND administrador_geral IS FALSE;
CREATE OR REPLACE FUNCTION public.is_general_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$ SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.ativo IS TRUE AND p.papel='gestor' AND p.administrador_geral IS TRUE) $f$;
CREATE OR REPLACE FUNCTION public.can_access_owner(owner_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$
 SELECT public.is_active_user() AND (
  owner_id=(SELECT auth.uid())
  OR public.is_general_admin()
  OR EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id=owner_id AND p.gestor_id=(SELECT auth.uid())
               AND p.papel='vendedor' AND p.ativo IS TRUE
               AND EXISTS (SELECT 1 FROM public.profiles g
                           WHERE g.id=(SELECT auth.uid()) AND g.papel='gestor' AND g.ativo IS TRUE))
 )
$f$;
-- Evita recursao de RLS em profiles; a funcao tem SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.can_read_profile(profile_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$
 SELECT public.is_active_user() AND (
  profile_id=(SELECT auth.uid()) OR public.is_general_admin()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=profile_id
   AND p.gestor_id=(SELECT auth.uid()) AND p.papel='vendedor'
   AND EXISTS (SELECT 1 FROM public.profiles g WHERE g.id=(SELECT auth.uid()) AND g.papel='gestor' AND g.ativo IS TRUE))
 )
$f$;
-- Conferir se nenhuma politica inesperada de leitura ignora o isolamento.
DO $ BEGIN
 IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname <> 'profiles_select')
 OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='visitas_fotos' AND policyname NOT IN ('visitas_fotos_insert','visitas_fotos_select'))
 OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
    AND (policyname ILIKE '%fotos%' OR coalesce(qual,'') ILIKE '%fotos-visitas%' OR coalesce(with_check,'') ILIKE '%fotos-visitas%')
    AND policyname NOT IN ('fotos_visitas_gestor_select 1fudp7j_0','fotos_visitas_insert 1fudp7j_0','fotos_visitas_insert_gestor','fotos_visitas_select 1fudp7j_0')) THEN
  RAISE EXCEPTION 'Politicas inesperadas detectadas. Reauditar antes de ativar.';
 END IF;
END $;
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
 USING (public.can_read_profile(id));
DROP POLICY IF EXISTS visitas_fotos_insert ON public.visitas_fotos;
CREATE POLICY visitas_fotos_insert ON public.visitas_fotos FOR INSERT TO authenticated
 WITH CHECK (public.can_access_owner(vendedor_id) AND EXISTS
  (SELECT 1 FROM public.visitas v WHERE v.id=visita_id AND v.vendedor_id=visitas_fotos.vendedor_id));
DROP POLICY IF EXISTS "fotos_visitas_gestor_select 1fudp7j_0" ON storage.objects;
DROP POLICY IF EXISTS cultivar_fotos_gestor_select ON storage.objects;
CREATE POLICY cultivar_fotos_gestor_select ON storage.objects FOR SELECT TO authenticated
 USING (bucket_id='fotos-visitas' AND EXISTS
  (SELECT 1 FROM public.visitas v WHERE v.id::text=(storage.foldername(name))[2]
    AND v.vendedor_id::text=(storage.foldername(name))[1]
    AND public.can_access_owner(v.vendedor_id)));
DROP POLICY IF EXISTS fotos_visitas_insert_gestor ON storage.objects;
DROP POLICY IF EXISTS cultivar_fotos_gestor_insert ON storage.objects;
CREATE POLICY cultivar_fotos_gestor_insert ON storage.objects FOR INSERT TO authenticated
 WITH CHECK (bucket_id='fotos-visitas' AND EXISTS
  (SELECT 1 FROM public.visitas v WHERE v.id::text=(storage.foldername(name))[2]
    AND v.vendedor_id::text=(storage.foldername(name))[1]
    AND public.can_access_owner(v.vendedor_id)));
-- A administracao de profiles/gestor_id e realizada somente pela Edge Function usando service role.
-- Nunca conceder UPDATE direto de profiles a usuarios autenticados.
REVOKE ALL ON FUNCTION public.is_general_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_general_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_profile(uuid) TO authenticated;
COMMIT;
-- A migracao nao cria o usuario Diego. Ele deve ser convidado depois, com e-mail proprio.
-- POS-IMPLANTACAO: publicar Edge Function gestao-vendedores; testar com 3 perfis.
-- ATENCAO: mudar gestor_id nao altera vendedor_id nos registros historicos.
