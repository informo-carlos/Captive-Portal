---
description: Lista os tenants e seus status direto do banco no VPS
allowed-tools: Bash(ssh captive-vps:*)
---

Liste os tenants ativos no VPS executando:

```bash
ssh captive-vps "docker exec infra-postgres-1 psql -U captive -d captive_portal -c \"SELECT id, name, port, auth_mode, status FROM tenants WHERE deleted_at IS NULL ORDER BY port;\""
```

Mostre o resultado em tabela e aponte qualquer tenant em status diferente de `active`
(ex.: `provisioning`, `error`).
