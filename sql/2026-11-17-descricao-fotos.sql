-- Executar no SQL Editor do Supabase antes de testar o novo recurso.
ALTER TABLE public.visitas_fotos ADD COLUMN IF NOT EXISTS descricao text;
ALTER TABLE public.visitas_fotos DROP CONSTRAINT IF EXISTS visitas_fotos_descricao_tamanho;
ALTER TABLE public.visitas_fotos ADD CONSTRAINT visitas_fotos_descricao_tamanho CHECK (char_length(coalesce(descricao,'')) <= 500);
