---
name: lnx-nexus-atualizar
description: Atualiza o pacote l-nexus para a versao mais recente via npx update e verifica se o roteamento do projeto precisa de migracao.
---

# Atualizar l-nexus

## Fluxo

1. **Registrar a versao atual antes de mexer** (para saber o que mudou):
   ```bash
   grep -m1 schema_version .ai/model-routing.yaml
   ```

2. **Atualizar:**
   ```bash
   npx @leo-cmp/l-nexus update
   ```

3. **Verificar se o roteamento do projeto ficou defasado:**

   O `update` recria `.agents/` e os templates, mas **nunca** toca em
   `.ai/model-routing.yaml` — esse arquivo pertence ao projeto. Quando o pacote
   evolui o schema, o projeto continua no schema antigo e as tasks novas param
   de validar.

   ```bash
   grep -m1 schema_version .ai/model-routing.yaml
   grep -m1 'schema:' .ai/templates/task.md
   ```

   Se o `schema_version` do roteamento for **menor** que o `model_plan.schema`
   declarado no template, o projeto precisa migrar. O sintoma, se ninguem
   migrar, e toda task nova falhar com:

   ```text
   task.model_plan.schema: requires routing schema_version 2 in model-routing.yaml
   ```

4. **Perguntar ao usuario antes de migrar.** Nao migre em silencio: o
   roteamento carrega decisoes do projeto (modelos avaliados, politica de
   revisao, runners). Mostre o que mudaria e pergunte.

   Primeiro simule e apresente o diff:
   ```bash
   npx @leo-cmp/l-nexus migrate-routing .ai/model-routing.yaml > /tmp/routing-novo.yaml
   diff .ai/model-routing.yaml /tmp/routing-novo.yaml
   ```

   Pergunte: *"O roteamento do projeto esta no schema N e os templates novos
   exigem o schema M. A migracao muda estas linhas [mostre o diff]. Preserva
   seus modelos, politicas e comentarios. Posso aplicar?"*

   So depois de um "sim" explicito:
   ```bash
   npx @leo-cmp/l-nexus migrate-routing .ai/model-routing.yaml --write
   ```

5. **Repassar as notas de revisao manual.** O `--write` imprime no stderr uma
   lista do que ele se recusou a decidir sozinho. Nao engula essa lista:
   mostre-a ao usuario. Ela costuma conter escolhas reais, como o piso do
   tester ter sido herdado do executor (o lado seguro do erro) quando um tester
   mais barato tambem seria valido.

6. **Tasks existentes:** continuam validas no schema antigo e **nao** precisam
   migrar. Se o usuario quiser adotar o contrato novo numa task especifica:
   ```bash
   npx @leo-cmp/l-nexus migrate-task <caminho-da-task> --to 2 --write
   ```
   Essa migracao nao inventa modelo nem effort: ela marca a task com
   `needs_manual_routing` e o validador reprova ate um humano completar o
   roteamento. Avise o usuario disso antes de rodar.

7. **Reportar:**
   - Versao instalada.
   - Diretorios re-copiados.
   - Se o roteamento foi migrado, para qual schema, e as notas de revisao manual.
   - Se nao foi migrado, deixe registrado que a pendencia existe.

## Seguranca

- O `update` limpa e recria `.agents/` e `.mcp.json`. Se houver alteracao local
  nesses diretorios, PARE e pergunte antes de prosseguir.
- Nunca rode `migrate-routing --write` sem apresentar o diff e obter
  confirmacao. O arquivo e do projeto.
- Nunca edite `.ai/model-routing.yaml` na mao para "consertar" o schema: use a
  migracao, que preserva comentarios e so acrescenta o que o schema exige.
