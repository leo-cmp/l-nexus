#!/usr/bin/env bash
# lnx-run v1 — supervised, visible delegation of one agent run.
#
# This script is deliberately configuration-free: the orchestrator reads
# `.ai/model-routing.yaml`, resolves role -> model+effort -> CLI runner ->
# terminal adapter, and passes the resolved values as explicit arguments. That
# keeps routing declarative and keeps this script small enough to audit.
#
# The opened window is user experience. The run directory is the contract:
# terminal emulators do not propagate exit codes portably, so `exit-code` and
# `status` inside the run directory are the authoritative result.
set -uo pipefail

LNX_RUN_SCHEMA=1
DEFAULT_TERMINAL_PREFERENCE='tmux gnome-terminal konsole xfce4-terminal kitty alacritty wezterm tilix terminator x-terminal-emulator xterm'
START_GRACE_SECONDS="${LNX_START_GRACE_SECONDS:-20}"

SCRIPT_PATH="$(readlink -f "$0" 2>/dev/null || realpath "$0" 2>/dev/null || printf '%s' "$0")"
SCRIPT_DIR="$(dirname "$SCRIPT_PATH")"
PTY_SUPERVISOR="$SCRIPT_DIR/lnx-pty.py"

if ! (mapfile -d '' -t _probe < /dev/null) 2>/dev/null; then
    printf 'lnx-run: requires bash 4.4 or newer (mapfile -d). Current: %s\n' "${BASH_VERSION:-unknown}" >&2
    exit 2
fi
unset _probe

die() {
    printf 'lnx-run: %s\n' "$1" >&2
    exit "${2:-1}"
}

usage() {
    cat <<'USAGE'
Usage:
  lnx-run.sh detect-terminal [--terminal NAME] [--terminal-preference a,b,c]
  lnx-run.sh start --task ID --role ROLE --runner NAME --runner-bin BIN
                   [--runner-arg ARG]... [--slot SLOT] [--model M] [--effort E]
                   [--prompt-file FILE] [--prompt-delivery argv|file|stdin]
                   [--attempt N] [--cwd DIR] [--run-root DIR]
                   [--terminal auto|none|NAME] [--terminal-cmd ARG]...
                   [--fallback block|inline] [--hold auto|always|never]
                   [--hold-seconds N] [--timeout SECONDS]
                   [--banner compact|full|none] [--detach]
                   [--io auto|broker|tty|pipe]
  lnx-run.sh send RUN_DIR --text TEXT | --text-file FILE [--no-enter] [--delay S]
                      [--paste auto|always|never]
  lnx-run.sh read RUN_DIR [--tail N] [--plain]
  lnx-run.sh supervise RUN_DIR
  lnx-run.sh status RUN_DIR
  lnx-run.sh wait RUN_DIR [--timeout SECONDS]

Placeholders substituted per argv element (never through a shell):
  {prompt}  prompt text (argv delivery) or prompt file path (file delivery)
  {model}   resolved model
  {effort}  resolved effort

Run directory contract:
  meta.json  status  exit-code  output.log  prompt.txt  command.txt  result.yaml
USAGE
}

sanitize() {
    printf '%s' "$1" | tr -c 'A-Za-z0-9._-' '_'
}

# Atomic so a reader never observes a half-written state.
write_state() {
    local file="$1" value="$2"
    printf '%s\n' "$value" > "$file.tmp" && mv -f "$file.tmp" "$file"
}

json_escape() {
    local value="$1"
    value="${value//\\/\\\\}"
    value="${value//\"/\\\"}"
    value="${value//$'\n'/\\n}"
    value="${value//$'\r'/\\r}"
    value="${value//$'\t'/\\t}"
    printf '%s' "$value"
}

graphical_session() {
    [ -n "${DISPLAY:-}" ] || [ -n "${WAYLAND_DISPLAY:-}" ]
}

adapter_binary() {
    case "$1" in
        x-terminal-emulator) printf 'x-terminal-emulator' ;;
        *) printf '%s' "$1" ;;
    esac
}

adapter_available() {
    local adapter="$1"
    case "$adapter" in
        custom) [ "${#TERMINAL_CMD[@]}" -gt 0 ] ;;
        tmux) [ -n "${TMUX:-}" ] && command -v tmux >/dev/null 2>&1 ;;
        *)
            graphical_session || return 1
            command -v "$(adapter_binary "$adapter")" >/dev/null 2>&1
            ;;
    esac
}

