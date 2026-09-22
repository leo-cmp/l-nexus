// Suite do validador na schema 3. A versao anterior tinha 81 testes e boa parte
// deles afirmava coisas sobre MODELO -- piso de perfil, capacidade declarada,
// provedor cruzado, vocabulario de esforco. Essas regras sairam com a schema 3,
// entao os testes delas sairam junto: manter teste verde sobre regra que nao
// existe mais e pior que nao ter teste, porque simula cobertura onde nao ha
// comportamento.
//
// Ficou o que nao depende de saber o que um modelo e: portao por risco, papeis
// disjuntos comparando os modelos REAIS que responderam, congelamento do plano,
// testemunha no git e evidencia de execucao.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const validator = path.join(scriptsDirectory, 'validate-task-routing.mjs');
const routing = path.join(scriptsDirectory, 'fixtures', 'model-routing-v3.yaml');
const taskFixture = (name) => path.join(scriptsDirectory, 'fixtures', 'tasks', name);

function validate({ taskPath, routingPath = routing, finalCommit = 'abc1234', extra = [] }) {
  return spawnSync(process.execPath, [
    validator, taskPath, '--routing', routingPath, '--final-commit', finalCommit, ...extra,
  ], { encoding: 'utf8' });
}

// O validador le arquivo, e nao objeto, entao cada caso derivado precisa existir
// em disco antes de ser medido.
function comTask(base, transform, assertions, options = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'l-nexus-v3-'));
  try {
    const taskPath = path.join(directory, 'task.md');
    writeFileSync(taskPath, transform(readFileSync(taskFixture(base), 'utf8')));
    assertions(validate({ taskPath, ...options }), directory, taskPath);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function comRoteamento(transform, assertions, base = 'v3-r3-valid.md') {
  const directory = mkdtempSync(path.join(tmpdir(), 'l-nexus-v3-'));
  try {
    const routingPath = path.join(directory, 'model-routing.yaml');
    writeFileSync(routingPath, transform(readFileSync(routing, 'utf8')));
    assertions(validate({ taskPath: taskFixture(base), routingPath }));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('aceita uma task R3 com portoes cumpridos e papeis servidos por modelos distintos', () => {
  const result = validate({ taskPath: taskFixture('v3-r3-valid.md') });
  assert.equal(result.status, 0, result.stderr);
});

test('aceita uma task R1 sem portao de teste nem de revisao', () => {
  const result = validate({ taskPath: taskFixture('v3-r1-valid.md') });
  assert.equal(result.status, 0, result.stderr);
});

// ------------------------------------------------------------------ portoes

test('R3 nao fecha sem revisao aprovada do commit final', () => {
  comTask('v3-r3-valid.md', (t) => t.replace('verdict: "approved"', 'verdict: "rejected"'), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /requires an approved review of final commit abc1234/);
  });
});

test('R3 nao fecha sem teste passando do commit final', () => {
  comTask('v3-r3-valid.md', (t) => t.replace('verdict: "passed"', 'verdict: "failed"'), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /requires a passed test run of final commit abc1234/);
  });
});

// Revisao de commit anterior aprova codigo que nao e o que ficou. O portao existe
// para o commit final, nao para algum commit da task.
test('revisao de um commit anterior nao fecha a task', () => {
  comTask('v3-r3-valid.md', (t) => t.replace(
    '      commit: "abc1234"\n      verdict: "approved"',
    '      commit: "0000000"\n      verdict: "approved"',
  ), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /requires an approved review of final commit abc1234/);
  });
});

// Commit curto e longo sao o mesmo objeto. Comparar por igualdade estrita fazia
// o bloco de revisao ser pulado em silencio, e a task passava sem revisao.
test('commit curto e commit longo do mesmo objeto satisfazem o portao', () => {
  comTask('v3-r3-valid.md', (t) => t.replaceAll('commit: "abc1234"', 'commit: "abc1234def5678"'), (result) => {
    assert.equal(result.status, 0, result.stderr);
  });
});

