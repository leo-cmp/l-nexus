# Catalogo de modelos avaliados ate 2026-09-21

Este era o \`models:\` do \`model-routing.yaml\` ate a schema 3. Sao 43 modelos
levantados entre agosto e setembro de 2026, cada um com \`profile\` por variante de
esforco, capacidades declaradas, data de avaliacao e a evidencia que sustentou a
classificacao -- benchmark, anuncio do provedor ou medicao feita aqui.

## Por que saiu do kit

O roteamento passou a ser por combo do 9router. O gateway escolhe o modelo, faz
fallback de quota e nunca avisa o kit de qual membro atendeu; o que a task grava
agora vem do campo \`model\` da resposta, que e prova, e nao do catalogo, que era
declaracao. Manter 43 entradas para escolher entre elas deixou de fazer sentido
quando quem escolhe e o gateway.

Fica aqui porque a pesquisa continua valendo como referencia: ao montar ou
revisar um combo, e daqui que sai o que se sabe sobre cada modelo. So nao e mais
lido por codigo nenhum.

```yaml
models:
  anthropic-opus-5:
    provider: anthropic
    model: "claude-opus-5"
    profile: frontier
    profile_by_variant:
      default: frontier
      low: balanced
      high: frontier
      max: frontier
    status: active
    capabilities: [ backend, frontend, tests, sql, review, vision, long-context ]
    last_evaluated: 2026-08-27
    evidence: "A documentação atual da Anthropic identifica `claude-opus-5` para trabalho agentic de programação complexo; no lançamento, a Lovable reportou +22% de sucesso nas suas tarefas agentic de código mais difíceis versus Opus 4.7, sustentando `frontier` no esforço padrão. [S1][S2]"

  openai-gpt-5-6-sol:
    provider: openai
    model: "gpt-5.6-sol"
    profile: frontier
    profile_by_variant:
      default: frontier
      low: balanced
      high: frontier
      max: frontier
    status: active
    capabilities: [ backend, frontend, tests, sql, review, vision, long-context ]
    last_evaluated: 2026-08-27
    evidence: "A OpenAI documenta `gpt-5.6-sol` como o modelo frontier da família; no lançamento, Sol em Max marcou 80 no Artificial Analysis Coding Agent Index e 72,7% no DeepSWE v1.1, justificando `frontier`, com Low rebaixado por reduzir compute de raciocínio. [S5][S6]"

  anthropic-sonnet-5:
    provider: anthropic
    model: "claude-sonnet-5"
    profile: frontier
    profile_by_variant:
      default: frontier
      low: balanced
      high: frontier
      max: frontier
    status: active
    capabilities: [ backend, frontend, tests, sql, review, vision, long-context ]
    last_evaluated: 2026-08-27
    evidence: "A Anthropic lista `claude-sonnet-5` entre os modelos atuais e o lançamento de 30/06/2026 documenta desempenho de agentic coding em classe Opus, além de ganhos em tarefas de engenharia de software, o que sustenta `frontier` no padrão e acima, mas não em Low. [S1][S3]"

  openai-gpt-5-6-terra:
    provider: openai
    model: "gpt-5.6-terra"
    profile: balanced
    profile_by_variant:
      default: balanced
      low: balanced
      high: frontier
      max: frontier
    status: active
    capabilities: [ backend, frontend, tests, sql, review, vision, long-context ]
    last_evaluated: 2026-08-27
    evidence: "A OpenAI define `gpt-5.6-terra` como a opção que equilibra inteligência e custo; sua tabela de coding reporta 77,4 no Artificial Analysis Coding Agent Index, 63,4% no SWE-Bench Pro, 69,6% no DeepSWE v1.1 e 87,4% no Terminal-Bench 2.1, sustentando `balanced` por padrão e `frontier` apenas com High/Max. [S5][S7]"

  deepseek-v4-1-flash:
    provider: deepseek
    model: "deepseek-flash"
    profile: frontier
    profile_by_variant:
      default: frontier
      low: balanced
      high: frontier
      max: frontier
    status: active
    effort_levels: [ high, max ]
    capabilities: [ backend, frontend, tests, sql, review, vision, long-context ]
    last_evaluated: 2026-09-18
    evidence: "A DeepSeek lançou o DeepSeek-V4.1-Flash em 10/09/2026 sob o ID de API `deepseek-flash`, com 1M de contexto, 384K de saída, visão e concorrência de 2500; o model card reporta 90,6% no Terminal-Bench 2.1, 74,2% no DeepSWE, 65,4% no NL2Repo e 3471 de Codeforces, superando o V4 Pro em todas as métricas comparáveis por um preço 4,4x menor na entrada, o que sustenta `frontier`. Ressalva: marca apenas 20,3% no ProgramBench, contra 93,0% do Claude Opus 5, e nenhuma linha de coding tem medição independente, todas são do próprio provedor. [S9][S19]"

  deepseek-v4-pro:
    provider: deepseek
    model: "deepseek-v4-pro"
    profile: frontier
    profile_by_variant:
      default: frontier
      low: balanced
      high: frontier
      max: frontier
    status: retired
    effort_levels: [ high, max ]
    capabilities: [ backend, frontend, tests, sql, review, long-context ]
    last_evaluated: 2026-09-20
    evidence: "APOSENTADO em 2026-09-20 por decisao do humano. Nao e retirada do provedor: e redundancia. O `deepseek-v4-1-flash` o supera em todas as metricas comparaveis (Terminal-Bench 2.1 de 90,6 contra 87,9; DeepSWE de 74,2 contra 62,7) e custa menos, entao mante-lo como upgrade prometia uma escalada que na pratica nao escala. Pior: como revisor do v4.1 ele nao compra independencia, porque os dois compartilham linhagem e, com ela, os pontos cegos — que e justamente o que o gate de revisao existe para cobrir. Um slot que nao acrescenta capacidade nem independencia nao merece existir. Avaliacao anterior (2026-09-18): GA em 13/08/2026 e reportou 87,9 no Terminal-Bench 2.1, 61,5 no NL2Repo, 62,7 no DeepSWE v1.1 e 83,3 no CyberGym, além de posicioná-lo como seu modelo SOTA para agentic coding; por isso o padrão é `frontier`. Ressalva de ciclo de vida acrescentada em 2026-09-18: a DeepSeek anunciou o fim do serviço de API depois de 14/09/2026 e voltou atrás em resposta à demanda dos usuários, sem prazo garantido, então ancorar rota R3 nele é frágil. O `deepseek-v4-1-flash` o supera em todas as métricas comparáveis e custa menos. [S9][S10][S19]"

  deepseek-v4-flash:
    provider: deepseek
    model: "deepseek-v4-flash"
    profile: balanced
    profile_by_variant:
      default: balanced
      low: economical
      high: balanced
      max: balanced
    status: retired
    effort_levels: [ high, max ]
    capabilities: [ backend, frontend, tests, sql, review, long-context ]
    last_evaluated: 2026-09-18
    evidence: "APOSENTADO em 2026-09-18. A nota oficial de Models & Pricing da DeepSeek declara que `deepseek-v4-flash` foi retirado: o nome ainda é aceito, mas as requisições são servidas pelo DeepSeek-V4.1-Flash e cobradas no preço Flash. Manter a entrada como active faria o roteamento prometer um `balanced` em preview e entregar um frontier, deriva de identidade que o `unknown_model_identity: reject_for_r3` existe para barrar. Use `deepseek-v4-1-flash`. Avaliação anterior (2026-08-27): 82,7 no Terminal-Bench 2.1 e 54,2 no NL2Repo em Max, classificado `balanced`. [S9][S10][S19]"

  deepseek-v4-flash-vision-exp:
    provider: deepseek
    model: "deepseek-v4-flash-vision-exp"
    profile: balanced
    profile_by_variant:
      default: balanced
      low: economical
      high: balanced
      max: balanced
    status: retired
    effort_levels: [ high, max ]
    capabilities: [ backend, frontend, tests, sql, review, vision, long-context ]
    last_evaluated: 2026-09-18
    evidence: "APOSENTADO em 2026-09-18 pela mesma nota oficial que retirou o `deepseek-v4-flash`: o ID continua aceito, mas quem responde é o DeepSeek-V4.1-Flash, cobrado no preço Flash. Use `deepseek-v4-1-flash`. Avaliação anterior (2026-08-27): lançado em 21/08/2026 como experimental, 83,9 no Terminal-Bench 2.1 em Max, classificado `balanced`. [S9][S10][S19]"

  google-gemini-3-8-flash:
    provider: google
    model: "gemini-3.8-flash"
    profile: balanced
    profile_by_variant:
      default: balanced
      low: economical
      high: balanced
      max: balanced
    status: active
    capabilities: [ backend, frontend, tests, sql, review, vision, long-context ]
    last_evaluated: 2026-09-18
    evidence: "A documentação da Gemini API lista `gemini-3.8-flash` como Estável e a model card do DeepMind o marca em General availability, com 1M tokens de entrada, 64k de saída, multimodalidade completa e computer use; o lançamento de 02/09/2026 afirma que ele supera a maioria dos modelos frontier maiores no DeepSWE v1.1 e reporta 54,9% no HLE-Verified, mas os números de programação aparecem apenas em gráficos, sem valor textual verificável, e o próprio texto diz que ele se aproxima de modelos frontier mais caros sem igualá-los; por isso fica `balanced`, como o 3.7. [S18]"

  google-gemini-3-7-flash:
    provider: google
    model: "gemini-3.7-flash"
    profile: balanced
    profile_by_variant:
      default: balanced
      low: economical
      high: balanced
      max: balanced
    status: active
    capabilities: [ backend, frontend, tests, sql, review, vision, long-context ]
    last_evaluated: 2026-08-27
    evidence: "A documentação Google de 13/08/2026 marca `gemini-3.7-flash` como Stable, nativamente multimodal, com 1.048.576 tokens de entrada, execução de código e thinking; como não encontrei ali um número público verificável de benchmark de programação específico do 3.7 Flash, a classificação fica conservadoramente em `balanced`. [S11]"

  zhipu-glm-5-3-flash:
    provider: zhipu
    model: "glm-5.3-flash"
    profile: balanced
    profile_by_variant:
      default: balanced
      low: economical
      high: balanced
      max: balanced
    status: active
    effort_levels: [ thinking ]
    capabilities: [ backend, frontend, tests, sql, review, long-context ]
    last_evaluated: 2026-09-20
    evidence: "MoE de 320B com 18B ativos por inferencia, da Z.ai, publicado em 14/08/2026 e voltado a coding, trabalho agentic de terminal e tarefas de horizonte longo. E o unico modelo deste catalogo com numero de coding CONFERIDO POR TERCEIRO: o leaderboard oficial do DeepSWE carrega uma entrada `glm-5.3-flash` em 63%, que bate com os 63,4 auto-reportados pela Z.ai. Todos os outros aqui dependem do numero do proprio provedor. Fica `balanced` porque 63 no DeepSWE esta claramente abaixo do `deepseek-v4-1-flash` (74,2), mas a verificacao independente pesa na escolha entre dois balanced. Runner: opencode (`opencode-go/glm-5.3-flash`). [S20][S21]"

  alibaba-qwen-3-8-flash:
    provider: alibaba
    model: "qwen3.8-flash"
    profile: balanced
    profile_by_variant:
      default: balanced
      low: economical
      high: balanced
      max: balanced
    status: active
    effort_levels: [ low, medium, high ]
    capabilities: [ backend, frontend, tests, sql, review, vision, long-context ]
    last_evaluated: 2026-09-20
    evidence: "ATENCAO A IDENTIDADE. A pagina oficial do Qwen descreve `qwen3.8-flash` como o modelo multimodal mais recente da familia, a 0,15 dolar por milhao de tokens de entrada e 0,47 de saida. Os numeros de coding que circulam na imprensa (62,5 no SWE-bench Pro, MoE de 125B com 6B ativos) sao do **`Qwen3.8-Flash-Next`**, que e outro ID, com outra descricao. Creditar o numero de um ao outro seria exatamente a deriva que `unknown_model_identity` existe para barrar, entao esta entrada NAO tem numero publico verificavel proprio e fica `balanced` em todo esforco. Evidencia interna, que vale mais aqui do que benchmark de terceiro: em 2026-09-19 ele fez a re-revisao independente da task 4.4 neste repositorio, reexecutou a suite e o `php -l` por conta propria em vez de aceitar o relatado, citou arquivo e linha, listou o que conferiu e passou antes dos achados, e descartou corretamente um falso positivo de float em dinheiro que era codigo preexistente fora do caminho analisado. Devolveu `rejected` com tres achados que foram conferidos a mao e procedem. Runner: opencode (`opencode-go/qwen3.8-flash`). [S22]"

  meta-muse-spark-1-3-contributor:
    provider: meta
    model: "muse-spark-1.3-contributor"
    profile: balanced
    profile_by_variant:
      default: balanced
      low: balanced
      high: frontier
      max: frontier
    status: active
    effort_levels: [ minimal, low, medium, high, xhigh ]
    capabilities: [ backend, frontend, tests, sql, review, long-context ]
    data_policy: contributor_training
    last_evaluated: 2026-09-20
    evidence: "Os numeros sao fortes: Terminal-Bench 2.1 em 88,8, DeepSWE em 75,4 e AA Coding Index em 75,8, acima do Gemini 3.8 Flash (73,7 no DeepSWE) e na faixa do Opus 5 (74). Por isso `frontier` em high e max. Duas ressalvas. Primeira: a Meta anunciou os resultados de topo numa configuracao `max reasoning` que ainda NAO esta amplamente disponivel; o que se entrega e o `xhigh`, que sustenta 89,2 no Terminal-Bench 2.1, entao para coding o numero se mantem. Segunda: o benchlm registra cobertura parcial (31 de 446 benchmarks) e o classifica como sem score geral publico. Runner: opencode (`opencode-go/muse-spark-1.3-contributor`). [S23][S24][S25]"
    uso_restrito: "ENDPOINT CONTRIBUTOR: a Meta usa os prompts e as completions enviados para treinar produtos dela, e e essa troca que paga o desconto de cerca de 92% no token de entrada e 95% no de saida (0,10 e 0,20 dolar por milhao, contra 1,25 e 4,25 do padrao). Por isso este modelo so pode ser escolhido quando o conteudo que ele vai ler NAO for sensivel: landing page, texto de marketing, documentacao publica, codigo sem dado real. PROIBIDO em qualquer task que carregue dado financeiro, nome de pessoa fisica, credencial ou regra de negocio privada — e o revisor e o papel que mais le contexto, entao a proibicao pega com forca ali. Os arquivos de task deste projeto carregam renda, recebiveis e nomes de familiares: para eles, este modelo esta fora."

  anthropic-sonnet-4-6:
    provider: anthropic
    model: "claude-sonnet-4-6"
    profile: balanced
    profile_by_variant:
      default: balanced
      low: economical
      high: balanced
      max: balanced
    status: active
    capabilities: [ backend, frontend, tests, sql, review, vision, long-context ]
    last_evaluated: 2026-09-19
    evidence: "Acrescentado em 2026-09-19 porque a CLI `agy` expoe `claude-sonnet-4-6` num pool de creditos distinto do pool usado pelo Gemini, e o humano quer distribuir custo entre os dois. E geracao anterior ao Claude 5, que e a familia atual da Anthropic. Nesta avaliacao NAO localizei numero publico verificavel de benchmark de programacao especifico deste ID, entao a classificacao e conservadora: `balanced` em todo esforco, sem `frontier` em nenhum. Consequencia deliberada: nao serve de executor nem de revisor em R3, onde a rota exige frontier. Reavaliar se aparecer medicao confiavel. [sem fonte verificada]"

  anthropic-opus-4-6:
    provider: anthropic
    model: "claude-opus-4-6-thinking"
    profile: balanced
    profile_by_variant:
      default: balanced
      low: economical
      high: balanced
      max: balanced
    status: active
    capabilities: [ backend, frontend, tests, sql, review, vision, long-context ]
    last_evaluated: 2026-09-19
    evidence: "Acrescentado em 2026-09-19 pelo mesmo motivo do `anthropic-sonnet-4-6`: a CLI `agy` o expoe como `claude-opus-4-6-thinking`, em pool de credito separado. E geracao anterior ao Claude 5. Pela posicao de Opus na propria familia espera-se que supere o Sonnet 4.6 em trabalho agentic de codigo, mas NAO localizei nesta avaliacao numero publico verificavel especifico deste ID, e promover a `frontier` sem medicao seria creditar capacidade que nao foi comprovada — exatamente o que o campo `evidence` existe para impedir. Fica `balanced`, um degrau acima do Sonnet 4.6 apenas na ordem de preferencia dos slots, nao no perfil. [sem fonte verificada]"

  anthropic-haiku-4-5:
    provider: anthropic
    model: "claude-haiku-4-5-20251001"
    profile: economical
    profile_by_variant:
      default: economical
      low: economical
      high: balanced
      max: balanced
    status: active
    capabilities: [ backend, frontend, tests, sql, review, vision, long-context ]
    last_evaluated: 2026-08-27
    evidence: "A Anthropic documenta o ID datado `claude-haiku-4-5-20251001`; no lançamento, afirmou desempenho de coding semelhante ao Sonnet 4 a um terço do custo e mais de 2x a velocidade, enquanto a Augment reportou cerca de 90% do Sonnet 4.5 em sua avaliação agentic de código, sustentando `economical` por padrão e no máximo `balanced`. [S1][S4]"

  openai-gpt-5-6-luna:
    provider: openai
    model: "gpt-5.6-luna"
    profile: economical
    profile_by_variant:
      default: economical
      low: economical
      high: balanced
      max: balanced
    status: active
    effort_levels: [ minimal, low, medium, high, xhigh ]
    capabilities: [ backend, frontend, tests, sql, review, vision, long-context ]
    last_evaluated: 2026-08-27
    evidence: "A OpenAI define `gpt-5.6-luna` para workloads de alto volume sensíveis a custo; embora a tabela de coding reporte 74,6 no Artificial Analysis Coding Agent Index, 62,7% no SWE-Bench Pro, 67,2% no DeepSWE v1.1 e 84,7% no Terminal-Bench 2.1, seu posicionamento nano/cost-sensitive recomenda `economical` no padrão e teto `balanced`. [S5][S8]"

  meta-muse-spark-1-2-contributor:
    provider: meta
    model: "muse-spark-1.2-contributor"
    profile: balanced
    profile_by_variant:
      default: balanced
      low: economical
      high: balanced
      max: balanced
    status: preview
    effort_levels: [ minimal, low, medium, high, xhigh ]
    capabilities: [ backend, frontend, tests, sql, review, vision, long-context ]
    last_evaluated: 2026-08-27
    evidence: "A documentação da Meta confirma `muse-spark-1.2-contributor` na Meta Model API com contexto de 1M; o lançamento de 05/08/2026 descreve 1.2 como coding-focused, treinado para debugging, entendimento de codebase e trabalho de repositório inteiro e mostra Terminal-Bench 2.1/DeepSWE 1.1 apenas em gráficos sem números textuais verificáveis, por isso fica `balanced` e, conservadoramente, `preview` enquanto a Model API não tiver anúncio de GA localizado. [S12]"

  tencent-hy3:
    provider: tencent
    model: "hy3"
    profile: balanced
    profile_by_variant:
      default: balanced
      low: economical
      high: balanced
      max: balanced
    status: active
    effort_levels: [ low, medium, high ]
    capabilities: [ backend, frontend, tests, sql, review, long-context ]
    last_evaluated: 2026-08-27
    evidence: "A lista oficial da Tencent Cloud dá `hy3` como API Parameter e a Tencent posiciona Hy3 para Coding Agent e desenvolvimento, reportando mais de 90% de sucesso no teste interno WorkBuddy; como não localizei um score público padronizado de SWE-Bench/Terminal-Bench para Hy3, mantenho `balanced`. [S13]"

  xiaomi-mimo-v2-5:
    provider: xiaomi
    model: "mimo-v2.5"
    profile: balanced
    profile_by_variant:
      default: balanced
      low: economical
      high: balanced
      max: balanced
    status: active
    effort_levels: []
    capabilities: [ backend, frontend, tests, sql, review, vision, long-context ]
    last_evaluated: 2026-08-27
    evidence: "A API oficial da Xiaomi aceita exatamente `mimo-v2.5`, com percepção omni-modal e contexto de 1M; no experimento oficial do MiMo Code usando o mesmo modelo, a Xiaomi reportou 62% no SWE-Bench Pro e 73% no Terminal Bench 2, desempenho forte mas insuficiente para promover o modelo-base não-Pro a `frontier`. [S14]"

  meituan-longcat-2-0:
    provider: meituan
    model: "LongCat-2.0"
    profile: balanced
    profile_by_variant:
      default: balanced
      low: balanced
      high: balanced
      max: balanced
    status: active
    effort_levels: []
    capabilities: [ backend, frontend, tests, sql, review, long-context ]
    last_evaluated: 2026-08-27
    evidence: "A API LongCat usa exatamente `LongCat-2.0`; a avaliação oficial da Meituan reporta 70,8 no Terminal-Bench 2.1, 59,5 no SWE-bench Pro e 77,3 no SWE-bench Multilingual, bons resultados de engenharia mas abaixo dos modelos aqui classificados como `frontier`, portanto o teto permanece `balanced`. [S15]"

  alibaba-qwen-3-7-plus:
    provider: alibaba
    model: "qwen3.7-plus"
    profile: balanced
    profile_by_variant:
      default: balanced
      low: economical
      high: balanced
      max: balanced
    status: active
    effort_levels: [ low, medium, high ]
    capabilities: [ backend, frontend, tests, sql, review, vision, long-context ]
    last_evaluated: 2026-08-27
    evidence: "O Alibaba Model Studio documenta `qwen3.7-plus` com contexto de 1M, visão e capacidades agent-level para coding/tool use, mas chama Plus de opção cost-effective que equilibra desempenho e custo; não encontrei no material oficial consultado um score de coding específico do 3.7 Plus que justificasse R3, portanto fica `balanced`. [S16]"

  openai-gpt-oss-120b:
    provider: openai
    model: "gpt-oss-120b"
    profile: balanced
    profile_by_variant:
      default: balanced
      low: balanced
      high: balanced
      max: balanced
    status: active
    capabilities: [ backend, frontend, tests, sql, review, long-context ]
    last_evaluated: 2026-08-27
    evidence: "A página oficial identifica `gpt-oss-120b` como o maior modelo open-weight da OpenAI e a model card mostra que, em reasoning `high`, ele se aproxima do o4-mini em Codeforces e SWE-Bench Verified; como é um modelo de 2025, text-only e oficialmente suporta low/medium/high, trato o '(medium)' do catálogo como esforço e mantenho o modelo em `balanced`, sem presumir que 'Max' seja um nível nativo da OpenAI. [S17]"

  moonshot-kimi-k3:
    provider: moonshot
    model: "kimi-k3"
    profile: frontier
    profile_by_variant:
      default: frontier
      low: frontier
      high: frontier
      max: frontier
    status: active
    effort_levels: [ low, medium, high, max ]
    capabilities: [ backend, frontend, tests, sql, review, long-context ]
    last_evaluated: 2026-09-20
    evidence: "Terminal-Bench 2.1 em 88,3 e GPQA Diamond em 93,5, numeros do proprio fornecedor. O unico ponto medido por TERCEIRO nesta leva: AA-Briefcase da Artificial Analysis, Elo 1543 com aprovacao de 51% nas rubricas -- forte em entrega, mas os 51% mostram falha substancial. Cota curtissima no gateway (110), entao e material de ultima alternativa lateral. [hf: moonshotai/Kimi-K3] [artificialanalysis.ai/articles/kimi-k3-agentic-knowledge-benchmark]"
    uso_restrito: "A politica do Kimi OpenPlatform inclui TREINAMENTO e aperfeicoamento de modelos entre os usos das informacoes. Vale a mesma regra do endpoint contributor: fora de task com dado financeiro, nome de pessoa fisica, credencial ou regra de negocio privada. A proibicao pega com mais forca no revisor, que e quem mais le contexto."
  zhipu-glm-5-3:
    provider: zhipu
    model: "glm-5.3"
    profile: frontier
    profile_by_variant:
      default: frontier
      low: frontier
      high: frontier
      max: frontier
    status: active
    effort_levels: [ thinking ]
    capabilities: [ backend, frontend, tests, sql, review, long-context ]
    last_evaluated: 2026-09-20
    evidence: "Terminal-Bench 2.1 em 88,2 com Claude Code e limite de seis horas, DeepSWE v1.1 em 66,9 e CyberGym em 84,5. Numeros do fornecedor, atribuidos explicitamente ao GLM-5.3 completo -- nao ao 5.3-Flash. Cota de 220 no gateway. [hf: zai-org/GLM-5.3#benchmark]"
    uso_restrito: "So aceita o nivel `thinking`, que nao e um grau e sim um liga-desliga: o vocabulario de esforco do kit nao se traduz nele. O DPA da Z.ai declara processamento geralmente em Singapura."
  alibaba-qwen-3-8-max:
    provider: alibaba
    model: "qwen3.8-max"
    profile: frontier
    profile_by_variant:
      default: frontier
      low: frontier
      high: frontier
      max: frontier
    status: active
    effort_levels: [ low, medium, high ]
    capabilities: [ backend, frontend, tests, sql, review, long-context ]
    last_evaluated: 2026-09-20
    evidence: "Terminal-Bench 2.1 em 86,6, media de dez execucoes com limite de cinco horas, SWE-bench Pro em 67,7 e GPQA Diamond em 92,6. Numeros do fornecedor, e o proprio declara correcoes no conjunto SWE-bench Pro, o que limita comparacao com execucoes sobre o conjunto original. Cota de 160. [hf: Qwen/Qwen3.8-2.4T-A95B#benchmark-results]"
    uso_restrito: "O Model Studio declara nao usar os dados para treinamento, mas informa ARMAZENAR os dados gerados nas chamadas. Nao equivale a retencao zero."
  zhipu-glm-5-2:
    provider: zhipu
    model: "glm-5.2"
    profile: frontier
    profile_by_variant:
      default: frontier
      low: frontier
      high: frontier
      max: frontier
    status: active
    effort_levels: [ thinking ]
    capabilities: [ backend, frontend, tests, sql, review, long-context ]
    last_evaluated: 2026-09-20
    evidence: "SWE-bench Pro em 62,1 com OpenHands e contexto de 400K, Terminal-Bench 2.1 em 81,0 com Terminus-2, GPQA Diamond em 91,2. Numeros do fornecedor. Cota de 880, a maior entre os frontier fora do deepseek. [hf: zai-org/GLM-5.2#benchmark]"
    uso_restrito: "So aceita `thinking`. DPA da Z.ai declara processamento geralmente em Singapura."
  xai-grok-4-6:
    provider: xai
    model: "grok-4.6"
    profile: frontier
    profile_by_variant:
      default: frontier
      low: frontier
      high: frontier
      max: frontier
    status: active
    effort_levels: [ minimal, low, medium, high, xhigh ]
    capabilities: [ backend, frontend, tests, sql, review, long-context ]
    last_evaluated: 2026-09-20
    evidence: "CursorBench v3.2 em 69,9, proximo dos 70,5 do topo da mesma tabela, DeepSWE v1.1 em 65,9 e Terminal-Bench 3.0 em 26. Numeros do fornecedor. O 26 no Terminal-Bench 3.0 destoa dos demais e merece cautela antes de tratar como frontier de uso geral. Cota de 169. [x.ai/news/grok-4-6]"
  alibaba-qwen-3-7-max:
    provider: alibaba
    model: "qwen3.7-max"
    profile: balanced
    profile_by_variant:
      default: balanced
      low: balanced
      high: balanced
      max: balanced
    status: active
    effort_levels: [ low, medium, high ]
    capabilities: [ backend, frontend, tests, sql, review, long-context ]
    last_evaluated: 2026-09-20
    evidence: "SWE-bench Verified em 80,4, SWE-bench Pro em 60,6 e Terminal-Bench 2.0 em 69,7 com Terminus. Numeros do fornecedor. Perfil nao foi deduzido do nome `Max`. Cota de 170. [github: AlibabaCloud-Official/Qwen3.7-max-readme]"
    uso_restrito: "Model Studio informa armazenar os dados das chamadas, apesar do compromisso de nao usa-los para treinamento."
  moonshot-kimi-k2-6:
    provider: moonshot
    model: "kimi-k2.6"
    profile: balanced
    profile_by_variant:
      default: balanced
      low: balanced
      high: balanced
      max: balanced
    status: active
    effort_levels: [ low, medium, high, max ]
    capabilities: [ backend, frontend, tests, sql, review, long-context ]
    last_evaluated: 2026-09-20
    evidence: "SWE-bench Verified em 80,2, SWE-bench Pro em 58,6 e Terminal-Bench 2.0 em 66,7 com Terminus-2. Numeros do fornecedor, com estrutura interna adaptada do SWE-agent. Cota de 1.150. [hf: moonshotai/Kimi-K2.6]"
    uso_restrito: "A garantia de nao-treinamento encontrada refere-se a Kimi API. Nao estender automaticamente ao Kimi Code nem a intermediarios."
  xiaomi-mimo-v2-5-pro:
    provider: xiaomi
    model: "mimo-v2.5-pro"
    profile: balanced
    profile_by_variant:
      default: balanced
      low: balanced
      high: balanced
      max: balanced
    status: active
    effort_levels: []
    capabilities: [ backend, frontend, tests, sql, review, long-context ]
    last_evaluated: 2026-09-20
    evidence: "SWE-bench Verified em 78,9, SWE-bench Pro em 57,2 e Terminal-Bench 2.0 em 68,4. Numeros do fornecedor, transcritos por contribuicao automatizada da comunidade -- o que nao constitui reproducao independente. Cota de 3.250. [hf: XiaomiMiMo/MiMo-V2.5-Pro]"
    uso_restrito: "Politica do endpoint contratado nao verificada. Uso com dado sensivel segue sem validacao."
  tencent-hy4-preview:
    provider: tencent
    model: "hy4-preview"
    profile: balanced
    profile_by_variant:
      default: balanced
      low: balanced
      high: balanced
      max: balanced
    status: preview
    effort_levels: []
    capabilities: [ backend, frontend, tests, sql, review, long-context ]
    last_evaluated: 2026-09-20
    evidence: "SWE-bench Pro em 65,7, SWE-bench Multilingual em 82,9 e GPQA Diamond em 92,3. Numeros do fornecedor. Cota de 1.350. [hf: tencent/Hy4-preview]"
    uso_restrito: "PREVIEW, e a propria Tencent admite limitacoes conhecidas: raciocinio excessivamente demorado e verificacoes repetidas. Fora de papel de gate -- o que e preview muda sem aviso, e um pool herda a instabilidade inteira."
  minimax-m3:
    provider: minimax
    model: "minimax-m3"
    profile: balanced
    profile_by_variant:
      default: balanced
      low: balanced
      high: balanced
      max: balanced
    status: active
    effort_levels: [ thinking ]
    capabilities: [ backend, frontend, tests, sql, review, long-context ]
    last_evaluated: 2026-09-20
    evidence: "SWE-bench Pro em 59,0, Terminal-Bench 2.1 em 66,0, SWE-fficiency em 34,8 e MCP Atlas em 74,2. Numeros do fornecedor. Cota de 3.200. [minimax.io/blog/minimax-m3]"
    uso_restrito: "So aceita `thinking`. A politica do Code/App/Web permite retencao enquanto necessaria; a API tem termos proprios nao verificados."
  moonshot-kimi-k2-7-code:
    provider: moonshot
    model: "kimi-k2.7-code"
    profile: balanced
    profile_by_variant:
      default: balanced
      low: balanced
      high: balanced
      max: balanced
    status: active
    effort_levels: [ low, medium, high, max ]
    capabilities: [ backend, frontend, tests, sql, review, long-context ]
    last_evaluated: 2026-09-20
    evidence: "Program Bench em 53,6, MCP Atlas em 76,0, MCP Mark Verified em 81,1. Numeros do fornecedor, com thinking ativado, Kimi Code CLI e contexto de 262.144. Program Bench mede implementacao a partir de comportamento observavel e testes funcionais. Cota de 1.350. [hf: moonshotai/Kimi-K2.7-Code]"
    uso_restrito: "A garantia de nao-treinamento refere-se a Kimi API, nao ao Kimi Code nem a intermediarios."
  zhipu-glm-5-1:
    provider: zhipu
    model: "glm-5.1"
    profile: balanced
    profile_by_variant:
      default: balanced
      low: balanced
      high: balanced
      max: balanced
    status: active
    effort_levels: [ thinking ]
    capabilities: [ backend, frontend, tests, sql, review, long-context ]
    last_evaluated: 2026-09-20
    evidence: "SWE-bench Pro em 58,4, Terminal-Bench 2.0 em 63,5 com Terminus-2 e GPQA Diamond em 86,2. Numeros do fornecedor. Cota de 880. [hf: zai-org/GLM-5.1#benchmark]"
    uso_restrito: "So aceita `thinking`. DPA da Z.ai declara processamento geralmente em Singapura."
  alibaba-qwen-3-6-plus:
    provider: alibaba
    model: "qwen3.6-plus"
    profile: balanced
    profile_by_variant:
      default: balanced
      low: balanced
      high: balanced
      max: balanced
    status: active
    effort_levels: [ low, medium, high ]
    capabilities: [ backend, frontend, tests, sql, review, long-context ]
    last_evaluated: 2026-09-20
    evidence: "SWE-bench Verified em 58 e GPQA Diamond em 88. UNICO desta leva com numero de avaliador TERCEIRO: valores publicados pela Epoch AI, sobre as 484 tarefas do conjunto. Vale mais que auto-publicacao, ainda que os numeros sejam modestos. Cota de 3.300. [epoch.ai/models/qwen-3-6-plus]"
    uso_restrito: "Model Studio informa armazenar os dados das chamadas."
  minimax-m2-7:
    provider: minimax
    model: "minimax-m2.7"
    profile: balanced
    profile_by_variant:
      default: balanced
      low: balanced
      high: balanced
      max: balanced
    status: active
    effort_levels: [ thinking ]
    capabilities: [ backend, frontend, tests, sql, review, long-context ]
    last_evaluated: 2026-09-20
    evidence: "SWE-Pro em 56,22, VIBE-Pro em 55,6 e Terminal Bench 2 em 57,0. Numeros do fornecedor. Cota de 3.400, a maior entre os pesquisados desta faixa. [minimax.io/news/minimax-m27-en]"
    uso_restrito: "So aceita `thinking`."
  minimax-m2-5:
    provider: minimax
    model: "minimax-m2.5"
    profile: economical
    profile_by_variant:
      default: economical
      low: economical
      high: economical
      max: economical
    status: active
    effort_levels: [ thinking ]
    capabilities: [ backend, frontend, tests, sql, review, long-context ]
    last_evaluated: 2026-09-20
    evidence: "SWE-bench Verified em 80,2, Multi-SWE-Bench em 51,3 e GPQA Diamond em 85,2, com Claude Code de prompt alterado e media de quatro execucoes, declarado pelo fornecedor. Perfil `economical` vem do PRECO documentado -- 0,30 e 1,20 dolar por milhao -- e nao de fraqueza medida. [hf: MiniMaxAI/MiniMax-M2.5]"
    uso_restrito: "So aceita `thinking`. PENDENTE: a pagina oficial da politica de privacidade da API nao retornou texto legivel na avaliacao, entao retencao e uso dos prompts seguem sem validacao."

  # --- Pools do 9router (combos) ------------------------------------------
  9r-executor-frontier:
    provider: deepseek
    model: "9r-executor-frontier"
    profile: frontier
    profile_by_variant:
      default: frontier
      low: frontier
      high: frontier
      max: frontier
    status: active
    effort_levels: [ high, max ]
    capabilities: [ backend, frontend, tests, sql, review, long-context ]
    last_evaluated: 2026-09-20
    evidence: "Pool do 9router. Membro: ocg/deepseek-flash, `frontier` em todas as variantes e o unico frontier de cota farta no gateway (26.000). O perfil declarado e o do membro MAIS FRACO do pool, e as capacidades sao a INTERSECCAO -- e a unica coisa verdadeira sobre qualquer resposta que vier de la. Hoje o pool tem um membro so, entao perfil e provedor sao exatos; ao acrescentar membro, os dois precisam ser revistos. O `provider` importa porque a regra de cross-provider de R3 compara provedores: os pools de papeis diferentes precisam ter conjuntos de provedor DISJUNTOS, e quem garante isso e quem monta os pools -- o validador confere nomes, nao composicao. Valido enquanto o gateway estiver em Auto: pinado num nivel, ele sobrescreve o esforco pedido e o effort_levels vira ficcao."
  9r-executor:
    provider: meituan
    model: "9r-executor"
    profile: balanced
    profile_by_variant:
      default: balanced
      low: balanced
      high: balanced
      max: balanced
    status: active
    effort_levels: []
    capabilities: [ backend, frontend, tests, sql, review, long-context ]
    last_evaluated: 2026-09-20
    evidence: "Pool do 9router. Membro: ocg/longcat-2.0, `balanced` com 11.400 de cota. Sem controle de raciocinio, entao nenhum esforco e enviado. O perfil declarado e o do membro MAIS FRACO do pool, e as capacidades sao a INTERSECCAO -- e a unica coisa verdadeira sobre qualquer resposta que vier de la. Hoje o pool tem um membro so, entao perfil e provedor sao exatos; ao acrescentar membro, os dois precisam ser revistos. O `provider` importa porque a regra de cross-provider de R3 compara provedores: os pools de papeis diferentes precisam ter conjuntos de provedor DISJUNTOS, e quem garante isso e quem monta os pools -- o validador confere nomes, nao composicao. Valido enquanto o gateway estiver em Auto: pinado num nivel, ele sobrescreve o esforco pedido e o effort_levels vira ficcao."
  9r-tester:
    provider: xiaomi
    model: "9r-tester"
    profile: balanced
    profile_by_variant:
      default: balanced
      low: balanced
      high: balanced
      max: balanced
    status: active
    effort_levels: []
    capabilities: [ backend, frontend, tests, sql, review, long-context ]
    last_evaluated: 2026-09-20
    evidence: "Pool do 9router. Membro: ocg/mimo-v2.5, `balanced` e a maior cota da faixa (30.100) -- o tester roda a cada tentativa, entao cota e o criterio que mais pesa nele. Sem controle de raciocinio. O perfil declarado e o do membro MAIS FRACO do pool, e as capacidades sao a INTERSECCAO -- e a unica coisa verdadeira sobre qualquer resposta que vier de la. Hoje o pool tem um membro so, entao perfil e provedor sao exatos; ao acrescentar membro, os dois precisam ser revistos. O `provider` importa porque a regra de cross-provider de R3 compara provedores: os pools de papeis diferentes precisam ter conjuntos de provedor DISJUNTOS, e quem garante isso e quem monta os pools -- o validador confere nomes, nao composicao. Valido enquanto o gateway estiver em Auto: pinado num nivel, ele sobrescreve o esforco pedido e o effort_levels vira ficcao."
  9r-reviewer:
    provider: alibaba
    model: "9r-reviewer"
    profile: balanced
    profile_by_variant:
      default: balanced
      low: balanced
      high: balanced
      max: balanced
    status: active
    effort_levels: [ low, medium, high ]
    capabilities: [ backend, frontend, tests, sql, review, long-context ]
    last_evaluated: 2026-09-20
    evidence: "Pool do 9router. Membro: ocg/qwen3.8-flash. Escolhido por EVIDENCIA OBSERVADA, nao por benchmark: em 2026-09-19 ele fez a re-revisao independente da task 4.4 neste repositorio, reexecutou a suite e o `php -l` por conta propria em vez de aceitar o relatado, citou arquivo e linha, e descartou corretamente um falso positivo de float em dinheiro. Nenhum benchmark publico mede qualidade de revisao, entao isto vale mais. E `balanced`: nao fecha gate de R3. O perfil declarado e o do membro MAIS FRACO do pool, e as capacidades sao a INTERSECCAO -- e a unica coisa verdadeira sobre qualquer resposta que vier de la. Hoje o pool tem um membro so, entao perfil e provedor sao exatos; ao acrescentar membro, os dois precisam ser revistos. O `provider` importa porque a regra de cross-provider de R3 compara provedores: os pools de papeis diferentes precisam ter conjuntos de provedor DISJUNTOS, e quem garante isso e quem monta os pools -- o validador confere nomes, nao composicao. Valido enquanto o gateway estiver em Auto: pinado num nivel, ele sobrescreve o esforco pedido e o effort_levels vira ficcao."
  9r-reviewer-frontier:
    provider: meta
    model: "9r-reviewer-frontier"
    profile: balanced
    profile_by_variant:
      default: balanced
      low: balanced
      high: frontier
      max: frontier
    status: active
    effort_levels: [ minimal, low, medium, high, xhigh ]
    capabilities: [ backend, frontend, tests, sql, review, long-context ]
    last_evaluated: 2026-09-20
    evidence: "Pool do 9router para o gate frontier de R3. Membro: ocg/muse-spark-1.3-contributor, que alcanca `frontier` em high/max e tem a maior cota do gateway (45.300). O `max` do kit e traduzido para `xhigh` pelo runner opencode-muse, porque xhigh e o topo desta familia. O perfil declarado e o do membro MAIS FRACO do pool, e as capacidades sao a INTERSECCAO -- e a unica coisa verdadeira sobre qualquer resposta que vier de la. Hoje o pool tem um membro so, entao perfil e provedor sao exatos; ao acrescentar membro, os dois precisam ser revistos. O `provider` importa porque a regra de cross-provider de R3 compara provedores: os pools de papeis diferentes precisam ter conjuntos de provedor DISJUNTOS, e quem garante isso e quem monta os pools -- o validador confere nomes, nao composicao. Valido enquanto o gateway estiver em Auto: pinado num nivel, ele sobrescreve o esforco pedido e o effort_levels vira ficcao."
    uso_restrito: "ENDPOINT CONTRIBUTOR: treina com os prompts e as completions enviados, e e essa troca que paga o desconto. So pode ser escolhido quando o conteudo que ele vai ler NAO for sensivel. PROIBIDO em task que carregue dado financeiro, nome de pessoa fisica, credencial ou regra de negocio privada -- e o revisor e o papel que mais le contexto, entao a proibicao pega com mais forca justamente aqui. Por isso ele e um pool SEPARADO e nao o default: um default que vaza a menos que alguem lembre de sobrescrever nao dá erro, da exposicao silenciosa. O projeto que quiser usa-lo declara de proposito no proprio arquivo."
```