# Builds TERMINAL_ARGV for one adapter. The delegated command always changes
# directory itself, so a missing working-directory flag is cosmetic only.
build_terminal_argv() {
    local adapter="$1" title="$2" cwd="$3"
    shift 3
    TERMINAL_ARGV=()
    case "$adapter" in
        gnome-terminal)
            TERMINAL_ARGV=(gnome-terminal --title "$title" --working-directory "$cwd")
            [ "${LNX_TERMINAL_DETACHED:-false}" = true ] || TERMINAL_ARGV+=(--wait)
            TERMINAL_ARGV+=(-- "$@")
            ;;
        konsole)        TERMINAL_ARGV=(konsole -p "tabtitle=$title" --workdir "$cwd" -e "$@") ;;
        xfce4-terminal) TERMINAL_ARGV=(xfce4-terminal --title "$title" --working-directory "$cwd" --disable-server -x "$@") ;;
        kitty)          TERMINAL_ARGV=(kitty --title "$title" --directory "$cwd" "$@") ;;
        alacritty)      TERMINAL_ARGV=(alacritty --title "$title" --working-directory "$cwd" -e "$@") ;;
        wezterm)        TERMINAL_ARGV=(wezterm start --cwd "$cwd" -- "$@") ;;
        tilix)          TERMINAL_ARGV=(tilix --title "$title" --working-directory "$cwd" -e "$@") ;;
        terminator)     TERMINAL_ARGV=(terminator --title "$title" --working-directory "$cwd" -x "$@") ;;
        xterm)          TERMINAL_ARGV=(xterm -title "$title" -e "$@") ;;
        x-terminal-emulator) TERMINAL_ARGV=(x-terminal-emulator -T "$title" -e "$@") ;;
        tmux)           TERMINAL_ARGV=(tmux new-window -n "$title" -c "$cwd" "$@") ;;
        custom)
            local element
            for element in "${TERMINAL_CMD[@]}"; do
                case "$element" in
                    '{command}') TERMINAL_ARGV+=("$@") ;;
                    '{title}')   TERMINAL_ARGV+=("$title") ;;
                    '{cwd}')     TERMINAL_ARGV+=("$cwd") ;;
                    *)           TERMINAL_ARGV+=("$element") ;;
                esac
            done
            ;;
        *) return 1 ;;
    esac
}

resolve_terminal() {
    local requested="$1" preference="$2" adapter
    if [ -n "$requested" ] && [ "$requested" != auto ]; then
        if [ "$requested" = none ]; then
            printf 'none'
            return 0
        fi
        if adapter_available "$requested"; then
            printf '%s' "$requested"
            return 0
        fi
        return 1
    fi
    for adapter in $preference; do
        if adapter_available "$adapter"; then
            printf '%s' "$adapter"
            return 0
        fi
    done
    return 1
}

unavailable_reason() {
    if ! graphical_session && [ -z "${TMUX:-}" ]; then
        printf 'no graphical session (DISPLAY and WAYLAND_DISPLAY are unset) and no tmux session'
    else
        printf 'none of the preferred terminal adapters is installed'
    fi
}

read_state() {
    [ -f "$1" ] && tr -d '\n' < "$1"
}

# --- supervise -------------------------------------------------------------

