#!/usr/bin/env bash
# Observador de modelo para o gateway 9router.
#
# O kit define onde a evidencia mora (`observed-model` no run dir); a maquina
# define como obte-la. Este e o "como" para quem roteia por 9router: o gateway
# registra cada requisicao em ~/.9router/db/data.sqlite, com o modelo que de
# fato atendeu, e este script cruza esse registro com a janela de tempo do run.
#
# Uso, na chamada do lnx-run.sh:
#   --observe-bin .agents/scripts/lnx-observe-9router.sh --observe-arg '{run_dir}'
#
# Saida (contrato do --observe-bin):
#   linha 1  o modelo que atendeu
#   linha 2  (nao emitida: o 9router nao reporta o esforco aplicado)
#
# Sem saida = sem evidencia, e a task registra `unknown`. Isso e resultado
# valido: melhor nao dizer nada do que dizer um nome que ninguem observou.
# Foi de um palpite assim que saiu um `claude-sonnet-5` numa execucao que o
# gateway serviu com longcat-2.0.

set -uo pipefail

RUN_DIR="${1:-}"
DB="${LNX_9ROUTER_DB:-$HOME/.9router/db/data.sqlite}"

[ -n "$RUN_DIR" ] && [ -d "$RUN_DIR" ] || exit 0
[ -f "$DB" ] || exit 0
command -v python3 >/dev/null 2>&1 || exit 0

# A leitura e feita sobre uma COPIA. O 9router escreve nesse banco enquanto roda
# (ha -wal e -shm ao lado), e abrir o arquivo vivo de dentro de um hook que roda
# ao fim de toda execucao e pedir para disputar lock com o gateway. Copia sai
# barato e nao toca no estado de quem esta servindo.
TMP="$(mktemp -t lnx-9router-XXXXXX.sqlite 2>/dev/null)" || exit 0
trap 'rm -f "$TMP" "$TMP"-wal "$TMP"-shm' EXIT
cp "$DB" "$TMP" 2>/dev/null || exit 0
[ -f "$DB-wal" ] && cp "$DB-wal" "$TMP-wal" 2>/dev/null
[ -f "$DB-shm" ] && cp "$DB-shm" "$TMP-shm" 2>/dev/null

python3 - "$TMP" "$RUN_DIR" <<'PY'
import json, os, re, sqlite3, sys
from datetime import datetime, timedelta, timezone

db, run_dir = sys.argv[1], sys.argv[2]

def die():
    # Silencio e a resposta certa quando nao ha evidencia: o lnx-run.sh nao
    # escreve `observed-model`, e a task registra `unknown`.
    sys.exit(0)

try:
    meta = json.load(open(os.path.join(run_dir, "meta.json")))
except Exception:
    die()

# `meta.json.model` guarda o que foi PEDIDO -- na schema 3, o nome do combo.
# Ele nao serve como resposta (registrar isso e o erro que o validador recusa),
# mas serve para saber QUAIS modelos podem legitimamente ter atendido.
combo = str(meta.get("model") or "").strip()
run_id = str(meta.get("run_id") or os.path.basename(run_dir))

# O run_id comeca com o instante de inicio: 20260922T174820Z-executor-1-789147.
m = re.match(r"(\d{8})T(\d{6})Z", run_id)
if not m:
    die()
inicio = datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)

# O fim da janela e quando o run terminou. `exit-code` e escrito nesse momento;
# sem ele (sessao ainda viva), vale agora.
try:
    fim = datetime.fromtimestamp(os.path.getmtime(os.path.join(run_dir, "exit-code")), timezone.utc)
except OSError:
    fim = datetime.now(timezone.utc)
if fim <= inicio:
    fim = datetime.now(timezone.utc)

# Teto da janela. Sem `exit-code` -- sessao interativa ainda viva, ou run que
# morreu sem registrar -- o fim seria "agora", e um run aberto ontem varreria
# tudo o que o gateway serviu desde entao, atribuindo a ele o trabalho de outras
# sessoes. Nenhuma execucao de agente dura seis horas; passando disso, a
# correlacao por tempo deixa de significar qualquer coisa e e melhor nao afirmar.
TETO = timedelta(hours=6)
if fim - inicio > TETO:
    die()

# Folga de um minuto: o relogio do run_id e o do gateway nao sao o mesmo relogio.
inicio -= timedelta(minutes=1)
fim += timedelta(minutes=1)

try:
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
except Exception:
    die()

# Uma sessao de agente abre varios modelos ao mesmo tempo: o Claude Code manda
# tarefa pequena para o combo de haiku enquanto o trabalho principal roda no
# combo pedido. Filtrar a janela apenas por tempo confundiria os dois. Os
# membros do combo dizem quais nomes podem contar aqui.
membros = set()
try:
    linha = con.execute("select models from combos where name = ?", (combo,)).fetchone()
    if linha and linha[0]:
        for nome in json.loads(linha[0]):
            # Os membros vem prefixados pelo provedor ("ocg/longcat-2.0"); o
            # registro de uso guarda so o nome do modelo.
            membros.add(str(nome).split("/", 1)[-1])
except Exception:
    membros = set()

# Sem saber quais modelos o combo pode servir, nao ha como separar o trabalho
# deste run do de outra sessao que rodava ao mesmo tempo -- e duas sessoes em
# paralelo sao o caso normal, nao a excecao. Reportar o dominante da janela aqui
# seria atribuir a este run um modelo que talvez tenha atendido outro. Sem filtro
# nao ha afirmacao.
if not membros:
    die()

try:
    linhas = con.execute(
        "select model from usageHistory where timestamp >= ? and timestamp <= ? and status = 'ok'",
        (inicio.strftime("%Y-%m-%dT%H:%M:%S.000Z"), fim.strftime("%Y-%m-%dT%H:%M:%S.999Z")),
    ).fetchall()
except Exception:
    die()

contagem = {}
for (modelo,) in linhas:
    modelo = str(modelo or "").strip()
    if not modelo:
        continue
    if membros and modelo not in membros:
        continue
    contagem[modelo] = contagem.get(modelo, 0) + 1

if not contagem:
    die()

# Com fallback de quota o gateway troca de modelo no meio da sessao, e mais de um
# membro aparece. O campo da task e singular, entao vale o que atendeu a maior
# parte das requisicoes -- e a afirmacao mais verdadeira que cabe numa linha.
print(max(contagem.items(), key=lambda kv: (kv[1], kv[0]))[0])
PY