test('aprovar sem dizer os achados nao vale como revisao', () => {
  comTask('v3-r3-valid.md', (t) => t.replace('      findings: "Dois pontos medios, nenhum bloqueante."\n', ''), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must explicitly summarize findings/);
  });
});

// -------------------------------------------------- papeis e modelo servido

// O nucleo do incidente que originou o kit: o mesmo modelo executou, testou e
// assinou o proprio trabalho. Com combo isso e invisivel no plano, porque dois
// combos diferentes podem resolver para o mesmo modelo. So o registro do que
// realmente respondeu enxerga.
test('o modelo que executou nao pode aprovar o proprio trabalho', () => {
  comTask('v3-r3-valid.md', (t) => t.replace('model: "modelo-que-revisou"', 'model: "modelo-que-executou"'), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /approved by modelo-que-executou, the same model that executed/);
  });
});

test('o modelo que executou nao pode passar o proprio teste', () => {
  comTask('v3-r3-valid.md', (t) => t.replace('model: "modelo-que-testou"', 'model: "modelo-que-executou"'), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /passed by modelo-que-executou, the same model that executed/);
  });
});

test('quem passou o teste final nao pode assinar a revisao', () => {
  comTask('v3-r3-valid.md', (t) => t.replace('model: "modelo-que-revisou"', 'model: "modelo-que-testou"'), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /the same model that passed the final test/);
  });
});

// Gravar o nome do combo no lugar do modelo e o erro mais facil de cometer,
// porque o combo e o que a CLI recebeu. Mas combo nao identifica ninguem: quem
// atendeu esta no campo `model` da resposta.
test('gravar o nome do combo no lugar do modelo e recusado com a instrucao certa', () => {
  comTask('v3-r3-valid.md', (t) => t.replace('model: "modelo-que-executou"', 'model: "combo-executor-frontier"'), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /records the combo name \(combo-executor-frontier\)/);
    assert.match(result.stderr, /read the `model` field of the response/);
  });
});

test('registro sem o modelo servido e recusado', () => {
  comTask('v3-r3-valid.md', (t) => t.replace('    model: "modelo-que-executou"\n', ''), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must record the model the gateway reported in the response/);
  });
});

// reasoning_tokens e o unico numero sobre raciocinio que volta do gateway.
// Quando gravado, tem que ser numero -- senao o registro vira prosa.
test('reasoning_tokens gravado como texto e recusado', () => {
  comTask('v3-r3-valid.md', (t) => t.replace('reasoning_tokens: 412', 'reasoning_tokens: "muitos"'), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /reasoning_tokens/);
  });
});

// ------------------------------------------------------------------- combos

test('um combo que o catalogo nao declara e recusado', () => {
  comTask('v3-r3-valid.md', (t) => t.replace(
    'combo: "combo-executor-frontier"\n    effort: "max"',
    'combo: "combo-inventado"\n    effort: "max"',
  ), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must reference a declared routing\.combos entry \(combo-inventado\)/);
  });
});

// Qual combo cada papel usa e decisao do catalogo, nao da task: e assim que o
// humano configura uma vez e o roteamento deixa de ser discutido a cada task.
test('R3 tem que usar o combo critico que o catalogo define para o papel', () => {
  comTask('v3-r3-valid.md', (t) => t.replace(
    '    combo: "combo-executor-frontier"\n    effort: "max"',
    '    combo: "combo-executor"\n    effort: "default"',
  ), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must be combo-executor-frontier for R3/);
  });
});

// Nem todo papel precisa de variante critica. Sem `critical`, R3 usa o combo
// padrao do papel -- e isso e configuracao deliberada, nao omissao.
test('papel sem variante critica usa o combo padrao em R3 sem reclamar', () => {
  const result = validate({ taskPath: taskFixture('v3-r3-valid.md') });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /tester\.combo/);
});

