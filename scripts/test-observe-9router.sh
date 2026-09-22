#!/usr/bin/env bash
# O observador e best-effort por contrato: ele roda ao fim de TODA execucao
# delegada, e falhar nunca pode derrubar o trabalho do agente. Metade destes
# testes existe para provar que ele fica quieto -- a outra metade, que quando
# fala, fala a verdade.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
OBS="$ROOT_DIR/src/.agents/scripts/lnx-observe-9router.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

falhas=0
fail() { echo "FAIL: $*" >&2; falhas=$((falhas + 1)); }

# Banco sintetico: o teste nao pode depender do 9router da maquina estar
# instalado, rodando, ou tendo servido alguma coisa hoje.
DB="$TMP_DIR/data.sqlite"
python3 - "$DB" <<'PY'
import sqlite3, sys
c = sqlite3.connect(sys.argv[1])
c.execute("create table combos (id integer, name text, kind text, models text)")
c.execute("create table usageHistory (id integer primary key, timestamp text, provider text, model text, status text)")
c.execute("insert into combos values (1, 'combo-exec', 'pool', ?)",
          ('["prov-a/modelo-exec","prov-b/modelo-alternativo"]',))
c.execute("insert into combos values (2, 'combo-test', 'pool', ?)", ('["prov-a/modelo-test"]',))
linhas = [
    # dentro da janela, membro do combo pedido: e este que deve ser reportado
    *[('2026-09-22T10:00:%02dZ' % s, 'prov-a', 'modelo-exec', 'ok') for s in range(10, 40)],
    # dentro da janela, mas de OUTRO combo -- a sessao paralela que nao e deste run
    *[('2026-09-22T10:00:%02dZ' % s, 'prov-a', 'modelo-test', 'ok') for s in range(40, 50)],
    # fora da janela
    ('2026-09-22T09:00:00Z', 'prov-a', 'modelo-antigo', 'ok'),
    ('2026-09-22T23:00:00Z', 'prov-a', 'modelo-futuro', 'ok'),
]
c.executemany("insert into usageHistory (timestamp, provider, model, status) values (?,?,?,?)", linhas)
c.commit()
PY

run_dir() {
    local d="$TMP_DIR/$1" combo="$2"
    mkdir -p "$d"
    printf '{"run_id":"20260922T100000Z-executor-1-111111","model":"%s"}' "$combo" > "$d/meta.json"
    touch -d '2026-09-22T10:01:00Z' "$d/exit-code" 2>/dev/null || touch "$d/exit-code"
    printf '%s' "$d"
}

observe() { LNX_9ROUTER_DB="$DB" bash "$OBS" "$@" 2>/dev/null; }

# --- o que ele deve afirmar -------------------------------------------------

# O trabalho principal do run, e nao a sessao paralela que rodou na mesma janela.
saida="$(observe "$(run_dir ok combo-exec)")"
[ "$saida" = "modelo-exec" ] ||
    fail "deveria reportar modelo-exec, reportou '$saida'"

# --- o que ele deve calar ---------------------------------------------------

# Cada um destes ja aconteceu ou acontece: o observador roda em maquina que pode
# nao ter o gateway, com run interrompido, ou com combo renomeado no catalogo.
for caso in \
    "sem argumento:" \
    "run_dir inexistente:$TMP_DIR/nao-existe" \
    "run_dir sem meta.json:$TMP_DIR"
do
    nome="${caso%%:*}"; arg="${caso#*:}"
    saida="$(observe ${arg:+"$arg"})"
    [ -z "$saida" ] || fail "$nome: deveria calar, disse '$saida'"
done

# Combo que o catalogo do gateway nao conhece: sem saber quais modelos podem ter
# atendido, nao ha como separar este run de outra sessao simultanea. Calar.
saida="$(observe "$(run_dir semcombo combo-inexistente)")"
[ -z "$saida" ] || fail "combo desconhecido: deveria calar, disse '$saida'"

# Janela sem nenhuma requisicao do combo.
d="$TMP_DIR/vazio"; mkdir -p "$d"
printf '{"run_id":"20260101T000000Z-executor-1-222222","model":"combo-exec"}' > "$d/meta.json"
saida="$(observe "$d")"
[ -z "$saida" ] || fail "janela vazia: deveria calar, disse '$saida'"

# Banco ausente e banco corrompido: a maquina pode simplesmente nao ter 9router.
saida="$(LNX_9ROUTER_DB="$TMP_DIR/nao-existe.sqlite" bash "$OBS" "$TMP_DIR/ok" 2>/dev/null)"
[ -z "$saida" ] || fail "db ausente: deveria calar, disse '$saida'"

printf 'nao sou um banco' > "$TMP_DIR/lixo.sqlite"
saida="$(LNX_9ROUTER_DB="$TMP_DIR/lixo.sqlite" bash "$OBS" "$TMP_DIR/ok" 2>/dev/null)"
[ -z "$saida" ] || fail "db corrompido: deveria calar, disse '$saida'"

# --- nunca derruba o run ----------------------------------------------------

# O lnx-run.sh chama o observador ao fim de toda execucao. Exit diferente de zero
# aqui nao quebra nada hoje, mas o contrato e esse e vale prova-lo.
for arg in "" "$TMP_DIR/nao-existe" "$TMP_DIR/ok"; do
    LNX_9ROUTER_DB="$DB" bash "$OBS" ${arg:+"$arg"} >/dev/null 2>&1
    [ "$?" -eq 0 ] || fail "exit diferente de zero para argumento '${arg:-<vazio>}'"
done

# O banco do gateway e lido por copia: ele esta servindo requisicoes enquanto
# isto roda, e disputar lock com quem serve seria trocar um problema por outro.
antes="$(stat -c %Y "$DB")"
observe "$TMP_DIR/ok" >/dev/null
[ "$(stat -c %Y "$DB")" = "$antes" ] ||
    fail "o banco do gateway foi modificado pela leitura"

[ "$falhas" -eq 0 ] || exit 1
echo "scripts/test-observe-9router.sh: ok"
