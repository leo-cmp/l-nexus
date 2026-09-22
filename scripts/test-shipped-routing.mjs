// Checagens ponta a ponta contra o catalogo que o l-nexus realmente publica. As
// fixtures sinteticas provam as regras; estas provam que os padroes de fabrica
// sao coerentes entre si, para que uma instalacao nova produza uma task que
// valida sem ninguem precisar editar nada antes.
//
// Os E2E que mediam perfil, provedor cruzado e elegibilidade por esforco sairam
// com a schema 3: as regras deixaram de existir e um teste verde sobre regra
// inexistente simula cobertura. O que ficou nao pergunta o que um modelo e.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parse, parseDocument } from 'yaml';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.dirname(scriptsDirectory);
const validator = path.join(scriptsDirectory, 'validate-task-routing.mjs');
const shippedRouting = path.join(rootDirectory, 'src', '.ai', 'model-routing.yaml');

const fixture = (name) => readFileSync(path.join(scriptsDirectory, 'fixtures', 'tasks', name), 'utf8');
const shippedCatalog = () => parse(readFileSync(shippedRouting, 'utf8'));

function run({ task, routing = readFileSync(shippedRouting, 'utf8'), finalCommit = 'abc1234' }) {
  const directory = mkdtempSync(path.join(tmpdir(), 'l-nexus-e2e-'));
  try {
    const taskPath = path.join(directory, 'task.md');
    const routingPath = path.join(directory, 'model-routing.yaml');
    writeFileSync(taskPath, task);
    writeFileSync(routingPath, routing);
    return spawnSync(process.execPath, [
      validator, taskPath, '--routing', routingPath, '--final-commit', finalCommit,
    ], { encoding: 'utf8' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const gatedRouting = () => readFileSync(shippedRouting, 'utf8')
  .replace('  r2_review: optional', '  r2_review: required')
  .replace('  r2_test_gate: optional', '  r2_test_gate: required');

test('E2E 1 — uma task R1 de documentacao nao precisa de teste nem de revisao', () => {
  const result = run({ task: fixture('e2e-v3-r1.md') });
  assert.equal(result.status, 0, result.stderr);
});

test('E2E 2 — uma task R3 fecha com revisao aprovada e teste passando', () => {
  const result = run({ task: fixture('e2e-v3-r3.md') });
  assert.equal(result.status, 0, result.stderr);
});

test('E2E 3 — teste reprovado bloqueia o fechamento de uma R3', () => {
  const result = run({ task: fixture('e2e-v3-r3.md').replace('verdict: "passed"', 'verdict: "failed"') });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires a passed test run of final commit abc1234/);
});

test('E2E 4 — revisao de um commit anterior nao fecha a task', () => {
  const result = run({
    task: fixture('e2e-v3-r3.md').replace('      commit: "abc1234"\n      verdict: "approved"',
      '      commit: "0000000"\n      verdict: "approved"'),
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires an approved review of final commit abc1234/);
});

// O incidente que originou o kit, medido contra os padroes de fabrica: dois
// combos distintos podem cair no mesmo modelo, e so o registro do que respondeu
// enxerga isso.
test('E2E 5 — o modelo que executou nao assina a propria revisao', () => {
  const result = run({
    task: fixture('e2e-v3-r3.md').replace('model: "muse-spark-1.3-contributor"', 'model: "deepseek-flash"'),
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /the same model that executed/);
});

test('E2E 6 — descobrir um dominio R3 proibe manter a task abaixo disso', () => {
  const result = run({
    task: fixture('e2e-v3-r1.md').replace('domains: [documentation]', 'domains: [payments-money]'),
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must be R3 because domain payments-money is configured as mandatory R3/);
});

// R2 e o unico nivel em que o projeto decide. Com os dois portoes ligados, a
// mesma task que passava deixa de passar -- e e assim que a politica vira efeito.
test('E2E 7 — ligar os portoes de R2 no projeto muda o resultado da mesma task', () => {
  const task = fixture('e2e-v3-r1.md')
    .replace('  level: "R1"', '  level: "R2"')
    .replace('complexity: "L1"', 'complexity: "L2"');
  assert.equal(run({ task }).status, 0, 'com os portoes opcionais a task deveria passar');
  const comPortoes = run({ task, routing: gatedRouting() });
  assert.notEqual(comPortoes.status, 0);
  assert.match(comPortoes.stderr, /requires an approved review of final commit abc1234/);
});

// ------------------------------------------------------- coerencia do catalogo

// Le com o parser de YAML, nao com regex: a versao anterior desta guarda exigia
// a forma `{ model: x, effort: y }` e por isso enxergava 62 dos 85 slots, o que
// deixou cinco combos entrarem no catalogo sem passar por guarda nenhuma.
test('todo combo citado em roles existe em combos', () => {
  const routing = shippedCatalog();
  const problemas = [];
  for (const [papel, variantes] of Object.entries(routing.roles ?? {})) {
    for (const [tier, combo] of Object.entries(variantes ?? {})) {
      if (typeof combo !== 'string') { problemas.push(`roles.${papel}.${tier}: nao nomeia um combo`); continue; }
      if (!routing.combos?.[combo]) problemas.push(`roles.${papel}.${tier}: ${combo} nao existe em combos`);
    }
  }
  assert.deepEqual(problemas, [], problemas.join('\n'));
});

// A guarda antiga perguntava "esse modelo existe?" e faltava "da para EXECUTAR
// isso?". Foi por essa distancia que o defeito passou da ultima vez.
test('todo combo resolve para um runner que o projeto pode usar', () => {
  const routing = shippedCatalog();
  const problemas = [];
  for (const [nome, combo] of Object.entries(routing.combos ?? {})) {
    const runner = combo?.runner ?? routing.default_runner;
    if (!routing.cli_runners?.[runner]) {
      problemas.push(`combos.${nome}: runner ${runner} nao existe em cli_runners`);
      continue;
    }
    if (routing.runner_policy?.[runner]?.enabled === false) {
      problemas.push(`combos.${nome}: runner ${runner} esta desligado por runner_policy`);
    }
  }
  assert.deepEqual(problemas, [], problemas.join('\n'));
});

// Papeis diferentes caindo no mesmo combo tornam impossivel cumprir a
// independencia que R3 exige: o gate viraria carimbo antes de qualquer execucao.
test('os combos criticos dos tres papeis sao distintos entre si', () => {
  const { roles } = shippedCatalog();
  const criticos = ['executor', 'tester', 'reviewer']
    .map((papel) => roles?.[papel]?.critical ?? roles?.[papel]?.default);
  assert.equal(new Set(criticos).size, criticos.length,
    `os papeis compartilham combo em R3: ${criticos.join(', ')}`);
});

test('todo runner declara interactive, autonomy e effort explicitamente', () => {
  const routing = shippedCatalog();
  const problemas = [];
  for (const [nome, runner] of Object.entries(routing.cli_runners ?? {})) {
    for (const secao of ['interactive', 'autonomy', 'effort']) {
      const bloco = runner?.[secao];
      if (typeof bloco?.supported !== 'boolean') {
        problemas.push(`${nome}.${secao}: nao declara supported`);
        continue;
      }
      // Prometer suporte sem dizer como passar a opcao e promessa que o runner
      // nao consegue cumprir na hora de montar o comando.
      if (bloco.supported === true && (!Array.isArray(bloco.argv) || bloco.argv.length === 0)) {
        problemas.push(`${nome}.${secao}: diz suportar mas nao declara argv`);
      }
    }
  }
  assert.deepEqual(problemas, [], problemas.join('\n'));
});

// O catalogo publicado tem que voltar byte a byte de um round-trip: sync-routing
// reescreve o arquivo com toString(), e um arquivo instavel faz todo projeto
// receber dezenas de linhas reformatadas junto com a mudanca real.
test('o catalogo publicado sobrevive a um round-trip de YAML byte a byte', () => {
  const source = readFileSync(shippedRouting, 'utf8');
  const roundTripped = parseDocument(source).toString({ lineWidth: 0 });
  const mudadas = source.split('\n')
    .map((linha, i) => [i + 1, linha, roundTripped.split('\n')[i]])
    .filter(([, antes, depois]) => antes !== depois);
  assert.deepEqual(mudadas.map(([n, a, d]) => `linha ${n}: ${a} -> ${d}`), []);
});

// O kit nao pode assumir a configuracao de ninguem: nome de combo, de runner e
// de modelo vivem no catalogo, que e editavel, e nunca dentro do codigo.
test('a implementacao nao embute nome de combo, runner ou modelo', () => {
  const fontes = ['validate-task-routing.mjs', 'sync-routing.mjs', 'migrate-routing.mjs'];
  const proibidos = [/9r-[a-z-]+/, /muse-spark/, /deepseek/, /longcat/, /opencode/];
  const problemas = [];
  for (const arquivo of fontes) {
    const conteudo = readFileSync(path.join(scriptsDirectory, arquivo), 'utf8');
    for (const [numero, linha] of conteudo.split('\n').entries()) {
      if (linha.trimStart().startsWith('//')) continue;
      for (const padrao of proibidos) {
        if (padrao.test(linha)) problemas.push(`${arquivo}:${numero + 1}: ${linha.trim().slice(0, 70)}`);
      }
    }
  }
  assert.deepEqual(problemas, [], problemas.join('\n'));
});

// A promessa desta suite -- instalacao nova produz task que valida sem ninguem
// editar nada antes -- nunca tinha sido medida no estado em que toda task passa
// primeiro: recem-criada, pendente, sem uma linha de execucao. As fixtures eram
// todas `state: done` com proveniencia preenchida, entao o esqueleto vazio que o
// template publica reprovava em tres campos e nenhum teste via.
const templatePublicado = (nome) => readFileSync(
  path.join(rootDirectory, 'src', '.ai', 'templates', nome), 'utf8');

// So o que o Planner preenche. A proveniencia fica como o template a entrega:
// e justamente ela que esta sob teste.
function comoOPlannerPreencheria(template, { nivel = 'R1' } = {}) {
  const catalogo = shippedCatalog();
  const combo = (papel) => (nivel === 'R3' && catalogo.roles[papel].critical)
    || catalogo.roles[papel].default;
  const effort = (papel) => catalogo.combos[combo(papel)].effort;
  return template
    .replace('id: TASK-XXX', 'id: task_recem_criada')
    .replace('title: "[Titulo descritivo]"', 'title: "Task recem criada"')
    .replace('complexity: "[L1 | L2 | L3]"', 'complexity: "L1"')
    .replace('level: "[R1 | R2 | R3]"', `level: "${nivel}"`)
    .replace('rationale: "[impacto caso a implementacao esteja errada]"', 'rationale: "Reversivel."')
    .replace('agent: "[agente]"', 'agent: "planner"')
    .replace('provider: "[provedor ou unknown]"', 'provider: "provider-a"')
    .replace('model: "[modelo exato ou unknown]"', 'model: "model-planner"')
    .replace('combo: "[combo de roles.executor]"', `combo: "${combo('executor')}"`)
    .replace('combo: "[combo de roles.tester, ou remova se o risco nao exige teste]"', `combo: "${combo('tester')}"`)
    .replace('combo: "[combo de roles.reviewer, ou remova se o risco nao exige revisao]"', `combo: "${combo('reviewer')}"`)
    .replace('effort: "[effort declarado para o combo]"', `effort: "${effort('executor')}"`)
    .replace('effort: "[effort declarado para o combo]"', `effort: "${effort('tester')}"`)
    .replace('effort: "[effort declarado para o combo]"', `effort: "${effort('reviewer')}"`);
}

for (const nome of ['task.md', 'task-short.md']) {
  test(`E2E — uma task pendente criada do template ${nome} valida sem edicao`, () => {
    const result = run({ task: comoOPlannerPreencheria(templatePublicado(nome)) });
    assert.equal(result.status, 0, result.stderr);
  });
}

// R3 e o nivel estrito: exige teste e revisao. Ainda assim, cobrar os portoes de
// uma task que nao comecou seria cobrar prova de fato que nao aconteceu.
test('E2E — uma task R3 pendente nao e cobrada dos portoes antes de executar', () => {
  const result = run({ task: comoOPlannerPreencheria(templatePublicado('task.md'), { nivel: 'R3' }) });
  assert.equal(result.status, 0, result.stderr);
});

// O esqueleto vazio nao pode virar porta dos fundos: a task fechada continua
// tendo que dizer quem executou.
test('E2E — o esqueleto vazio nao fecha uma task done', () => {
  const pendente = comoOPlannerPreencheria(templatePublicado('task.md'));
  const result = run({ task: pendente.replace('  state: pending', '  state: done') });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must record who executed once the task is done/);
});

// Nem porta dos fundos do outro lado: veredito registrado sobre execucao que o
// proprio arquivo diz nao ter acontecido e contradicao, nao task pendente.
test('E2E — veredito sem execucao e contradicao', () => {
  const pendente = comoOPlannerPreencheria(templatePublicado('task.md'));
  const result = run({
    task: pendente.replace('  tests: []',
      '  tests:\n    - combo: "9r-tester"\n      model: "modelo-que-testou"\n      verdict: "passed"\n      commit: "abc1234"'),
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /nothing can be tested or reviewed before it executes/);
});
