#!/usr/bin/env node

// Propaga o catalogo do kit para o .ai/model-routing.yaml de um projeto.
//
// O arquivo de roteamento pertence ao projeto e por isso nunca e sobrescrito:
// o install so copia quando ele nao existe, e o migrate-routing migra schema,
// nao conteudo. O efeito colateral e que nada propaga catalogo. Ja aconteceu de
// um projeto ficar sete modelos a frente do kit, e a sincronizacao ser feita a
// mao, arquivo contra arquivo.
//
// A raiz do problema e que o arquivo mistura quatro coisas com donos
// diferentes. `models` e do mundo: modelo novo sai, modelo velho e aposentado.
// `work_routes`, `profiles`, `routes` e `execution_policy` sao do kit. Ja
// `project_policy` e `risk_domains.project` sao decisao do projeto, e
// `cli_runners`, `terminal_runners` e `runner_policy` descrevem a MAQUINA --
// que CLI esta instalada, qual terminal existe, de quem e a conta que paga.
//
// Para proteger essas duas ultimas categorias, congelou-se o arquivo inteiro.
// Este comando troca as duas primeiras e nao encosta nas outras duas.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const SHIPPED_ROUTING = path.join(scriptDirectory, '..', 'src', '.ai', 'model-routing.yaml');

// O que vem do kit e do mundo. Trocado inteiro, com os comentarios do kit junto:
// a justificativa de uma rota vale tanto quanto a rota.
// `combos`, `roles` e `default_runner` sao do kit e sobrescrevem o projeto: o
// esforco de cada combo e decisao unica, tomada no kit e propagada por versao.
// Editar no projeto seria criar divergencia silenciosa entre os dois.
export const SYNCED = ['schema_version', 'routes', 'execution_policy', 'combos', 'roles', 'default_runner'];

// O que e do projeto e da maquina. Nunca tocado.
export const PRESERVED = ['project_policy', 'runner_policy', 'terminal_runners'];

// cli_runners nao cabe em nenhuma das duas categorias, e tratar como uma delas
// quebra de um jeito ou de outro. QUAIS binarios existem e da maquina; o argv, o
// prompt_delivery e o mapping de esforco sao conhecimento do KIT. Preservar
// inteiro deixou um projeto real com rotas apontando para pools sem os runners
// que elas precisam, e mantendo uma declaracao de esforco que o kit ja tinha
// corrigido por ser falsa. Sobrescrever inteiro apagaria runner local.
//
// Entao: entrada que o kit conhece e atualizada, entrada que so o projeto tem
// fica intacta. Nada se perde e a correcao chega.
export const MERGED = ['cli_runners'];

// risk_domains tem os dois donos na mesma secao: a lista generica e do kit, a
// do projeto e do projeto. E a unica que precisa ser costurada chave a chave.
const RISK_DOMAINS_FROM_KIT = ['generic_r3'];

function usage() {
  return `Usage:
  sync-routing.mjs [<routing-path>] [--write] [--from <kit-routing-path>]
  l-nexus sync-routing [<routing-path>] [--write]

Propaga catalogo e rotas do kit para o roteamento de um projeto.

Sincroniza : ${SYNCED.join(', ')}, risk_domains.${RISK_DOMAINS_FROM_KIT.join('/')}
Mescla     : ${MERGED.join(', ')} -- entrada do kit atualiza, entrada local fica
Preserva   : ${PRESERVED.join(', ')}, risk_domains.project

O padrao e dry-run: mostra o que mudaria e nao escreve nada. Use --write para
aplicar. O caminho padrao e .ai/model-routing.yaml.`;
}

function parseArguments(argv) {
  const args = [...argv];
  if (args[0] === 'sync-routing') args.shift();
  if (args.includes('--help') || args.includes('-h')) return { help: true };

  const options = { routingPath: null, from: SHIPPED_ROUTING, write: false };
  while (args.length > 0) {
    const value = args.shift();
    if (value === '--write') {
      options.write = true;
    } else if (value === '--from') {
      const next = args.shift();
      if (!next) throw new Error('--from requires a path');
      options.from = next;
    } else if (value.startsWith('-')) {
      throw new Error(`unknown option ${value}`);
    } else if (options.routingPath) {
      throw new Error('expected exactly one routing path');
    } else {
      options.routingPath = value;
    }
  }
  options.routingPath ??= path.join('.ai', 'model-routing.yaml');
  return options;
}

