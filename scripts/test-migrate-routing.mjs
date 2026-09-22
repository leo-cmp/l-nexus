// A suite anterior media a migracao de schema 1 para 2, que acrescentava campos
// ao catalogo do projeto preservando o catalogo dele. A schema 3 nao tem
// catalogo, entao aquela migracao deixou de existir e os testes dela com ela:
// o que se mede agora e um enxerto, nao um acrescimo.
//
// A propriedade central e a mesma de antes, e e o que estes testes prendem: uma
// migracao pode jogar fora o que o kit decide, nunca o que o projeto decidiu.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';
import { migrateRoutingContents } from './migrate-routing.mjs';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrator = path.join(scriptsDirectory, 'migrate-routing.mjs');
const kitPath = path.join(scriptsDirectory, '..', 'src', '.ai', 'model-routing.yaml');
const kit = () => readFileSync(kitPath, 'utf8');

// Um projeto plausivel na schema 2: catalogo proprio, rotas por modelo, e as
// decisoes que sao dele e nao do kit.
const PROJETO_V2 = `schema_version: 2

project_policy:
  r2_review: required
  r2_test_gate: required
  r3_cross_provider: true
  unknown_model_identity: reject_for_r3

runner_policy:
  runner-caseiro:
    enabled: false
    conta: "conta do humano"

profiles:
  economical: { rank: 1, description: x }
  balanced: { rank: 2, description: y }
  frontier: { rank: 3, description: z }

models:
  modelo-a:
    provider: prov-a
    model: "modelo-a"
    profile: frontier
    status: active
  modelo-b:
    provider: prov-b
    model: "modelo-b"
    profile: balanced
    status: active

risk_domains:
  generic_r3: [ payments-money ]
  project: [ faturamento-interno ]

routes:
  R1: { executor_profile: economical, review: optional, test_gate: optional, independent_model: false }
  R2: { executor_profile: balanced, review: project_policy, test_gate: project_policy, independent_model: true }
  R3: { executor_profile: frontier, review: required, test_gate: required, independent_model: true }

work_routes:
  backend-implementation:
    executor:
      default: { model: modelo-a, effort: max }

cli_runners:
  runner-caseiro:
    binary: "meu-script"
    argv: [ "{prompt}" ]
    prompt_delivery: argv

terminal_runners:
  preference: [ tmux ]
  fallback: inline
`;

function migrado(fonte = PROJETO_V2) {
  return migrateRoutingContents(fonte, kit());
}

test('o resultado esta na schema 3 e traz combos e papeis do kit', () => {
  const { changed, text } = migrado();
  assert.equal(changed, true);
  const routing = parse(text);
  assert.equal(routing.schema_version, 3);
  assert.ok(Object.keys(routing.combos).length > 0, 'a migracao nao trouxe combos');
  assert.ok(routing.roles.executor.default, 'a migracao nao trouxe papeis');
  assert.equal(routing.models, undefined, 'o catalogo de modelos sobreviveu a migracao');
  assert.equal(routing.work_routes, undefined, 'work_routes sobreviveu a migracao');
});

// O ponto da migracao inteira: o kit manda no que e dele, e nao encosta no que
// o projeto decidiu. Se esta parte falhar, migrar vira perder configuracao.
test('o que o projeto decidiu atravessa a migracao intacto', () => {
  const routing = parse(migrado().text);
  assert.equal(routing.project_policy.r2_review, 'required');
  assert.equal(routing.project_policy.r2_test_gate, 'required');
  assert.equal(routing.runner_policy['runner-caseiro'].enabled, false);
  assert.equal(routing.runner_policy['runner-caseiro'].conta, 'conta do humano');
  assert.deepEqual(routing.risk_domains.project, ['faturamento-interno']);
  assert.deepEqual(routing.terminal_runners.preference, ['tmux']);
});

// Runner local pode ser a unica forma de aquela maquina falar com um modelo.
test('runner que so o projeto tem e mantido', () => {
  const routing = parse(migrado().text);
  assert.equal(routing.cli_runners['runner-caseiro'].binary, 'meu-script');
  assert.ok(routing.cli_runners.claude, 'os runners do kit nao chegaram');
});