command_supervise() {
    local run_dir="${1:-}"
    [ -n "$run_dir" ] || die 'supervise: RUN_DIR is required' 2
    [ -d "$run_dir" ] || die "supervise: run directory not found: $run_dir" 2
    run_dir="$(cd "$run_dir" && pwd -P)"

    local cwd delivery hold hold_seconds label banner io
    cwd="$(cat "$run_dir/cwd" 2>/dev/null || printf '%s' "$PWD")"
    delivery="$(read_state "$run_dir/prompt-delivery" || printf 'argv')"
    hold="$(read_state "$run_dir/hold" || printf 'auto')"
    banner="$(read_state "$run_dir/banner" || printf 'compact')"
    io="$(read_state "$run_dir/io" || printf 'pipe')"
    hold_seconds="$(read_state "$run_dir/hold-seconds" || printf '30')"
    case "$hold_seconds" in ''|*[!0-9]*) hold_seconds=30 ;; esac
    label="$(read_state "$run_dir/label" || printf 'run')"

    local argv=()
    mapfile -d '' -t argv < "$run_dir/command.argv"
    [ "${#argv[@]}" -gt 0 ] || die 'supervise: empty command' 2

    cd "$cwd" || die "supervise: cannot enter working directory: $cwd" 2
    # The broker publishes `running` itself, once the control channel exists and
    # the child is forked. Announcing it here would make `status` claim a session
    # is ready to receive input before it actually is.
    [ "$io" = broker ] || write_state "$run_dir/status" running

    printf '\033]0;%s\007' "$label" 2>/dev/null || true
    case "$banner" in
        none) ;;
        full)
            printf '=== l-nexus %s ===\n' "$label"
            printf 'run dir : %s\n' "$run_dir"
            printf 'cwd     : %s\n' "$cwd"
            printf 'command : %s\n\n' "$(cat "$run_dir/command.txt")"
            ;;
        *) printf '\033[2ml-nexus · %s\033[0m\n\n' "$label" ;;
    esac

    local exit_code
    if [ "$io" = broker ]; then
        # Owns the PTY master itself, so `send` can reach the agent's stdin.
        python3 "$PTY_SUPERVISOR" "$run_dir"
        exit_code=$?
    elif [ "$io" = tty ]; then
        # A pipe would make stdout a non-TTY and /dev/null would remove the
        # keyboard, so any interactive agent renders nothing. `script` gives the
        # child a real PTY, still captures everything and, with -e, still
        # returns the child's exit code.
        script -q -f -e -c "$(printf '%q ' "${BASH:-bash}" "$SCRIPT_PATH" exec-argv "$run_dir")" "$run_dir/output.log"
        exit_code=$?
    elif [ "$delivery" = stdin ]; then
        "${argv[@]}" < "$run_dir/prompt.txt" 2>&1 | tee "$run_dir/output.log"
        exit_code=${PIPESTATUS[0]}
    else
        "${argv[@]}" < /dev/null 2>&1 | tee "$run_dir/output.log"
        exit_code=${PIPESTATUS[0]}
    fi

    if [ "$io" != broker ]; then
        write_state "$run_dir/exit-code" "$exit_code"
        if [ "$exit_code" -eq 0 ]; then
            write_state "$run_dir/status" done
        else
            write_state "$run_dir/status" failed
        fi
    fi

    if [ "$banner" != none ]; then
        printf '\n\033[2ml-nexus · %s · exit %s\033[0m\n' "$label" "$exit_code"
    fi

    # Bounded so a held window can never block the orchestrator indefinitely.
    if [ "$hold" = always ] || { [ "$hold" = auto ] && [ "$exit_code" -ne 0 ]; }; then
        printf 'Window stays open for %ss (Enter closes it).\n' "$hold_seconds"
        read -r -t "$hold_seconds" _ || true
    fi
    return "$exit_code"
}

# Internal. Re-reads the NUL-delimited argv and execs it. Keeping this indirection
# means the shell string handed to `script -c` never carries task content, so a
# PTY costs us nothing in injection safety.
command_exec_argv() {
    local run_dir="${1:-}"
    [ -n "$run_dir" ] || die 'exec-argv: RUN_DIR is required' 2
    [ -f "$run_dir/command.argv" ] || die "exec-argv: command.argv not found in $run_dir" 2
    local argv=()
    mapfile -d '' -t argv < "$run_dir/command.argv"
    [ "${#argv[@]}" -gt 0 ] || die 'exec-argv: empty command' 2
    exec "${argv[@]}"
}

# --- send / read -----------------------------------------------------------

