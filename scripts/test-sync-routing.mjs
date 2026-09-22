import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';
import { PRESERVED, SYNCED } from './sync-routing.mjs';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const command = path.join(scriptsDirectory, 'sync-routing.mjs');
const shipped = path.join(scriptsDirectory, '..', 'src', '.ai', 'model-routing.yaml');

function shippedSource() {
  return readFileSync(shipped, 'utf8');
}

// Monta um projeto com o roteamento ja instalado e depois divergido, que e a
// situacao real: o kit anda, o projeto fica para tras, e o que o projeto
// decidiu por conta propria nao pode ser atropelado quando ele alcancar.
function withProjectRouting(transform, assertions) {
  const directory = mkdtempSync(path.join(tmpdir(), 'l-nexus-sync-'));
  try {
    const routingPath = path.join(directory, 'model-routing.yaml');
    writeFileSync(routingPath, transform(shippedSource()));
    const run = (...args) => spawnSync(process.execPath, [command, routingPath, ...args], { encoding: 'utf8' });
    assertions({
      routingPath,
      run,
      read: () => readFileSync(routingPath, 'utf8'),
      parsed: () => parse(readFileSync(routingPath, 'utf8')),
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

// Remove um combo do catalogo, simulando projeto atrasado em relacao ao kit.
// Antes isto removia um modelo; a schema 3 nao tem modelos, e o combo e a
// unidade equivalente -- o que o kit sabe e o projeto ainda nao.
function withoutCombo(source, key) {
  return source.replace(new RegExp(`\\n  ${key}: \\{[^}]*\\}`), '');
}

test('dry-run reports what would change and writes nothing', () => {
  withProjectRouting((source) => withoutCombo(source, '9r-tester-frontier'), ({ run, read }) => {
    const antes = read();
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Mudaria \(dry-run\)/);
    assert.match(result.stdout, /\+ 9r-tester-frontier/);
    assert.match(result.stdout, /Nada foi escrito/);
    assert.equal(read(), antes);
  });
});

test('--write brings the catalog up to date', () => {
  withProjectRouting((source) => withoutCombo(source, '9r-tester-frontier'), ({ run, parsed }) => {
    assert.equal(parsed().combos['9r-tester-frontier'], undefined);
    const result = run('--write');
    assert.equal(result.status, 0, result.stderr);
    assert.ok(parsed().combos['9r-tester-frontier'], 'o combo do kit nao chegou ao projeto');
  });
});

test('what belongs to the project and to the machine survives the sync', () => {
  // E a razao de o arquivo inteiro ter sido congelado ate agora: para proteger
  // estas secoes, congelou-se tambem o catalogo, que devia andar.
  withProjectRouting((source) => withoutCombo(source, '9r-tester-frontier')
    .replace('  r2_review: optional', '  r2_review: required')
    .replace('  project: []', '  project: [faturamento-interno]')
    // Acrescenta entrada propria em vez de mexer numa do kit: o que este teste
    // afirma e que a secao do projeto sobrevive, e isso nao deve depender do
    // texto de uma politica que o kit pode reescrever a qualquer momento.
    // O que resta da maquina e o terminal: qual emulador existe para abrir uma
    // janela visivel. Runner saiu desta categoria -- e do kit.
    .replace('  fallback: inline', '  fallback: block'),
  ({ run, parsed }) => {
    const result = run('--write');
    assert.equal(result.status, 0, result.stderr);
    const routing = parsed();
    assert.equal(routing.project_policy.r2_review, 'required');
    assert.deepEqual(routing.risk_domains.project, ['faturamento-interno']);
    assert.equal(routing.terminal_runners.fallback, 'block', 'a decisao de terminal foi atropelada');
    assert.ok(routing.terminal_runners.preference, 'os terminais da maquina sumiram');
    assert.match(result.stdout, /Preservado: project_policy/);
  });
});

test('the comments that justify a route travel with it', () => {
  // A justificativa de uma rota vale tanto quanto a rota: sem ela o proximo a
  // mexer no arquivo reescreve a regra sem saber por que ela existia.
  withProjectRouting(
    (source) => withoutCombo(source, '9r-tester-frontier').replace(/# Qual combo cada papel usa\./, '# (comentario perdido)'),
    ({ run, read }) => {
      run('--write');
      assert.match(read(), /Qual combo cada papel usa/);
    },
  );
});

test('an already synced file reports so and stays byte-identical', () => {
  withProjectRouting((source) => source, ({ run, read }) => {
    const antes = read();
    const result = run('--write');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /ja esta sincronizado/);
    assert.equal(read(), antes);
  });
});

test('a section the kit does not know is kept and announced', () => {
  // Configuracao local legitima nao e erro. Mas passar por cima dela em
  // silencio seria, entao ela e dita em voz alta.
  withProjectRouting(
    (source) => withoutCombo(source, '9r-tester-frontier') + '\nintegracao_local:\n  chave: valor\n',
    ({ run, parsed }) => {
      const result = run('--write');
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Secao local mantida intacta: integracao_local/);
      assert.equal(parsed().integracao_local.chave, 'valor');
    },
  );
});

test('refuses to sync content onto a schema that cannot hold it', () => {
  // Migrar schema e outro trabalho, com outras regras. Sincronizar por cima
  // produziria um arquivo que nao valida, e o erro apareceria longe da causa.
  withProjectRouting((source) => source.replace('schema_version: 3', 'schema_version: 2'), ({ run }) => {
    const result = run('--write');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /migrate-routing/);
  });
});

test('the synced file still satisfies the shipped-routing rules', () => {
  // Sincronizar nao pode produzir um arquivo que o proprio validador recusa.
  withProjectRouting((source) => withoutCombo(source, '9r-tester-frontier'), ({ run, routingPath }) => {
    run('--write');
    const validator = path.join(scriptsDirectory, 'validate-task-routing.mjs');
    const task = path.join(scriptsDirectory, 'fixtures', 'tasks', 'e2e-v3-r1.md');
    const result = spawnSync(process.execPath, [
      validator, task, '--routing', routingPath, '--final-commit', 'abc1234',
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  });
});

test('cli_runners e do kit: o que ele podou some do projeto', () => {
  // Este teste ja afirmou o contrario. `cli_runners` era MERGED para nao apagar
  // runner que so a maquina tinha -- e quando o kit podou cinco runners que
  // ninguem mais alcanca, a preservacao manteve os cinco onde eles atrapalham:
  // no arquivo do projeto. A unica instalacao real seguia com seis entradas para
  // uma decisao que a schema 3 tinha apagado. O merge protegia o lixo.
  withProjectRouting((source) => source
    // projeto atrasado: com uma declaracao velha no runner que o kit publica...
    .replace('    binary: "claude"', '    binary: "claude-antigo"')
    // ...e com dois que so ele tem, DENTRO de cli_runners: anexar no fim do
    // arquivo os poria dentro de terminal_runners, que vem depois.
    .replace('cli_runners:\n', 'cli_runners:\n  runner-caseiro:\n    binary: "meu-script"\n    argv: ["{prompt}"]\n    prompt_delivery: argv\n  runner-podado:\n    binary: "cli-que-saiu-do-kit"\n    argv: ["{prompt}"]\n    prompt_delivery: argv\n'),
  ({ run, parsed }) => {
    const result = run('--write');
    assert.equal(result.status, 0, result.stderr);
    const runners = parsed().cli_runners;
    assert.equal(runners.claude.binary, 'claude', 'a entrada desatualizada do projeto nao foi corrigida');
    assert.deepEqual(Object.keys(runners), ['claude'], 'a poda do kit nao chegou ao projeto');
    // Apagar calado seria pior que preservar: o humano precisa ver o que saiu.
    assert.match(result.stdout, /runner-caseiro/);
    assert.match(result.stdout, /runner-podado/);
  });
});

// Remove uma secao inteira de topo, simulando projeto instalado ANTES de o kit
// passar a ter esse campo. Nao e hipotese: o clp foi instalado antes de haver
// politica de runner e chegou na 0.12.4 sem a secao que ela ocupava.
function withoutSection(source, key) {
  return source.replace(
    new RegExp(`\\n${key}:\\n(?:  .*\\n|    .*\\n|\\n(?=  ))*`),
    '\n',
  );
}

// PRESERVED protegia o que existe e nao criava o que falta, entao um projeto
// antigo ficava permanentemente sem a secao -- e em silencio, porque o resumo so
// lista como preservado aquilo que ja estava la. Descoberto com uma secao que
// hoje nem existe mais; vale igual para `terminal_runners`, sem a qual o
// Orchestrator nao sabe como abrir uma janela visivel e cai no fallback sem
// nunca dizer por que. Semear nao briga com preservar: preservar so tem sentido
// quando ha o que preservar.
test('a PRESERVED section the project never had is seeded from the kit', () => {
  const kit = parse(readFileSync(shipped, 'utf8'));
  for (const section of PRESERVED) {
    assert.ok(kit[section] !== undefined, `the kit itself has no ${section} to seed`);
    withProjectRouting((source) => withoutSection(source, section), ({ run, parsed }) => {
      const result = run('--write');
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(parsed()[section], kit[section], `${section} was not seeded from the kit`);
      assert.match(result.stdout, new RegExp(`Semeado: ${section}`));
      // Semear uma vez e semear sempre sao coisas diferentes: a segunda rodada
      // tem que achar a secao no lugar e nao ter mais nada a fazer.
      assert.match(run().stdout, /ja esta sincronizado com o kit/);
    });
  }
});

// O outro lado da mesma regra, e o que impede a correcao de virar atropelo: se
// a secao existe, ela e do projeto e nao se toca, nem quando discorda do kit.
test('a PRESERVED section the project already has is never overwritten', () => {
  // Diverge do kit trocando a secao inteira, e nao um trecho literal dela: um
  // teste preso ao texto exato de uma politica quebra quando alguem muda essa
  // politica, e o que ele quer afirmar nao tem nada a ver com o conteudo dela.
  const divergente = 'project_policy:\n  r2_review: required\n  r2_test_gate: required\n';
  withProjectRouting(
    (source) => source.replace(/\nproject_policy:\n(?:  .*\n|    .*\n)*/, '\n' + divergente),
    ({ run, parsed }) => {
      const result = run('--write');
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(parsed().project_policy, { r2_review: 'required', r2_test_gate: 'required' });
      assert.doesNotMatch(result.stdout, /Semeado: .*project_policy/);
    },
  );
});

// Guarda de processo, nao de dado. Uma secao nova no kit que ninguem classificou
// nao chega a projeto nenhum e nao avisa: o resumo so olha as chaves do PROJETO,
// entao a ausencia e invisivel dos dois lados. Este teste quebra no dia em que
// alguem adicionar uma secao sem decidir se ela sincroniza, mescla ou preserva.
test('every top-level section of the shipped catalog has an owner', () => {
  const shippedKeys = Object.keys(parse(readFileSync(shipped, 'utf8')));
  const classified = new Set([...SYNCED, ...PRESERVED, 'risk_domains']);
  const orphans = shippedKeys.filter((key) => !classified.has(key));
  assert.deepEqual(orphans, [], `unclassified in sync-routing.mjs: ${orphans.join(', ')}`);
});
