---
description: Verifica a mudança atual contra as specs (docs/spec-*.md) e as regras do CLAUDE.md
---

Use o subagent **spec-guard** para revisar a conformidade da mudança atual.

Passe a ele o contexto: rode `git diff` e peça que compare com `docs/spec-auth-api.md`,
`docs/spec-admin-api.md` e as "Regras que NUNCA devem ser quebradas" do `CLAUDE.md`.
Relate o veredito (✅/❌) e a lista de divergências `arquivo:linha → regra → correção`.