# Types into the delegated agent's session. Only `--io broker` runs a supervisor
# that owns the PTY master, so only that mode can accept input.
command_send() {
    local run_dir="${1:-}" text='' enter=true delay='0.3' bracketed=auto
    [ -n "$run_dir" ] || die 'send: RUN_DIR is required' 2
    shift || true
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --text) text="${2:-}"; shift 2 ;;
            --text-file)
                [ -f "${2:-}" ] || die "send: text file not found: ${2:-}" 2
                text="$(cat "$2")"; shift 2 ;;
            --no-enter) enter=false; shift ;;
            --paste) bracketed="${2:-auto}"; shift 2 ;;
            --delay) delay="${2:-0.3}"; shift 2 ;;
            *) die "send: unknown option $1" 2 ;;
        esac
    done
    [ -d "$run_dir" ] || die "send: run directory not found: $run_dir" 2

    local state io_mode
    state="$(read_state "$run_dir/status" || printf 'unknown')"
    io_mode="$(read_state "$run_dir/io" || printf 'unknown')"
    case "$state" in
        running) ;;
        *) die "send: the session is not running (status=$state)" 3 ;;
    esac
    if [ "$io_mode" != broker ]; then
        die "send: this run uses io=$io_mode, which cannot accept input; start it with --io broker" 3
    fi
    [ -p "$run_dir/control.in" ] || die "send: control channel is not available in $run_dir" 3

    # A TUI processes input key by key and redraws as it goes, so dumping a long
    # string raw can drop or reorder characters. Bracketed paste makes the whole
    # text arrive as one paste event instead. It is only used when the session
    # actually asked for it (CSI ?2004h), because otherwise the markers would be
    # typed in as literal garbage.
    local paste=false
    if [ "$bracketed" = auto ]; then
        if [ -f "$run_dir/output.log" ] && grep -q $'\033\[?2004h' "$run_dir/output.log"; then
            paste=true
        fi
    elif [ "$bracketed" = always ]; then
        paste=true
    fi

    {
        [ "$paste" = true ] && printf '\033[200~'
        printf '%s' "$text"
        [ "$paste" = true ] && printf '\033[201~'
    } > "$run_dir/control.in"

    if [ "$enter" = true ]; then
        # Submit is a separate write: bracketed paste deliberately does not treat
        # an embedded newline as "send", and TUIs debounce their input anyway.
        sleep "$delay"
        printf '\r' > "$run_dir/control.in"
    fi
    printf 'sent=%s bytes paste=%s\n' "${#text}" "$paste"
}

# Reads what the session printed. `--plain` strips terminal escape sequences,
# which is what an orchestrator wants; the raw log stays untouched on disk.
command_read() {
    local run_dir="${1:-}" tail_lines=0 plain=false
    [ -n "$run_dir" ] || die 'read: RUN_DIR is required' 2
    shift || true
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --tail) tail_lines="${2:-0}"; shift 2 ;;
            --plain) plain=true; shift ;;
            *) die "read: unknown option $1" 2 ;;
        esac
    done
    [ -f "$run_dir/output.log" ] || die "read: no output captured yet in $run_dir" 3
    case "$tail_lines" in ''|*[!0-9]*) die 'read: --tail must be a non-negative integer' 2 ;; esac

    local stream="$run_dir/output.log"
    if [ "$plain" = true ]; then
        tr -d '\r' < "$stream" \
            | sed -e 's/\x1b\][0-9]*;[^\x07]*\x07//g' \
                  -e 's/\x1b\[[0-9;?]*[a-zA-Z]//g' \
                  -e 's/\x1b[>=()][0-9;A-Za-z]*//g' \
                  -e 's/\x1b[PX^_][^\x1b]*\x1b\\//g' \
            | { [ "$tail_lines" -gt 0 ] && tail -n "$tail_lines" || cat; }
        return 0
    fi
    if [ "$tail_lines" -gt 0 ]; then tail -n "$tail_lines" "$stream"; else cat "$stream"; fi
}

# --- status / wait ---------------------------------------------------------

command_status() {
    local run_dir="${1:-}"
    [ -n "$run_dir" ] || die 'status: RUN_DIR is required' 2
    [ -d "$run_dir" ] || die "status: run directory not found: $run_dir" 2
    printf 'status=%s\n' "$(read_state "$run_dir/status" || printf 'unknown')"
    printf 'exit_code=%s\n' "$(read_state "$run_dir/exit-code" || printf 'unknown')"
    printf 'io=%s\n' "$(read_state "$run_dir/io" || printf 'unknown')"
    printf 'can_send=%s\n' "$([ -p "$run_dir/control.in" ] && printf 'true' || printf 'false')"
    printf 'result=%s\n' "$([ -f "$run_dir/result.yaml" ] && printf 'result.yaml' || printf 'missing')"
    printf 'log=%s\n' "$run_dir/output.log"
}

