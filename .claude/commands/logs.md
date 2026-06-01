---
description: Mostra os últimos logs de um container no VPS
argument-hint: <container> [linhas]
allowed-tools: Bash(ssh captive-vps:*)
---

Mostre os logs do container **$1** no VPS (padrão: 50 linhas; use `$2` se informado):

```bash
ssh captive-vps "docker logs $1 --tail ${2:-50} 2>&1"
```

Containers comuns: `infra-admin-backend-1`, `infra-admin-frontend-1`,
`infra-provisioner-1`, `infra-postgres-1`, e os `portal-<tenant>-<porta>`.
Se `$1` estiver vazio, primeiro liste os containers com `ssh captive-vps "docker ps --format '{{.Names}}'"`.
Resuma erros/exceções encontrados.
