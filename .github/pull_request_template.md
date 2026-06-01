## Summary
<!-- O que muda e por quê. -->

## Task / Escopo
<!-- ID da task (ex.: T1) ou descrição. Confirme: é MVP SonicWall ou Futuro? -->

## Checklist
- [ ] Segui o protocolo de `docs/workflow-claude.md`
- [ ] Segui a spec em `docs/` (rode `/spec-check` se tocou rota/contrato)
- [ ] Sem credenciais no código (env vars)
- [ ] Campos sensíveis criptografados (AES-256)
- [ ] OTP nunca logado; `password_hash` nunca retornado; telefones mascarados
- [ ] `tsc`/`build` + `vitest` passando localmente
- [ ] CI verde (lint • typecheck • test • docker build)