function readDocument(filePath, label) {
  let text;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch {
    throw new Error(`${label} not found: ${filePath}`);
  }
  const document = parseDocument(text, { prettyErrors: false });
  if (document.errors.length > 0) {
    throw new Error(`${filePath}: invalid YAML: ${document.errors.map((e) => e.message).join('; ')}`);
  }
  return document;
}

function same(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

// Diferenca por chave, que e como um catalogo muda de verdade: entra modelo,
// sai modelo, muda um campo de um modelo. Um diff de linhas diria a mesma coisa
// em setecentas linhas.
function diffMapping(before, after) {
  const chaves = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const entrou = [];
  const saiu = [];
  const mudou = [];
  for (const chave of [...chaves].sort()) {
    const antes = (before ?? {})[chave];
    const depois = (after ?? {})[chave];
    if (antes === undefined) entrou.push(chave);
    else if (depois === undefined) saiu.push(chave);
    else if (!same(antes, depois)) mudou.push(chave);
  }
  return { entrou, saiu, mudou };
}

function describeMapping(nome, before, after, linhas) {
  const { entrou, saiu, mudou } = diffMapping(before, after);
  if (entrou.length === 0 && saiu.length === 0 && mudou.length === 0) return false;
  linhas.push(`${nome}:`);
  if (entrou.length > 0) linhas.push(`  + ${entrou.join(', ')}`);
  if (saiu.length > 0) linhas.push(`  - ${saiu.join(', ')}`);
  if (mudou.length > 0) linhas.push(`  ~ ${mudou.join(', ')}`);
  return true;
}

// Troca o PAR inteiro, chave e valor, e nao so o valor. O comentario que
// justifica uma secao fica preso a chave: com `set` do valor, a regra chegava ao
// projeto e o motivo dela ficava para tras. A justificativa de uma rota vale
// tanto quanto a rota -- sem ela, o proximo a mexer reescreve a regra sem saber
// por que ela existia.
function replacePair(destino, origem, chave) {
  const par = origem.contents?.items?.find((item) => String(item.key) === chave);
  if (!par) return;
  const itens = destino.contents?.items;
  if (!itens) return;
  const indice = itens.findIndex((item) => String(item.key) === chave);
  if (indice === -1) itens.push(par);
  else itens[indice] = par;
}

// Semear uma secao que falta nao pode jogar ela no fim do arquivo: o
// `model-routing.yaml` e lido por humano, e a ordem das secoes e parte do que o
// torna legivel. Entra na mesma vizinhanca que ocupa no kit -- logo depois da
// ultima secao anterior a ela que o projeto tambem tem.
function insertPairWhereTheKitKeepsIt(destino, origem, chave) {
  const par = origem.contents?.items?.find((item) => String(item.key) === chave);
  const itens = destino.contents?.items;
  if (!par || !itens) return false;
  const ordemDoKit = (origem.contents?.items ?? []).map((item) => String(item.key));
  const anteriores = ordemDoKit.slice(0, ordemDoKit.indexOf(chave)).reverse();
  for (const anterior of anteriores) {
    const indice = itens.findIndex((item) => String(item.key) === anterior);
    if (indice !== -1) { itens.splice(indice + 1, 0, par); return true; }
  }
  itens.unshift(par);
  return true;
}

export function syncRouting({ routingPath, from = SHIPPED_ROUTING }) {
  const kit = readDocument(from, 'kit routing');
  const projeto = readDocument(routingPath, 'project routing');

  const antes = projeto.toJS() ?? {};
  const kitValores = kit.toJS() ?? {};

  // Migrar schema e outro trabalho, com outras regras. Sincronizar conteudo por
  // cima de um schema que nao o comporta produziria um arquivo que nao valida.
  if (antes.schema_version !== undefined && antes.schema_version !== kitValores.schema_version) {
    throw new Error(
      `${routingPath}: schema_version ${antes.schema_version} nao bate com o do kit (${kitValores.schema_version}); `
      + 'rode `l-nexus migrate-routing` antes de sincronizar',
    );
  }

  for (const chave of SYNCED) {
    replacePair(projeto, kit, chave);
  }

  for (const chave of MERGED) {
    const doKit = kit.get(chave, true);
    if (doKit === undefined) continue;
    if (!projeto.has(chave)) { replacePair(projeto, kit, chave); continue; }
    for (const item of doKit.items ?? []) {
      projeto.setIn([chave, String(item.key)], item.value);
    }
  }

  // PRESERVED protege o que o projeto decidiu; nao pode significar tambem "nao
  // cria o que falta". Projeto instalado antes de o campo existir ficava sem ele
  // PARA SEMPRE, e calado: o resumo so lista como preservado aquilo que ja
  // estava la, entao a ausencia era invisivel dos dois lados. O caso caro e
  // `runner_policy` -- sem ela os runners pagos ficam LIGADOS por omissao, o
  // oposto exato do padrao que o kit escolheu. Semear nao briga com preservar:
  // preservar so tem sentido quando ha o que preservar.
  const semeadas = [];
  for (const chave of PRESERVED) {
    if (projeto.has(chave)) continue;
    if (kit.get(chave, true) === undefined) continue;
    if (insertPairWhereTheKitKeepsIt(projeto, kit, chave)) semeadas.push(chave);
  }

  // risk_domains: so as listas do kit, preservando o que o projeto acrescentou.
  const kitRisk = kit.get('risk_domains', true);
  if (kitRisk) {
    if (!projeto.has('risk_domains')) {
      projeto.set('risk_domains', kitRisk);
    } else {
      for (const chave of RISK_DOMAINS_FROM_KIT) {
        const node = kit.getIn(['risk_domains', chave], true);
        if (node !== undefined) projeto.setIn(['risk_domains', chave], node);
      }
    }
  }

  const depois = projeto.toJS() ?? {};
  const linhas = [];
  describeMapping('combos', antes.combos, depois.combos, linhas);
  describeMapping('roles', antes.roles, depois.roles, linhas);
  for (const chave of ['schema_version', 'routes', 'execution_policy', 'default_runner']) {
    if (!same(antes[chave], depois[chave])) linhas.push(`${chave}: atualizado`);
  }
  if (!same(antes.risk_domains?.generic_r3, depois.risk_domains?.generic_r3)) {
    linhas.push('risk_domains.generic_r3: atualizado');
  }

  for (const chave of MERGED) {
    describeMapping(`${chave} (mesclado)`, antes[chave], depois[chave], linhas);
  }

  for (const chave of semeadas) linhas.push(`${chave}: semeado (o projeto nao tinha a secao)`);

  const preservadas = PRESERVED.filter((chave) => antes[chave] !== undefined);
  // Uma secao que o projeto tem e o kit desconhece nao e erro: pode ser
  // configuracao local legitima. Ela fica onde esta, e e dita em voz alta para
  // ninguem descobrir depois que o comando passou por cima de algo.
  const desconhecidas = Object.keys(antes).filter(
    (chave) => !SYNCED.includes(chave) && !PRESERVED.includes(chave)
      && !MERGED.includes(chave) && chave !== 'risk_domains',
  );

  return {
    text: projeto.toString({ lineWidth: 0 }),
    changed: linhas.length > 0,
    summary: linhas,
    seeded: semeadas,
    preserved: preservadas,
    unknown: desconhecidas,
  };
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return;
    }
    const resultado = syncRouting(options);

    if (!resultado.changed) {
      console.log(`${options.routingPath} ja esta sincronizado com o kit.`);
    } else {
      console.log(options.write ? 'Sincronizado:' : 'Mudaria (dry-run):');
      for (const linha of resultado.summary) console.log(`  ${linha}`);
    }
    if (resultado.seeded.length > 0) {
      console.log(`Semeado: ${resultado.seeded.join(', ')}`);
    }
    if (resultado.preserved.length > 0) {
      console.log(`Preservado: ${resultado.preserved.join(', ')}, risk_domains.project`);
    }
    for (const chave of resultado.unknown) {
      console.log(`Secao local mantida intacta: ${chave}`);
    }

    if (!resultado.changed) return;
    if (options.write) {
      writeFileSync(options.routingPath, resultado.text, 'utf8');
      console.log(`Escrito em ${options.routingPath}.`);
    } else {
      console.log('Nada foi escrito. Use --write para aplicar.');
    }
  } catch (error) {
    console.error(`sync-routing: ${error.message}`);
    console.error(usage());
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