test('papel apontando para combo inexistente e recusado no proprio catalogo', () => {
  comRoteamento((r) => r.replace('    default: combo-tester', '    default: combo-que-nao-existe'), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must reference a declared combo \(combo-que-nao-existe\)/);
  });
});

test('default_runner que nao existe em cli_runners e recusado', () => {
  comRoteamento((r) => r.replace('default_runner: runner-a', 'default_runner: runner-fantasma'), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /routing\.default_runner/);
  });
});

// ------------------------------------------------------------ nivel de risco

test('dominio obrigatoriamente R3 nao pode ser declarado abaixo disso', () => {
  comTask('v3-r1-valid.md', (t) => t.replace('domains: [documentation]', 'domains: [payments-money]'), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must be R3 because domain payments-money is configured as mandatory R3/);
  });
});

// ------------------------------------------------------ congelamento do plano

test('--write-plan-hash congela o plano, e o plano congelado valida sem aviso', () => {
  comTask('v3-r3-valid.md', (t) => t, (primeiro, _directory, taskPath) => {
    assert.match(primeiro.stderr, /model_plan is not frozen/);
    const escrita = spawnSync(process.execPath, [validator, taskPath, '--write-plan-hash'], { encoding: 'utf8' });
    assert.equal(escrita.status, 0, escrita.stderr);
    const depois = validate({ taskPath });
    assert.equal(depois.status, 0, depois.stderr);
    assert.doesNotMatch(depois.stderr, /model_plan is not frozen/);
  });
});

// O hash e a primeira barreira contra reescrever o plano depois do fato; a
// testemunha no git e a segunda, e nao depende do proprio arquivo.
test('mexer no plano depois de congelado invalida o hash', () => {
  comTask('v3-r3-valid.md', (t) => t, (_primeiro, _directory, taskPath) => {
    spawnSync(process.execPath, [validator, taskPath, '--write-plan-hash'], { encoding: 'utf8' });
    writeFileSync(taskPath, readFileSync(taskPath, 'utf8').replace('effort: "max"', 'effort: "high"'));
    const result = validate({ taskPath });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /plan_hash/);
  });
});

// ------------------------------------------------------ evidencia de execucao

test('run_id que nao aponta para registro de rodada nenhum e recusado', () => {
  comTask('v3-r3-valid.md', (t) => t.replace(
    '      verdict: "passed"',
    '      run_id: "rodada-inexistente"\n      verdict: "passed"',
  ), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /run_id/);
  });
});

// Ausencia de run_id nao reprova: nem toda rodada passa pelo lnx-run. Mas o
// aviso diz em voz alta que aquele portao repousa no que a task diz de si.
test('gate sem run_id passa, mas avisa que repousa no que a task diz de si', () => {
  const result = validate({ taskPath: taskFixture('v3-r3-valid.md') });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /run_id.*is absent, so this gate rests on what the task says about itself/);
});

// ------------------------------------------------------------------- schema

test('recusa roteamento em schema anterior e manda migrar', () => {
  comRoteamento((r) => r.replace('schema_version: 3', 'schema_version: 2'), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /migrate-routing/);
  });
});

// ------------------------------------------------- `unknown` e registro, nao falha

// O kit sempre mandou registrar `unknown` quando o runtime nao expoe o modelo, e
// o validador reprovava `unknown` junto com o campo vazio. O agente ficava entre
// uma regra que manda dizer a verdade e um gate que so aceita mentira plausivel
// -- e escolheu a mentira: um Orchestrator escreveu o `default_model` do runner
// para fechar a task. Estes tres testes existem para essa porta nao fechar de
// novo.
test('R1 aceita model unknown, porque ali nao ha disjuncao a provar', () => {
  comTask('v3-r1-valid.md', (t) => t.replace('model: "modelo-que-executou"', 'model: "unknown"'),
    (result) => {
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stderr, /is unknown: nobody observed which model answered/);
    });
});

