# Avaliação dos modelos disponíveis no gateway `opencode-go`

**Data:** 2026-09-20 · **Gateway:** `ocg` (opencode-go), via 9router · **CLI de destino:** opencode

Este documento é matéria-prima para as entradas do catálogo (`src/.ai/model-routing.yaml`).
Nada aqui entra no catálogo automaticamente: o catálogo exige `last_evaluated` e
`evidence`, e a decisão de perfil e de papel é humana.

> **Como os números foram obtidos.** Pesquisa documental feita por `gpt-6-astra`
> em 2026-09-20, com busca na web, sob instrução explícita de escrever
> `NÃO ENCONTREI` em vez de estimar. Nenhum benchmark foi reexecutado aqui.
> `last_evaluated: 2026-09-20` significa *data da revisão documental*, não data
> de medição.

---

## 1. Achado que vale mais que a tabela

**Os quinze modelos pesquisados voltaram como "bom para executor". Nenhum como
tester ou reviewer.**

Não é falha da pesquisa — é o que os dados permitem dizer. SWE-bench,
Terminal-Bench e Program Bench medem **implementação**: resolver issue, produzir
patch, executar tarefa em terminal. Não existe benchmark público de larga adoção
que meça qualidade de **revisão**.

Consequência prática para este kit: **papel não sai de pesquisa.** Sai de:

- **independência** — quem revisa não pode ser quem executou (regra do kit);
- **diversidade de provedor e de conta** — um papel de gate com fonte única vira beco;
- **custo e cota** — revisor roda em todo commit final;
- **evidência interna observada.** O catálogo já tem um caso exemplar: a entrada
  de `alibaba-qwen-3-8-flash` cita a re-revisão da task 4.4 neste repositório,
  onde o modelo reexecutou a suíte por conta própria, citou arquivo e linha, e
  descartou corretamente um falso positivo. Isso vale mais, para decidir revisor,
  que qualquer número de SWE-bench.

---

## 2. Níveis de thinking suportados

Levantado dos prints do painel do 9router em 2026-09-20. Com o gateway em
**Auto**, o kit só pode declarar um esforço que o modelo aceita — pedir `low` a
um DeepSeek devolve HTTP 400. O nível deixa de ser cosmético e passa a fazer
parte da elegibilidade.

| Família | `minimal` | `low` | `medium` | `high` | `xhigh` | `max` | `thinking` |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| DeepSeek (flash, v4-pro, v4-flash, vision-exp) | | | | ✓ | | ✓ | |
| Kimi (k3, k2.7-code, k2.6) | | ✓ | ✓ | ✓ | | ✓ | |
| Qwen (3.8-max, 3.8-flash, 3.7-max, 3.7-plus, 3.6-plus) | | ✓ | ✓ | ✓ | | | |
| Hy3 | | ✓ | ✓ | ✓ | | | |
| Grok 4.6, GPT 5.6 Luna, Muse Spark 1.2/1.3 | ✓ | ✓ | ✓ | ✓ | ✓ | | |
| GLM (5.3-flash, 5.3, 5.2, 5.1) | | | | | | | ✓ |
| MiniMax (m3, m2.7, m2.5) | | | | | | | ✓ |
| LongCat 2.0, MiMo V2.5, MiMo V2.5 Pro, Hy4 preview | — | — | — | — | — | — | — |

Quatro vocabulários incompatíveis, e quatro modelos sem controle nenhum.

---

## 3. Modelos já no catálogo

Perfil conforme `src/.ai/model-routing.yaml`. Cota conforme o painel do 9router.

| Chave do catálogo | id no gateway | Perfil | Cota | Papel hoje |
|---|---|---|---:|---|
| `deepseek-v4-1-flash` | `ocg/deepseek-flash` | **frontier** | 26.000 | executor default |
| `xiaomi-mimo-v2-5` | `ocg/mimo-v2.5` | balanced | 30.100 | tester default |
| `meituan-longcat-2-0` | `ocg/longcat-2.0` | balanced | 11.400 | executor alt1 |
| `zhipu-glm-5-3-flash` | `ocg/glm-5.3-flash` | balanced | 6.320 | reviewer default |
| `alibaba-qwen-3-8-flash` | `ocg/qwen3.8-flash` | balanced | 5.400 | tester alt1 |
| `alibaba-qwen-3-7-plus` | `ocg/qwen3.7-plus` | balanced | 4.300 | executor (documentation) |
| `tencent-hy3` | `ocg/hy3` | balanced | 4.300 | executor alt1 (documentation) |
| `openai-gpt-5-6-luna` | `ocg/gpt-5.6-luna` | economical → balanced em `high` | 2.050 | reviewer alt1 |
| `meta-muse-spark-1-3-contributor` | `ocg/muse-spark-1.3-contributor` | balanced → **frontier** em `high`/`max` | 45.300 | fora dos combos |
| `meta-muse-spark-1-2-contributor` | `ocg/muse-spark-1.2-contributor` | balanced (`preview`) | 45.300 | fora dos combos |

