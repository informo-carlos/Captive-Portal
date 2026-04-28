-- =============================================
-- 016_clean_orphan_tenant_serials.sql
-- Remove serials de tenants soft-deletados pra liberar a UNIQUE
-- constraint pra reuso em tenants novos.
--
-- Problema (relatado em produção): a migration 015 mudou as constraints
-- da tabela `tenants` (port, name, radius ports) pra partial unique
-- excluindo deleted_at IS NOT NULL — mas a `uq_tenant_serials_serial`
-- mora numa tabela DIFERENTE (`tenant_serials`) e ficou plena. Soft-delete
-- de um tenant não removia as rows correspondentes em tenant_serials, e
-- o serial ficava "preso" mesmo o tenant deletado.
--
-- Sintoma: usuário tentava reutilizar um serial em tenant novo e batia em
-- 23505 "duplicate key value violates unique constraint
-- uq_tenant_serials_serial".
--
-- Por que partial unique não resolve aqui: tenant_serials não tem coluna
-- deleted_at (a info mora no FK pro parent), e Postgres partial indexes
-- não aceitam subqueries no WHERE. A solução estrutural é hard-deletar
-- as rows de tenant_serials quando o parent é soft-deletado — semântica
-- correta de qualquer jeito (serial deixa de "pertencer" ao tenant
-- deletado). FK ON DELETE CASCADE não dispara em soft-delete, por isso
-- precisamos fazer no app.
--
-- Esta migration:
--   1. Limpa serials órfãos atuais (apontando pra tenants soft-deletados)
--
-- Companheiro: o handler DELETE /admin/tenants/:id no admin-backend
-- agora também faz DELETE FROM tenant_serials antes do UPDATE, pra
-- evitar o problema voltar a acumular.
-- =============================================

DELETE FROM tenant_serials
 WHERE tenant_id IN (
   SELECT id FROM tenants WHERE deleted_at IS NOT NULL
 );
