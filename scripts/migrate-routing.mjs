#!/usr/bin/env node

// Leva um model-routing.yaml de projeto para a schema 3.
//
// As schemas anteriores traziam um catalogo de modelos com perfil, capacidade e
// provedor, e rotas que escolhiam modelo slot a slot. A schema 3 nao tem nada
// disso: o roteamento e por combo do gateway, e quem escolhe o modelo e o
// gateway. Nao existe conversao automatica de 43 modelos para 6 combos, porque
// os combos sao montados fora do kit -- entao esta migracao nao tenta adivinhar.
//
// O que ela faz e o unico caminho honesto: parte do catalogo do kit, que ja esta
// na schema 3, e enxerta de volta o que pertence ao projeto e a maquina. O que
// era escolha de modelo e descartado com aviso, porque virou escolha de combo e
// so o humano sabe qual.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const CATALOGO_DO_KIT = path.join(aqui, '..', 'src', '.ai', 'model-routing.yaml');

// Espelha sync-routing: estas secoes sao do projeto ou da maquina e atravessam a
// migracao intactas. `cli_runners` e mistura -- o kit atualiza o que conhece e o
// runner local do projeto continua existindo.
const DO_PROJETO = ['project_policy', 'terminal_runners'];

// Saiu da schema 3: as duas dependiam de dado de modelo que o catalogo nao tem
// mais. Sao descartadas em voz alta, nunca em silencio.
const CHAVES_APOSENTADAS = ['r3_cross_provider', 'unknown_model_identity'];

function usage() {
  return `Usage:
  migrate-routing.mjs <routing-path> [--write] [--from <kit-routing>]
  l-nexus migrate-routing <routing-path> [--write]

Leva o roteamento do projeto para a schema 3, preservando o que e dele:
${DO_PROJETO.join(', ')} e risk_domains.project. Sem --write, so relata.`;
}

function parseArguments(argv) {
  const args = [...argv];
  if (args[0] === 'migrate-routing') args.shift();
  const options = { write: false, from: CATALOGO_DO_KIT, routingPath: undefined, help: false };
  while (args.length > 0) {
    const value = args.shift();
    if (value === '--help' || value === '-h') options.help = true;
    else if (value === '--write') options.write = true;
    else if (value === '--from') {
      options.from = args.shift();
      if (!options.from) throw new Error('--from: requires a path');
    } else if (value.startsWith('--')) throw new Error(`unknown option: ${value}`);
    else if (options.routingPath === undefined) options.routingPath = value;
    else throw new Error(`unexpected argument: ${value}`);
  }
  if (!options.help && options.routingPath === undefined) throw new Error('cli.routingPath: is required');
  return options;
}

function ehMapa(node) {
  return node !== undefined && node !== null && typeof node.get === 'function';
}

export function migrateRoutingContents(projetoTexto, kitTexto) {
  const projeto = parseDocument(projetoTexto);
  const kit = parseDocument(kitTexto);
  const antes = projeto.toJS() ?? {};
  const linhas = [];

  if (antes.schema_version === 3) {
    return { changed: false, text: projetoTexto, summary: ['ja esta na schema 3'] };
  }

  // Enxerta as secoes do projeto no catalogo do kit. O par inteiro viaja, com a
  // chave e os comentarios: a justificativa de uma politica vale tanto quanto a
  // politica, e sem ela o proximo a mexer reescreve a regra sem saber por que
  // ela existia.
  for (const chave of DO_PROJETO) {
    const par = projeto.contents?.items?.find((item) => String(item.key) === chave);
    if (par === undefined) { linhas.push(`${chave}: nao existia no projeto; fica o padrao do kit`); continue; }
    const itens = kit.contents?.items;
    const indice = itens.findIndex((item) => String(item.key) === chave);
    if (indice === -1) itens.push(par); else itens[indice] = par;
    linhas.push(`${chave}: preservado do projeto`);
  }

  for (const chave of CHAVES_APOSENTADAS) {
    if (kit.getIn(['project_policy', chave]) !== undefined) {
      kit.deleteIn(['project_policy', chave]);
      linhas.push(`project_policy.${chave}: descartado; dependia de dado de modelo que a schema 3 nao tem`);
    }
  }

  const dominiosDoProjeto = projeto.getIn(['risk_domains', 'project'], true);
  if (dominiosDoProjeto !== undefined) {
    kit.setIn(['risk_domains', 'project'], dominiosDoProjeto);
    linhas.push('risk_domains.project: preservado do projeto');
  }

  // `cli_runners` e do kit. Isto ja carregou runner local para dentro da
  // migracao, para nao tirar da maquina a unica CLI que falava com um modelo --
  // regra da schema 2, quando cada modelo tinha o seu runner. Na schema 3 quem
  // fala com o gateway e o runner que o kit publica, e carregar o resto so
  // adiaria a poda ate o proximo sync. O que sai daqui e dito em voz alta.
  const runnersDoProjeto = projeto.get('cli_runners', true);
  if (ehMapa(runnersDoProjeto)) {
    const descartados = (runnersDoProjeto.items ?? [])
      .map((item) => String(item.key))
      .filter((nome) => kit.getIn(['cli_runners', nome]) === undefined);
    if (descartados.length > 0) {
      linhas.push(`cli_runners: ${descartados.join(', ')} descartado(s); o kit publica os runners`);
    }
  }

  const modelos = Object.keys(antes.models ?? {}).length;
  if (modelos > 0) {
    linhas.push(`models: ${modelos} entradas descartadas; a schema 3 roteia por combo, nao por modelo`);
  }
  if (antes.work_routes !== undefined) {
    linhas.push('work_routes: descartado; revise `roles` e `combos` e aponte cada papel ao combo certo');
  }

  return { changed: true, text: kit.toString({ lineWidth: 0 }), summary: linhas };
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) { console.log(usage()); return; }
    const resultado = migrateRoutingContents(
      readFileSync(options.routingPath, 'utf8'),
      readFileSync(options.from, 'utf8'),
    );
    if (!resultado.changed) {
      console.log(`${options.routingPath} ${resultado.summary[0]}.`);
      return;
    }
    console.log(options.write ? 'Migrado para a schema 3:' : 'Migraria (dry-run):');
    for (const linha of resultado.summary) console.log(`  ${linha}`);
    if (options.write) {
      writeFileSync(options.routingPath, resultado.text, 'utf8');
      console.log(`Escrito em ${options.routingPath}.`);
    } else {
      console.log('Nada foi escrito. Use --write para aplicar.');
    }
  } catch (error) {
    console.error(`migrate-routing: ${error.message}`);
    console.error(usage());
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