wait_for_run() {
    local run_dir="$1" timeout="$2" waited=0 state recorded
    while :; do
        state="$(read_state "$run_dir/status" || printf 'unknown')"
        case "$state" in
            done) return 0 ;;
            failed)
                # Terminal emulators do not propagate exit codes portably, so the
                # recorded code is replayed here to make both paths behave alike.
                recorded="$(read_state "$run_dir/exit-code" || printf '1')"
                case "$recorded" in ''|*[!0-9]*) recorded=1 ;; esac
                [ "$recorded" -gt 0 ] && [ "$recorded" -lt 256 ] || recorded=1
                return "$recorded"
                ;;
        esac
        if [ "$timeout" -gt 0 ] && [ "$waited" -ge "$timeout" ]; then
            die "wait: timed out after ${timeout}s with status=$state ($run_dir)" 3
        fi
        if [ "$state" = starting ] && [ "$waited" -ge "$START_GRACE_SECONDS" ]; then
            die "wait: the delegated run never started within ${START_GRACE_SECONDS}s ($run_dir)" 3
        fi
        sleep 1
        waited=$((waited + 1))
    done
}

command_wait() {
    local run_dir="${1:-}" timeout=0
    [ -n "$run_dir" ] || die 'wait: RUN_DIR is required' 2
    shift || true
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --timeout) timeout="${2:-0}"; shift 2 ;;
            *) die "wait: unknown option $1" 2 ;;
        esac
    done
    case "$timeout" in ''|*[!0-9]*) die 'wait: --timeout must be a non-negative integer' 2 ;; esac
    [ -d "$run_dir" ] || die "wait: run directory not found: $run_dir" 2
    wait_for_run "$run_dir" "$timeout"
}

# --- detect-terminal -------------------------------------------------------

command_detect_terminal() {
    local requested='' preference="$DEFAULT_TERMINAL_PREFERENCE" adapter
    TERMINAL_CMD=()
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --terminal) requested="${2:-}"; shift 2 ;;
            --terminal-preference) preference="$(printf '%s' "${2:-}" | tr ',' ' ')"; shift 2 ;;
            --terminal-cmd) TERMINAL_CMD+=("${2:-}"); shift 2 ;;
            *) die "detect-terminal: unknown option $1" 2 ;;
        esac
    done
    if adapter="$(resolve_terminal "$requested" "$preference")"; then
        printf 'terminal=%s\n' "$adapter"
    printf 'io=%s\n' "$io"
        return 0
    fi
    printf 'terminal=none\n'
    printf 'reason=%s\n' "$(unavailable_reason)"
    return 1
}

# --- start -----------------------------------------------------------------

