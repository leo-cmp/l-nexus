import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';

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

// Remove uma entrada do catalogo, simulando projeto atrasado em relacao ao kit.
function withoutModel(source, key) {
  return source.replace(
    new RegExp(`\\n  ${key}:\\n(?:    .*\\n|\\n)*?(?=  [a-z0-9-]+:\\n|risk_domains:)`),
    '\n',
  );
}

test('dry-run reports what would change and writes nothing', () => {
  withProjectRouting((source) => withoutModel(source, 'tencent-hy3'), ({ run, read }) => {
    const antes = read();
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Mudaria \(dry-run\)/);
    assert.match(result.stdout, /\+ tencent-hy3/);
    assert.match(result.stdout, /Nada foi escrito/);
    assert.equal(read(), antes);
  });
});

test('--write brings the catalog up to date', () => {
  withProjectRouting((source) => withoutModel(source, 'tencent-hy3'), ({ run, parsed }) => {
    assert.equal(parsed().models['tencent-hy3'], undefined);
    const result = run('--write');
    assert.equal(result.status, 0, result.stderr);
    assert.ok(parsed().models['tencent-hy3'], 'o modelo do kit nao chegou ao projeto');
  });
});

test('what belongs to the project and to the machine survives the sync', () => {
  // E a razao de o arquivo inteiro ter sido congelado ate agora: para proteger
  // estas secoes, congelou-se tambem o catalogo, que devia andar.
  withProjectRouting((source) => withoutModel(source, 'tencent-hy3')
    .replace('  r2_review: required', '  r2_review: optional')
    .replace('  project: []', '  project: [faturamento-interno]')
    .replace('  claude:\n    enabled: false', '  claude:\n    enabled: true'),
  ({ run, parsed }) => {
    const result = run('--write');
    assert.equal(result.status, 0, result.stderr);
    const routing = parsed();
    assert.equal(routing.project_policy.r2_review, 'optional');
    assert.deepEqual(routing.risk_domains.project, ['faturamento-interno']);
    assert.equal(routing.runner_policy.claude.enabled, true);
    assert.ok(routing.cli_runners.opencode, 'os runners da maquina sumiram');
    assert.ok(routing.terminal_runners, 'os terminais da maquina sumiram');
    assert.match(result.stdout, /Preservado: project_policy/);
  });
});

test('the comments that justify a route travel with it', () => {
  // A justificativa de uma rota vale tanto quanto a rota: sem ela o proximo a
  // mexer no arquivo reescreve a regra sem saber por que ela existia.
  withProjectRouting(
    (source) => withoutModel(source, 'tencent-hy3').replace(/# 1\. PAPEIS DISJUNTOS\./, '# (comentario perdido)'),
    ({ run, read }) => {
      run('--write');
      assert.match(read(), /PAPEIS DISJUNTOS/);
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
    (source) => withoutModel(source, 'tencent-hy3') + '\nintegracao_local:\n  chave: valor\n',
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
  withProjectRouting((source) => source.replace('schema_version: 2', 'schema_version: 1'), ({ run }) => {
    const result = run('--write');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /migrate-routing/);
  });
});

test('the synced file still satisfies the shipped-routing rules', () => {
  // Sincronizar nao pode produzir um arquivo que o proprio validador recusa.
  withProjectRouting((source) => withoutModel(source, 'tencent-hy3'), ({ run, routingPath }) => {
    run('--write');
    const validator = path.join(scriptsDirectory, 'validate-task-routing.mjs');
    const task = path.join(scriptsDirectory, 'fixtures', 'tasks', 'e2e-r1-documentation.md');
    const result = spawnSync(process.execPath, [
      validator, task, '--routing', routingPath, '--final-commit', 'abc1234',
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  });
});

test('cli_runners merges: the kit updates what it knows and keeps what it does not', () => {
  // Descoberto na primeira propagacao real. Preservar cli_runners inteiro
  // deixava o projeto com rotas apontando para runners que ele nao tinha, e
  // mantinha uma declaracao de esforco que o kit ja havia corrigido por ser
  // falsa. Sobrescrever inteiro apagaria runner local. Mesclar e o unico
  // comportamento em que nada se perde e a correcao chega.
  withProjectRouting((source) => source
    // projeto atrasado: sem o runner novo do kit...
    .replace(/\n  opencode-muse:\n(?:    .*\n|      .*\n|\n)*?(?=  [a-z0-9-]+:\n)/, '\n')
    // ...com uma declaracao velha no runner que ambos tem...
    .replace('  opencode:\n    binary: "opencode"', '  opencode:\n    binary: "opencode-antigo"')
    // ...e com um runner que so ele conhece, DENTRO de cli_runners: anexar no
    // fim do arquivo o poria dentro de terminal_runners, que vem depois.
    .replace('cli_runners:\n', 'cli_runners:\n  runner-caseiro:\n    binary: "meu-script"\n    argv: ["{prompt}"]\n    prompt_delivery: argv\n'),
  ({ run, parsed }) => {
    const result = run('--write');
    assert.equal(result.status, 0, result.stderr);
    const runners = parsed().cli_runners;
    assert.ok(runners['opencode-muse'], 'o runner que so o kit tinha nao chegou ao projeto');
    assert.equal(runners.opencode.binary, 'opencode', 'a entrada desatualizada do projeto nao foi corrigida');
    assert.equal(runners['runner-caseiro'].binary, 'meu-script', 'o runner local foi apagado');
  });
});