test('R3 recusa model unknown, porque sem saber quem respondeu nao ha disjuncao', () => {
  comTask('v3-r3-valid.md', (t) => t.replace('model: "modelo-que-executou"', 'model: "unknown"'),
    (result) => {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /is unknown, and this risk level needs the roles served by different models/);
    });
});

// "Nao observei" e uma afirmacao; campo vazio nao afirma nada. Tratar os dois
// igual foi o que criou a armadilha.
test('campo de modelo vazio continua sendo erro, mesmo em R1', () => {
  comTask('v3-r1-valid.md', (t) => t.replace('model: "modelo-que-executou"', 'model: ""'),
    (result) => {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /must record the model the gateway reported/);
    });
});

// ------------------------------------- meta.json guarda o pedido, nao a resposta

// `meta.json.model` e o eco de `--model`, que na schema 3 e o combo. Enquanto o
// validador o comparava com `model` da task, o campo nao tinha valor possivel
// numa entrada com run_id: o modelo real divergia do combo aqui, o combo era
// recusado como "nome de combo em vez do modelo que respondeu", e `unknown` nao
// fecha gate em R2/R3. Um Orchestrator preso nesse beco escreveu um nome
// plausivel, que era a unica coisa que ninguem conseguia provar errada de
// imediato. Estes testes existem para o beco nao voltar.
function comRunDir({ metaModel, taskCombo, taskModel, observed }, assertions) {
  const directory = mkdtempSync(path.join(tmpdir(), 'l-nexus-run-'));
  try {
    const runId = '20260922T180427Z-reviewer-1-829360';
    const runDir = path.join(directory, '.lnx', 'runtime', 'task_v3_r1', runId);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(path.join(runDir, 'meta.json'), JSON.stringify({
      schema: 1, run_id: runId, task: 'task_v3_r1', role: 'reviewer',
      model: metaModel, runner: 'runner-a',
    }));
    writeFileSync(path.join(runDir, 'exit-code'), '0');
    if (observed) writeFileSync(path.join(runDir, 'observed-model'), observed);

    const taskPath = path.join(directory, 'task.md');
    writeFileSync(taskPath, readFileSync(taskFixture('v3-r1-valid.md'), 'utf8').replace(
      /^model_execution:[\s\S]*$/m,
      'model_execution:\n'
      + '  executor:\n    combo: "combo-executor"\n    model: "modelo-que-executou"\n'
      + '  reviews:\n'
      + `    - combo: "${taskCombo}"\n      model: "${taskModel}"\n`
      + `      runner: "runner-a"\n      run_id: "${runId}"\n`
      + '      verdict: "approved"\n      findings: "sem achados"\n'
      + '      commit: "abc1234"\n      reviewed_at: "2026-09-21 09:30"\n---\n\n# x\n'));

    assertions(validate({
      taskPath, extra: ['--runtime-root', path.join(directory, '.lnx', 'runtime')],
    }));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('o modelo real na task convive com o combo no meta.json do run', () => {
  comRunDir({
    metaModel: 'combo-reviewer', taskCombo: 'combo-reviewer',
    taskModel: 'modelo-que-revisou', observed: 'modelo-que-revisou',
  }, (result) => {
    assert.equal(result.status, 0, result.stderr);
  });
});

test('combo divergente entre task e registro do run e recusado', () => {
  comRunDir({
    metaModel: 'combo-reviewer', taskCombo: 'combo-executor',
    taskModel: 'modelo-que-revisou', observed: 'modelo-que-revisou',
  }, (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /records combo combo-reviewer, but the task declares combo-executor/);
  });
});

// A prova de quem respondeu continua sendo o observado, e ela nao afrouxou.
test('modelo observado divergente do declarado continua sendo recusado', () => {
  comRunDir({
    metaModel: 'combo-reviewer', taskCombo: 'combo-reviewer',
    taskModel: 'outro-modelo', observed: 'modelo-que-revisou',
  }, (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ran on modelo-que-revisou, not on the declared outro-modelo/);
  });
});
