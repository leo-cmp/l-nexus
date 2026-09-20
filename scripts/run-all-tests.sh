#!/usr/bin/env bash
# Roda todas as suites do repositorio e falha se qualquer uma falhar.
#
# A lista e descoberta por glob, nao escrita a mao. Uma lista fixa envelhece em
# silencio: a proxima suite que alguem acrescentar nao roda, e o verde continua
# verde -- que e exatamente o tipo de gate falso que este repositorio existe para
# impedir.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
SAIDA="$(mktemp -d)"
trap 'rm -rf "$SAIDA"' EXIT

total=0
falhas=0
nomes_falhos=()

# `test-*.mjs` e `test-*.sh` e a convencao do diretorio. O sort deixa a ordem
# estavel entre maquinas, para duas execucoes serem comparaveis.
for caminho in $(printf '%s\n' "$SCRIPT_DIR"/test-*.mjs "$SCRIPT_DIR"/test-*.sh | sort); do
    [ -f "$caminho" ] || continue
    suite="$(basename "$caminho")"
    total=$((total + 1))
    printf '  %-38s ' "$suite"

    case "$suite" in
        *.mjs) comando=(node "$caminho") ;;
        *)     comando=(bash "$caminho") ;;
    esac

    # stdin fechado de proposito: suite que espera Enter travaria a execucao
    # inteira, e um CI travado e pior que um CI vermelho.
    if timeout 300 "${comando[@]}" < /dev/null > "$SAIDA/$suite.log" 2>&1; then
        printf 'ok\n'
    else
        codigo=$?
        printf 'FALHOU (exit %s)\n' "$codigo"
        falhas=$((falhas + 1))
        nomes_falhos+=("$suite")
    fi
done

printf '\n%s de %s passaram\n' "$((total - falhas))" "$total"

if [ "$falhas" -gt 0 ]; then
    for suite in "${nomes_falhos[@]}"; do
        printf '\n--- %s ---\n' "$suite"
        tail -n 40 "$SAIDA/$suite.log"
    done
    exit 1
fi

exit 0