command_start() {
    local task='' role='' slot='' model='' effort='' runner='' runner_bin=''
    local prompt_file='' delivery=argv attempt=1 cwd="$PWD" run_root=''
    local requested_terminal=auto preference="$DEFAULT_TERMINAL_PREFERENCE"
    local fallback=block hold=auto hold_seconds=30 timeout=0
    local banner=compact detach=false io=auto
    local runner_args=()
    TERMINAL_CMD=()

    while [ "$#" -gt 0 ]; do
        case "$1" in
            --task) task="${2:-}"; shift 2 ;;
            --role) role="${2:-}"; shift 2 ;;
            --slot) slot="${2:-}"; shift 2 ;;
            --model) model="${2:-}"; shift 2 ;;
            --effort) effort="${2:-}"; shift 2 ;;
            --runner) runner="${2:-}"; shift 2 ;;
            --runner-bin) runner_bin="${2:-}"; shift 2 ;;
            --runner-arg) runner_args+=("${2:-}"); shift 2 ;;
            --prompt-file) prompt_file="${2:-}"; shift 2 ;;
            --prompt-delivery) delivery="${2:-}"; shift 2 ;;
            --attempt) attempt="${2:-}"; shift 2 ;;
            --cwd) cwd="${2:-}"; shift 2 ;;
            --run-root) run_root="${2:-}"; shift 2 ;;
            --terminal) requested_terminal="${2:-}"; shift 2 ;;
            --terminal-preference) preference="$(printf '%s' "${2:-}" | tr ',' ' ')"; shift 2 ;;
            --terminal-cmd) TERMINAL_CMD+=("${2:-}"); shift 2 ;;
            --fallback) fallback="${2:-}"; shift 2 ;;
            --hold) hold="${2:-}"; shift 2 ;;
            --banner) banner="${2:-}"; shift 2 ;;
            --io) io="${2:-}"; shift 2 ;;
            --detach) detach=true; shift ;;
            --hold-seconds) hold_seconds="${2:-}"; shift 2 ;;
            --timeout) timeout="${2:-0}"; shift 2 ;;
            *) die "start: unknown option $1" 2 ;;
        esac
    done

    [ -n "$task" ] || die 'start: --task is required' 2
    [ -n "$role" ] || die 'start: --role is required' 2
    [ -n "$runner" ] || die 'start: --runner is required' 2
    [ -n "$runner_bin" ] || die 'start: --runner-bin is required' 2
    case "$delivery" in argv|file|stdin) ;; *) die "start: --prompt-delivery must be argv, file or stdin" 2 ;; esac
    case "$fallback" in block|inline) ;; *) die 'start: --fallback must be block or inline' 2 ;; esac
    case "$hold" in auto|always|never) ;; *) die 'start: --hold must be auto, always or never' 2 ;; esac
    case "$banner" in compact|full|none) ;; *) die 'start: --banner must be compact, full or none' 2 ;; esac
    case "$io" in auto|broker|tty|pipe) ;; *) die 'start: --io must be auto, broker, tty or pipe' 2 ;; esac
    if [ "$io" = broker ] || [ "$io" = tty ]; then
        [ "$delivery" != stdin ] || die "start: --io $io cannot deliver the prompt on stdin; the PTY owns stdin" 2
    fi
    if [ "$io" = broker ]; then
        command -v python3 >/dev/null 2>&1 || die 'start: --io broker needs python3, which is not installed' 2
        [ -f "$PTY_SUPERVISOR" ] || die "start: PTY supervisor not found: $PTY_SUPERVISOR" 2
    fi
    if [ "$io" = tty ]; then
        command -v script >/dev/null 2>&1 || die 'start: --io tty needs util-linux `script`, which is not installed' 2
    fi
    if [ "$io" = auto ]; then
        # Prefer the broker: it is the only mode where the orchestrator can talk
        # back to the delegated agent. Then a plain PTY, then the pipe.
        if [ "$delivery" = stdin ]; then io=pipe
        elif command -v python3 >/dev/null 2>&1 && [ -f "$PTY_SUPERVISOR" ]; then io=broker
        elif command -v script >/dev/null 2>&1; then io=tty
        else io=pipe
        fi
    fi
    case "$hold_seconds" in ''|*[!0-9]*) die 'start: --hold-seconds must be a non-negative integer' 2 ;; esac
    case "$timeout" in ''|*[!0-9]*) die 'start: --timeout must be a non-negative integer' 2 ;; esac
    case "$attempt" in ''|*[!0-9]*) die 'start: --attempt must be a non-negative integer' 2 ;; esac
    [ -d "$cwd" ] || die "start: --cwd is not a directory: $cwd" 2
    cwd="$(cd "$cwd" && pwd -P)"
    command -v "$runner_bin" >/dev/null 2>&1 || die "start: CLI runner binary not found: $runner_bin" 2
    if [ "$delivery" != argv ] || [ -n "$prompt_file" ]; then
        [ -n "$prompt_file" ] || die "start: --prompt-file is required for --prompt-delivery $delivery" 2
        [ -f "$prompt_file" ] || die "start: prompt file not found: $prompt_file" 2
    fi

    [ -n "$run_root" ] || run_root="$cwd/.lnx/runtime"
    local run_id run_dir
    run_id="$(date -u +%Y%m%dT%H%M%SZ)-$(sanitize "$role")-$(sanitize "$attempt")-$$"
    run_dir="$run_root/$(sanitize "$task")/$run_id"
    mkdir -p "$run_dir" || die "start: cannot create run directory: $run_dir"
    run_dir="$(cd "$run_dir" && pwd -P)"

    if [ -n "$prompt_file" ]; then
        cp "$prompt_file" "$run_dir/prompt.txt" || die 'start: cannot copy the prompt file'
        chmod 600 "$run_dir/prompt.txt" 2>/dev/null || true
    fi

    # Placeholders are substituted one argv element at a time, so task content
    # can never be reinterpreted as shell syntax.
    local prompt_value='' argv=("$runner_bin") element
    case "$delivery" in
        argv) [ -n "$prompt_file" ] && prompt_value="$(cat "$run_dir/prompt.txt")" ;;
        file) prompt_value="$run_dir/prompt.txt" ;;
    esac
    for element in ${runner_args[@]+"${runner_args[@]}"}; do
        case "$element" in
            '{prompt}')
                [ "$delivery" != stdin ] || die 'start: {prompt} is not allowed with --prompt-delivery stdin' 2
                argv+=("$prompt_value")
                ;;
            '{model}') argv+=("$model") ;;
            '{effort}') argv+=("$effort") ;;
            *) argv+=("$element") ;;
        esac
    done

    printf '%s\0' "${argv[@]}" > "$run_dir/command.argv"
    printf '%q ' "${argv[@]}" > "$run_dir/command.txt"
    printf '\n' >> "$run_dir/command.txt"
    printf '%s' "$cwd" > "$run_dir/cwd"
    write_state "$run_dir/prompt-delivery" "$delivery"
    write_state "$run_dir/hold" "$hold"
    write_state "$run_dir/hold-seconds" "$hold_seconds"
    write_state "$run_dir/banner" "$banner"
    write_state "$run_dir/io" "$io"

    local label="$task $role"
    [ -n "$slot" ] && label="$label/$slot"
    [ -n "$model" ] && label="$label $model"
    [ -n "$effort" ] && label="$label:$effort"
    label="$label #$attempt"
    write_state "$run_dir/label" "$label"

    local adapter
    if ! adapter="$(resolve_terminal "$requested_terminal" "$preference")"; then
        write_state "$run_dir/status" blocked
        if [ "$fallback" = block ]; then
            printf 'run_dir=%s\n' "$run_dir"
            printf 'terminal=none\n'
            die "no visible terminal could be opened: $(unavailable_reason). Re-run with --fallback inline to execute in this terminal, or set --terminal-cmd for a custom adapter."
        fi
        adapter=inline
    fi
    if [ "$requested_terminal" = none ]; then adapter=inline; fi

    cat > "$run_dir/meta.json" <<META
{
  "schema": $LNX_RUN_SCHEMA,
  "run_id": "$(json_escape "$run_id")",
  "task": "$(json_escape "$task")",
  "role": "$(json_escape "$role")",
  "slot": "$(json_escape "$slot")",
  "model": "$(json_escape "$model")",
  "effort": "$(json_escape "$effort")",
  "runner": "$(json_escape "$runner")",
  "runner_bin": "$(json_escape "$runner_bin")",
  "attempt": "$(json_escape "$attempt")",
  "terminal": "$(json_escape "$adapter")",
  "prompt_delivery": "$(json_escape "$delivery")",
  "io": "$(json_escape "$io")",
  "cwd": "$(json_escape "$cwd")",
  "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
META
    write_state "$run_dir/status" starting

    printf 'run_dir=%s\n' "$run_dir"
    printf 'terminal=%s\n' "$adapter"
    printf 'io=%s\n' "$io"
    printf 'label=%s\n' "$label"

    if [ "$adapter" = inline ]; then
        [ "$detach" = false ] || die 'start: --detach requires a visible terminal; it is refused for inline execution' 2
        command_supervise "$run_dir"
        return $?
    fi

    export LNX_TERMINAL_DETACHED="$detach"
    if ! build_terminal_argv "$adapter" "$label" "$cwd" "${BASH:-bash}" "$SCRIPT_PATH" supervise "$run_dir"; then
        write_state "$run_dir/status" blocked
        die "unsupported terminal adapter: $adapter"
    fi
    if [ "$detach" = true ]; then
        # The agent is fully visible in its own window and the human drives it.
        # Only the launcher's wait is released, so nothing is ever hidden. This
        # is refused for inline/none precisely because that WOULD hide it.
        ("${TERMINAL_ARGV[@]}" >/dev/null 2>&1 &)
        printf 'detached=true\n'
        return 0
    fi
    "${TERMINAL_ARGV[@]}" || true
    wait_for_run "$run_dir" "$timeout"
}

case "${1:-}" in
    detect-terminal) shift; command_detect_terminal "$@" ;;
    start) shift; command_start "$@" ;;
    supervise) shift; command_supervise "$@" ;;
    exec-argv) shift; command_exec_argv "$@" ;;
    status) shift; command_status "$@" ;;
    send) shift; command_send "$@" ;;
    read) shift; command_read "$@" ;;
    wait) shift; command_wait "$@" ;;
    --help|-h|'') usage ;;
    *) usage >&2; die "unknown subcommand: $1" 2 ;;
esac
