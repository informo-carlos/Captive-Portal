---
description: Deploy padronizado no VPS (pull develop + build + recreate + health-check)
argument-hint: "[serviços específicos, ex.: admin-backend admin-frontend]"
allowed-tools: Bash(bash infra/deploy.sh:*), Bash(ssh captive-vps:*)
---

Faça o deploy executando o script padronizado:

```bash
bash infra/deploy.sh $ARGUMENTS
```

Pré-condições (confirme antes): a mudança já está mergeada em `develop` e o CI passou.
Após rodar, confirme a saúde com `/tenant-status` e `/logs` dos serviços alterados.
Se `infra/deploy.sh` falhar em algum passo, NÃO continue — reporte o passo que quebrou.