**Aposentados no catálogo, presentes no gateway — não entram em pool:**
`deepseek-v4-pro`, `deepseek-v4-flash`, `deepseek-v4-flash-vision-exp`.

**Muse Spark:** exige liberar, no console do opencode, a permissão para endpoints
que treinam com os dados enviados. Mesmo liberado, permanece barrado em task com
dado financeiro, nome de pessoa física, credencial ou regra de negócio privada —
o que inclui o projeto `clp`. Fica **fora dos combos**, de uso deliberado.

---

## 4. Modelos pesquisados em 2026-09-20

### Perfil `frontier` sugerido

| Modelo | id no gateway | Números | Independente? | Cota |
|---|---|---|:-:|---:|
| Kimi K3 | `ocg/kimi-k3` | Terminal-Bench 2.1: 88,3 · GPQA Diamond: 93,5 · AA-Briefcase Elo 1543, aprovação 51% | **parcial** | 110 |
| GLM-5.3 | `ocg/glm-5.3` | Terminal-Bench 2.1: 88,2 · DeepSWE v1.1: 66,9 · CyberGym: 84,5 | não | 220 |
| Qwen3.8 Max | `ocg/qwen3.8-max` | Terminal-Bench 2.1: 86,6 · SWE-bench Pro: 67,7 · GPQA: 92,6 | não | 160 |
| GLM-5.2 | `ocg/glm-5.2` | Terminal-Bench 2.1: 81,0 · SWE-bench Pro: 62,1 · GPQA: 91,2 | não | 880 |
| Grok 4.6 | `ocg/grok-4.6` | CursorBench v3.2: 69,9 · DeepSWE v1.1: 65,9 · Terminal-Bench 3.0: 26 | não | 169 |

### Perfil `balanced` sugerido

| Modelo | id no gateway | Números | Independente? | Cota |
|---|---|---|:-:|---:|
| Qwen3.7 Max | `ocg/qwen3.7-max` | SWE-bench Verified: 80,4 · SWE-bench Pro: 60,6 · TB2.0: 69,7 | não | 170 |
| Kimi K2.6 | `ocg/kimi-k2.6` | SWE-bench Verified: 80,2 · SWE-bench Pro: 58,6 · TB2.0: 66,7 | não | 1.150 |
| MiMo V2.5 Pro | `ocg/mimo-v2.5-pro` | SWE-bench Verified: 78,9 · SWE-bench Pro: 57,2 · TB2.0: 68,4 | não | 3.250 |
| Hy4 preview | `ocg/hy4-preview` | SWE-bench Pro: 65,7 · SWE-bench Multilingual: 82,9 · GPQA: 92,3 | não | 1.350 |
| MiniMax M3 | `ocg/minimax-m3` | SWE-bench Pro: 59,0 · TB2.1: 66,0 · MCP Atlas: 74,2 | não | 3.200 |
| Kimi K2.7 Code | `ocg/kimi-k2.7-code` | Program Bench: 53,6 · MCP Atlas: 76,0 · MCP Mark Verified: 81,1 | não | 1.350 |
| GLM-5.1 | `ocg/glm-5.1` | SWE-bench Pro: 58,4 · TB2.0: 63,5 · GPQA: 86,2 | não | 880 |
| Qwen3.6 Plus | `ocg/qwen3.6-plus` | SWE-bench Verified: 58 · GPQA: 88 | **sim — Epoch AI** | 3.300 |
| MiniMax M2.7 | `ocg/minimax-m2.7` | SWE-bench Pro: 56,2 · VIBE-Pro: 55,6 · Terminal Bench 2: 57,0 | não | 3.400 |

### Perfil `economical` sugerido

| Modelo | id no gateway | Números | Independente? | Cota |
|---|---|---|:-:|---:|
| MiniMax M2.5 | `ocg/minimax-m2.5` | SWE-bench Verified: 80,2 · Multi-SWE-Bench: 51,3 · GPQA: 85,2 | não | — |