// As duas politicas dependiam de perfil e provedor, que sairam do catalogo.
// Mante-las seria deixar o projeto com uma regra que nada mais consegue aplicar.
test('as politicas que dependiam de dado de modelo sao descartadas em voz alta', () => {
  const { text, summary } = migrado();
  const routing = parse(text);
  assert.equal(routing.project_policy.r3_cross_provider, undefined);
  assert.equal(routing.project_policy.unknown_model_identity, undefined);
  assert.ok(summary.some((l) => l.includes('r3_cross_provider')), 'o descarte passou calado');
});

// Perder 43 modelos em silencio seria o tipo de coisa que so se descobre semanas
// depois. O relatorio diz o numero e diz o que fazer em seguida.
test('o relatorio diz quantos modelos foram descartados e o que revisar', () => {
  const { summary } = migrado();
  assert.ok(summary.some((l) => /models: 2 entradas descartadas/.test(l)));
  assert.ok(summary.some((l) => /work_routes: descartado/.test(l) && /roles/.test(l)));
});

test('um arquivo ja na schema 3 nao e migrado de novo', () => {
  const { changed, text, summary } = migrateRoutingContents(kit(), kit());
  assert.equal(changed, false);
  assert.equal(text, kit());
  assert.match(summary[0], /ja esta na schema 3/);
});

test('a CLI so escreve com --write, e o dry-run nao toca no arquivo', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'l-nexus-mig-'));
  try {
    const routingPath = path.join(directory, 'model-routing.yaml');
    writeFileSync(routingPath, PROJETO_V2);
    const dry = spawnSync(process.execPath, [migrator, routingPath], { encoding: 'utf8' });
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /Migraria \(dry-run\)/);
    assert.equal(readFileSync(routingPath, 'utf8'), PROJETO_V2);

    const escrita = spawnSync(process.execPath, [migrator, routingPath, '--write'], { encoding: 'utf8' });
    assert.equal(escrita.status, 0, escrita.stderr);
    assert.equal(parse(readFileSync(routingPath, 'utf8')).schema_version, 3);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

// Desligar o runner que o roteamento alcanca passou a ser recusa, nao aviso: na
// schema 2 havia varios runners e desligar um deixava caminho; com combo, o
// roteamento inteiro vai para `default_runner`, e desliga-lo nao deixa nenhum.
// Migrar um projeto nessa situacao tem que dizer isso em voz alta.
test('o arquivo migrado denuncia um default_runner que o projeto desligou', () => {
  const fonte = PROJETO_V2.replace('  runner-caseiro:\n    enabled: false', '  claude:\n    enabled: false');
  const directory = mkdtempSync(path.join(tmpdir(), 'l-nexus-mig-'));
  try {
    const routingPath = path.join(directory, 'model-routing.yaml');
    writeFileSync(routingPath, migrado(fonte).text);
    const result = spawnSync(process.execPath, [
      path.join(scriptsDirectory, 'validate-task-routing.mjs'),
      path.join(scriptsDirectory, 'fixtures', 'tasks', 'e2e-v3-r1.md'),
      '--routing', routingPath, '--final-commit', 'abc1234',
    ], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /routing\.default_runner: resolves to claude, which runner_policy turned off/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

// Migrar e depois validar e o caminho real de um projeto atrasado. Se o arquivo
// migrado nao passar pelo validador, a migracao entregou um beco sem saida.
test('o arquivo migrado e aceito pelo validador', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'l-nexus-mig-'));
  try {
    const routingPath = path.join(directory, 'model-routing.yaml');
    writeFileSync(routingPath, migrado().text);
    const result = spawnSync(process.execPath, [
      path.join(scriptsDirectory, 'validate-task-routing.mjs'),
      path.join(scriptsDirectory, 'fixtures', 'tasks', 'e2e-v3-r1.md'),
      '--routing', routingPath, '--final-commit', 'abc1234',
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
