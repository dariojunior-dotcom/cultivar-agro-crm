# Gestores por equipe — preparação (não ativado)
Regras aprovadas: administrador geral vê tudo e transfere vendedores; gestor comercial vê apenas seus vendedores; vendedor vê apenas sua carteira. Transferência altera gestor_id do vendedor, preservando clientes, fazendas, visitas, fotos, vendas e metas.

Implantação exige:
1. Auditar colunas reais de profiles, papel atual e políticas RLS existentes.
2. Adicionar profiles.gestor_id (FK profiles.id) e papel exclusivo administrador_geral, sem autoelevação.
3. Aplicar RLS de equipes em profiles, clientes, fazendas, visitas, visitas_fotos, oportunidades, metas, vendas e storage.objects. Remover políticas permissivas antigas.
4. Atualizar Edge Function gestao-vendedores para convidar vinculando ao gestor, transferir vendedor somente por administrador geral e restringir alterações de papel.
5. Atualizar interface e indicadores para refletir equipes.
6. Testar acessos cruzados com dois gestores e dois vendedores, transferência e offline.
7. Liberar produção só após testes. Não executar SQL parcial nem alterar produção agora.