Perfil `economical` sugerido pelo **preço** documentado (US$ 0,30 / 1,20 por
milhão de tokens), não por fraqueza medida.

---

## 5. Ressalvas por modelo

Material direto para o campo `uso_restrito` das entradas de catálogo.

| Modelo | Ressalva |
|---|---|
| **Hy4 preview** | A Tencent **admite** limitações conhecidas: raciocínio excessivamente demorado e verificações repetidas. É `preview`. Recomendado restringir a experimentação controlada — **fora de pool de gate**. |
| **Kimi K3** | A política do Kimi OpenPlatform inclui treinamento e aperfeiçoamento de modelos entre os usos das informações. |
| **Kimi K2.7 Code / K2.6** | A garantia de não-treinamento encontrada refere-se à **Kimi API**. Não se estende automaticamente ao Kimi Code nem a intermediários. |
| **GLM-5.1 / 5.2 / 5.3** | DPA da Z.ai declara processamento geralmente em **Singapura**, sem armazenamento de entrada e saída. Relevante se houver exigência de residência de dados. |
| **Qwen3.6 Plus / 3.7 Max / 3.8 Max** | Model Studio declara não usar dados para treinamento, mas **informa armazenar** os dados gerados nas chamadas. Não equivale a retenção zero. |
| **MiniMax M3** | Política do Code/App/Web permite retenção enquanto necessária. A API tem termos próprios, não verificados integralmente. |
| **MiniMax M2.5** | **Pendência para verificação manual:** a página oficial da política de privacidade da API não retornou texto legível. Retenção e uso de prompts permanecem sem validação. |
| **MiMo V2.5 Pro** | Política específica do endpoint contratado não verificada nesta pesquisa. |
| **Grok 4.6 / MiniMax M2.7** | Nenhuma ressalva encontrada. |

---

## 6. Duas observações estruturais

**Só 2 de 15 têm número de terceiro.** Qwen3.6 Plus (Epoch AI) e Kimi K3
(parcialmente, Artificial Analysis). Os outros treze são auto-publicados pelo
fornecedor. O catálogo já registra essa distinção como relevante, e aqui ela
separa dois modelos de treze.

**Os cinco `frontier` são os de cota mínima:** Kimi K3 com 110, Qwen3.8 Max com
160, Grok 4.6 com 169, GLM-5.3 com 220, GLM-5.2 com 880. A regra 3 do catálogo —
*o caro fica no fim* — deixou de ser princípio e virou descrição do que os dados
mostram. Eles são material de `alt3`, não de `default`.

Fora do gateway, o único `frontier` com cota farta é o `deepseek-v4-1-flash`
(26.000). Um pool `frontier` composto só por ele não é pool: não há rodízio, e a
cota dele acabando o pool inteiro morre.

---

## 7. Fontes

| Modelo | Fonte |
|---|---|
| Grok 4.6 | https://x.ai/news/grok-4-6 |
| GLM-5.1 | https://huggingface.co/zai-org/GLM-5.1#benchmark |
| GLM-5.2 | https://huggingface.co/zai-org/GLM-5.2#benchmark |
| GLM-5.3 | https://huggingface.co/zai-org/GLM-5.3#benchmark |
| Kimi K3 | https://huggingface.co/moonshotai/Kimi-K3#3-evaluation-results · https://artificialanalysis.ai/articles/kimi-k3-agentic-knowledge-benchmark |
| Kimi K2.7 Code | https://huggingface.co/moonshotai/Kimi-K2.7-Code#3-evaluation-results |
| Kimi K2.6 | https://huggingface.co/moonshotai/Kimi-K2.6#3-evaluation-results |
| Qwen3.8 Max | https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B#benchmark-results |
| Qwen3.7 Max | https://github.com/AlibabaCloud-Official/Qwen3.7-max-readme#-benchmark-performance |
| Qwen3.6 Plus | https://epoch.ai/models/qwen-3-6-plus · https://epoch.ai/benchmarks/swe-bench-verified |
| MiMo V2.5 Pro | https://huggingface.co/XiaomiMiMo/MiMo-V2.5-Pro#evaluation-results |
| MiniMax M3 | https://www.minimax.io/blog/minimax-m3 |
| MiniMax M2.7 | https://www.minimax.io/news/minimax-m27-en |
| MiniMax M2.5 | https://huggingface.co/MiniMaxAI/MiniMax-M2.5 |
| Hy4 preview | https://huggingface.co/tencent/Hy4-preview#evaluation-results |
