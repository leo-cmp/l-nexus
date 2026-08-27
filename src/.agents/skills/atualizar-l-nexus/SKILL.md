---
name: atualizar-l-nexus
description: Atualiza o l-nexus para a versao mais recente via npx e reexecuta install.sh.
---

# Atualizar l-nexus

## Fluxo

1. **Atualizar:**
   ```bash
   npx @leo-cmp/l-nexus update
   ```

2. **Reportar:**
   - Versao instalada: (mostre `cat .l-nexus/VERSION 2>/dev/null || echo "via npx"`)
   - Arquivos atualizados: (liste os diretorios re-copiados)

## Seguranca

- O comando `update` limpa e recria `.agents/` e `.mcp.json`.
- Se houver alteracoes locais nesses diretorios, PARE e pergunte antes de prosseguir.
