#!/usr/bin/env bash
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
RUNNER="$ROOT_DIR/src/.agents/scripts/lnx-run.sh"
TMP_DIR="$(mktemp -d)"

cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

fail() {
    echo "FAIL: $*" >&2
    exit 1
}

PROJECT="$TMP_DIR/project"
BIN="$TMP_DIR/bin"
mkdir -p "$PROJECT" "$BIN"

# A stand-in CLI runner: echoes its argv and stdin so the test can assert that
# nothing was reinterpreted by a shell on the way in.
cat > "$BIN/fake-agent" <<'AGENT'
#!/usr/bin/env bash
[ -t 0 ] && echo "STDIN=tty" || echo "STDIN=pipe"
[ -t 1 ] && echo "STDOUT=tty" || echo "STDOUT=pipe"
echo "ARGC=$#"
for arg in "$@"; do echo "ARG=[$arg]"; done
if [ ! -t 0 ]; then echo "STDIN=[$(cat)]"; fi
exit "${FAKE_AGENT_EXIT:-0}"
AGENT
chmod +x "$BIN/fake-agent"
export PATH="$BIN:$PATH"

# Every case runs headless on purpose: no DISPLAY, no Wayland, no tmux.
headless() {
    env -u DISPLAY -u WAYLAND_DISPLAY -u TMUX "$@"
}

# --- detection is honest when nothing can be opened ------------------------

output="$(headless "$RUNNER" detect-terminal 2>&1)"
status=$?
[ "$status" -ne 0 ] || fail "detect-terminal reported success without a graphical session"
grep -q '^terminal=none$' <<<"$output" || fail "detect-terminal did not report terminal=none"
grep -q 'no graphical session' <<<"$output" || fail "detect-terminal did not explain the limitation"

# --- an explicitly named but unavailable adapter never degrades silently ----

output="$(headless "$RUNNER" detect-terminal --terminal gnome-terminal 2>&1)"
[ $? -ne 0 ] || fail "an unavailable named adapter was reported as usable"

# --- block is the default when no terminal can be opened -------------------

printf 'do the work\n' > "$TMP_DIR/prompt.txt"
output="$(headless "$RUNNER" start \
    --task TASK-1 --role executor --slot default --model model-x --effort high \
    --runner fake --runner-bin fake-agent \
    --runner-arg --model --runner-arg '{model}' --runner-arg '{prompt}' \
    --prompt-file "$TMP_DIR/prompt.txt" --cwd "$PROJECT" --hold never 2>&1)"
status=$?
[ "$status" -ne 0 ] || fail "start succeeded even though no terminal could be opened"
grep -q 'no visible terminal could be opened' <<<"$output" || fail "start did not report the terminal limitation"
run_dir="$(sed -n 's/^run_dir=//p' <<<"$output")"
[ -n "$run_dir" ] || fail "start did not report a run directory when blocking"
[ "$(cat "$run_dir/status")" = blocked ] || fail "a blocked start did not record status=blocked"
[ ! -f "$run_dir/output.log" ] || fail "a blocked start executed the delegated command anyway"

# --- inline fallback is visible, supervised and complete -------------------

output="$(headless "$RUNNER" start \
    --task TASK-1 --role executor --slot default --model model-x --effort high \
    --runner fake --runner-bin fake-agent \
    --runner-arg --model --runner-arg '{model}' --runner-arg --effort --runner-arg '{effort}' \
    --runner-arg '{prompt}' \
    --prompt-file "$TMP_DIR/prompt.txt" --cwd "$PROJECT" \
    --fallback inline --hold never 2>&1)"
status=$?
[ "$status" -eq 0 ] || fail "inline fallback failed: $output"
run_dir="$(sed -n 's/^run_dir=//p' <<<"$output")"
grep -q '^terminal=inline$' <<<"$output" || fail "inline fallback did not report its adapter"
[ "$(cat "$run_dir/status")" = done ] || fail "a successful run did not record status=done"
[ "$(cat "$run_dir/exit-code")" = 0 ] || fail "a successful run did not record exit code 0"
grep -q 'ARG=\[model-x\]' "$run_dir/output.log" || fail "{model} was not substituted"
grep -q 'ARG=\[high\]' "$run_dir/output.log" || fail "{effort} was not substituted"
grep -q 'ARG=\[do the work\]' "$run_dir/output.log" || fail "{prompt} was not substituted"
[ -f "$run_dir/meta.json" ] || fail "meta.json was not written"
grep -q '"role": "executor"' "$run_dir/meta.json" || fail "meta.json lost the role"
grep -q '"slot": "default"' "$run_dir/meta.json" || fail "meta.json lost the slot"

status_output="$("$RUNNER" status "$run_dir")"
grep -q '^status=done$' <<<"$status_output" || fail "status subcommand did not report done"
grep -q '^result=missing$' <<<"$status_output" || fail "status did not flag the missing result artifact"
"$RUNNER" wait "$run_dir" || fail "wait did not succeed for a finished run"

# --- prompt content is data, never shell syntax ----------------------------

printf 'oops"; touch %s/pwned; echo "$(touch %s/pwned2)\n' "$TMP_DIR" "$TMP_DIR" > "$TMP_DIR/evil.txt"
output="$(headless "$RUNNER" start \
    --task TASK-2 --role executor --runner fake --runner-bin fake-agent \
    --runner-arg '{prompt}' --prompt-file "$TMP_DIR/evil.txt" --cwd "$PROJECT" \
    --fallback inline --hold never 2>&1)"
[ $? -eq 0 ] || fail "the injection case did not run: $output"
run_dir="$(sed -n 's/^run_dir=//p' <<<"$output")"
[ ! -e "$TMP_DIR/pwned" ] && [ ! -e "$TMP_DIR/pwned2" ] || fail "prompt content escaped into the shell"
grep -q 'ARGC=1' "$run_dir/output.log" || fail "the prompt was split into several arguments"

# --- stdin delivery --------------------------------------------------------

output="$(headless "$RUNNER" start \
    --task TASK-3 --role tester --runner fake --runner-bin fake-agent \
    --prompt-file "$TMP_DIR/prompt.txt" --prompt-delivery stdin --cwd "$PROJECT" \
    --fallback inline --hold never 2>&1)"
[ $? -eq 0 ] || fail "stdin delivery failed: $output"
run_dir="$(sed -n 's/^run_dir=//p' <<<"$output")"
grep -q 'STDIN=\[do the work\]' "$run_dir/output.log" || fail "the prompt did not reach stdin"

output="$(headless "$RUNNER" start \
    --task TASK-3 --role tester --runner fake --runner-bin fake-agent \
    --runner-arg '{prompt}' --prompt-file "$TMP_DIR/prompt.txt" --prompt-delivery stdin \
    --cwd "$PROJECT" --fallback inline --hold never 2>&1)"
[ $? -ne 0 ] || fail "{prompt} was accepted together with stdin delivery"

# --- a failing delegated command is recorded, not hidden -------------------

output="$(headless env FAKE_AGENT_EXIT=7 "$RUNNER" start \
    --task TASK-4 --role executor --runner fake --runner-bin fake-agent \
    --cwd "$PROJECT" --fallback inline --hold never 2>&1)"
status=$?
[ "$status" -eq 7 ] || fail "start did not propagate the delegated exit code (got $status)"
run_dir="$(sed -n 's/^run_dir=//p' <<<"$output")"
[ "$(cat "$run_dir/status")" = failed ] || fail "a failing run did not record status=failed"
[ "$(cat "$run_dir/exit-code")" = 7 ] || fail "a failing run did not record its exit code"
"$RUNNER" wait "$run_dir" && fail "wait reported success for a failed run"

# --- misconfiguration is rejected up front ---------------------------------

headless "$RUNNER" start --task TASK-5 --role executor --runner fake \
    --runner-bin definitely-not-installed --cwd "$PROJECT" --fallback inline 2>/dev/null &&
    fail "start accepted a missing runner binary"

headless "$RUNNER" start --role executor --runner fake --runner-bin fake-agent \
    --cwd "$PROJECT" --fallback inline 2>/dev/null &&
    fail "start accepted a missing --task"

# --- a custom adapter keeps the abstraction extensible ---------------------

cat > "$BIN/fake-terminal" <<'TERMINAL'
#!/usr/bin/env bash
# The launcher backgrounds the emulator, so the adapter records what it received
# to a file instead of stdout.
printf '%s' "$1" > "$LNX_TEST_TITLE_FILE"
shift 2
exec "$@"
TERMINAL
chmod +x "$BIN/fake-terminal"

export LNX_TEST_TITLE_FILE="$TMP_DIR/terminal-title.txt"
output="$(headless "$RUNNER" start \
    --task TASK-6 --role reviewer --runner fake --runner-bin fake-agent \
    --cwd "$PROJECT" --terminal custom \
    --terminal-cmd fake-terminal --terminal-cmd '{title}' --terminal-cmd '{cwd}' \
    --terminal-cmd '{command}' --hold never 2>&1)"
[ $? -eq 0 ] || fail "the custom terminal adapter failed: $output"
grep -q '^terminal=custom$' <<<"$output" || fail "the custom adapter was not selected"
run_dir="$(sed -n 's/^run_dir=//p' <<<"$output")"
[ "$(cat "$run_dir/status")" = done ] || fail "the custom adapter did not complete the run"
grep -q 'TASK-6 reviewer' "$LNX_TEST_TITLE_FILE" || fail "the custom adapter did not receive {title}"
grep -q 'ARGC=' "$run_dir/output.log" || fail "the custom adapter did not run the delegated command"

output="$(headless env FAKE_AGENT_EXIT=9 "$RUNNER" start \
    --task TASK-7 --role executor --runner fake --runner-bin fake-agent \
    --cwd "$PROJECT" --terminal custom \
    --terminal-cmd fake-terminal --terminal-cmd '{title}' --terminal-cmd '{cwd}' \
    --terminal-cmd '{command}' --hold never 2>&1)"
status=$?
[ "$status" -eq 9 ] || fail "the terminal path did not replay the recorded exit code (got $status)"

# --- a PTY is what lets an interactive agent render at all -----------------
# (and the broker is preferred over a plain PTY because it also accepts input)

output="$(headless "$RUNNER" start \
    --task TASK-TTY --role executor --runner fake --runner-bin fake-agent \
    --runner-arg '{prompt}' --prompt-file "$TMP_DIR/prompt.txt" --cwd "$PROJECT" \
    --fallback inline --hold never 2>&1)"
[ $? -eq 0 ] || fail "the default IO mode failed: $output"
grep -q '^io=broker$' <<<"$output" || fail "the broker was available but was not chosen by default"
run_dir="$(sed -n 's/^run_dir=//p' <<<"$output")"
grep -q 'STDOUT=tty' "$run_dir/output.log" || fail "the delegated agent did not get a terminal on stdout"
grep -q 'STDIN=tty' "$run_dir/output.log" || fail "the delegated agent did not get a terminal on stdin"
grep -q 'ARGC=1' "$run_dir/output.log" || fail "the prompt was split into several arguments under a PTY"
[ "$(cat "$run_dir/status")" = done ] || fail "the PTY run did not complete"

# Task content must stay out of the shell string that `script -c` receives.
printf 'oops"; touch %s/pty-pwned; echo "\n' "$TMP_DIR" > "$TMP_DIR/evil-tty.txt"
output="$(headless "$RUNNER" start \
    --task TASK-TTY2 --role executor --runner fake --runner-bin fake-agent \
    --runner-arg '{prompt}' --prompt-file "$TMP_DIR/evil-tty.txt" --cwd "$PROJECT" \
    --fallback inline --hold never 2>&1)"
[ $? -eq 0 ] || fail "the PTY injection case did not run: $output"
[ ! -e "$TMP_DIR/pty-pwned" ] || fail "prompt content escaped into the shell under a PTY"

# An exit code still has to survive the PTY layer.
output="$(headless env FAKE_AGENT_EXIT=5 "$RUNNER" start \
    --task TASK-TTY3 --role executor --runner fake --runner-bin fake-agent \
    --cwd "$PROJECT" --fallback inline --hold never 2>&1)"
status=$?
[ "$status" -eq 5 ] || fail "the PTY did not propagate the exit code (got $status)"
run_dir="$(sed -n 's/^run_dir=//p' <<<"$output")"
[ "$(cat "$run_dir/exit-code")" = 5 ] || fail "the PTY run recorded the wrong exit code"

# The plain-PTY mode stays available for hosts without python3.
output="$(headless "$RUNNER" start \
    --task TASK-TTY-EXPLICIT --role executor --runner fake --runner-bin fake-agent \
    --runner-arg '{prompt}' --prompt-file "$TMP_DIR/prompt.txt" --cwd "$PROJECT" \
    --fallback inline --io tty --hold never 2>&1)"
[ $? -eq 0 ] || fail "explicit --io tty failed: $output"
grep -q '^io=tty$' <<<"$output" || fail "explicit --io tty was not honoured"
run_dir="$(sed -n 's/^run_dir=//p' <<<"$output")"
grep -q 'STDOUT=tty' "$run_dir/output.log" || fail "--io tty did not give the agent a terminal"
grep -q '^can_send=false$' <<<"$("$RUNNER" status "$run_dir")" ||
    fail "--io tty must not advertise an input channel it does not have"

# stdin delivery owns stdin, so it must fall back to the pipe instead.
output="$(headless "$RUNNER" start \
    --task TASK-TTY4 --role tester --runner fake --runner-bin fake-agent \
    --prompt-file "$TMP_DIR/prompt.txt" --prompt-delivery stdin --cwd "$PROJECT" \
    --fallback inline --hold never 2>&1)"
[ $? -eq 0 ] || fail "stdin delivery failed under auto IO: $output"
grep -q '^io=pipe$' <<<"$output" || fail "stdin delivery should fall back to the pipe"

headless "$RUNNER" start --task TASK-TTY5 --role tester --runner fake \
    --runner-bin fake-agent --prompt-file "$TMP_DIR/prompt.txt" --prompt-delivery stdin \
    --cwd "$PROJECT" --fallback inline --io tty 2>/dev/null &&
    fail "--io tty was accepted together with stdin delivery"

# --- the orchestrator must be able to talk to the agent it delegated to ----

cat > "$BIN/fake-repl" <<'REPL'
#!/usr/bin/env bash
[ -t 0 ] && echo "STDIN=tty" || echo "STDIN=pipe"
echo "REPL pronto."
while IFS= read -r line; do
  line="${line%$'\r'}"
  [ "$line" = "sair" ] && { echo "ATE-MAIS"; exit 3; }
  echo "ECO[$line]"
done
REPL
chmod +x "$BIN/fake-repl"

cat > "$BIN/fake-terminal-exec" <<'TERMINAL'
#!/usr/bin/env bash
shift 2
exec "$@"
TERMINAL
chmod +x "$BIN/fake-terminal-exec"

output="$(headless "$RUNNER" start \
    --task TASK-BROKER --role executor --runner fake --runner-bin fake-repl \
    --cwd "$PROJECT" --io broker --terminal custom \
    --terminal-cmd fake-terminal-exec --terminal-cmd '{title}' --terminal-cmd '{cwd}' \
    --terminal-cmd '{command}' --detach 2>&1)"
[ $? -eq 0 ] || fail "the broker session did not start: $output"
grep -q '^io=broker$' <<<"$output" || fail "the broker mode was not selected"
grep -q '^detached=true$' <<<"$output" || fail "the broker session did not detach"
run_dir="$(sed -n 's/^run_dir=//p' <<<"$output")"

deadline=$((SECONDS + 15))
while [ "$(cat "$run_dir/status" 2>/dev/null)" != running ] && [ "$SECONDS" -lt "$deadline" ]; do :; done
[ "$(cat "$run_dir/status")" = running ] || fail "the broker session never reached status=running"
grep -q '^can_send=true$' <<<"$("$RUNNER" status "$run_dir")" ||
    fail "a broker session must advertise its input channel"

"$RUNNER" send "$run_dir" --text "primeira" >/dev/null || fail "send failed"
"$RUNNER" send "$run_dir" --text "segunda" >/dev/null || fail "second send failed"

deadline=$((SECONDS + 15))
while ! "$RUNNER" read "$run_dir" --plain 2>/dev/null | grep -q 'ECO\[segunda\]'; do
    [ "$SECONDS" -lt "$deadline" ] || fail "the agent never echoed what the orchestrator sent"
done
"$RUNNER" read "$run_dir" --plain | grep -q 'ECO\[primeira\]' || fail "the first message was lost"
"$RUNNER" read "$run_dir" --plain | grep -q 'STDIN=tty' || fail "the broker did not give the agent a terminal"

# Ending the session must produce a real exit code, not a guess.
"$RUNNER" send "$run_dir" --text "sair" >/dev/null || fail "the closing send failed"
"$RUNNER" wait "$run_dir" --timeout 20
status=$?
[ "$status" -eq 3 ] || fail "wait did not report the agent exit code (got $status)"
[ "$(cat "$run_dir/exit-code")" = 3 ] || fail "the broker recorded the wrong exit code"
[ "$(cat "$run_dir/status")" = failed ] || fail "a non-zero exit must record status=failed"
grep -q '^can_send=false$' <<<"$("$RUNNER" status "$run_dir")" ||
    fail "a finished session must stop advertising an input channel"
"$RUNNER" send "$run_dir" --text "tarde demais" 2>/dev/null &&
    fail "send was accepted after the session ended"

# A mode without a control channel must refuse to pretend it has one.
output="$(headless "$RUNNER" start \
    --task TASK-NOSEND --role executor --runner fake --runner-bin fake-agent \
    --cwd "$PROJECT" --fallback inline --io pipe --hold never 2>&1)"
run_dir="$(sed -n 's/^run_dir=//p' <<<"$output")"
"$RUNNER" send "$run_dir" --text "oi" 2>/dev/null && fail "send was accepted on a pipe run"

# --- knowing the agent finished, without assuming how it answers -----------

output="$(headless "$RUNNER" start \
    --task TASK-IDLE --role executor --runner fake --runner-bin fake-repl \
    --cwd "$PROJECT" --io broker --terminal custom \
    --terminal-cmd fake-terminal-exec --terminal-cmd '{title}' --terminal-cmd '{cwd}' \
    --terminal-cmd '{command}' --detach 2>&1)"
[ $? -eq 0 ] || fail "the idle scenario did not start: $output"
run_dir="$(sed -n 's/^run_dir=//p' <<<"$output")"
deadline=$((SECONDS + 15))
while [ "$(cat "$run_dir/status" 2>/dev/null)" != running ] && [ "$SECONDS" -lt "$deadline" ]; do :; done

idle="$("$RUNNER" wait-idle "$run_dir" --quiet-for 2 --timeout 30)"
[ $? -eq 0 ] || fail "wait-idle did not settle on a quiet session"
grep -q '^idle=true$' <<<"$idle" || fail "wait-idle did not report an idle session"
grep -q '^state=running$' <<<"$idle" || fail "wait-idle lost the session state"

# The offset reported by send is what makes it possible to read only the reply,
# without matching any text the agent produced.
send_output="$("$RUNNER" send "$run_dir" --text "mensagem-nova")"
offset="$(sed -n 's/^bytes=//p' <<<"$send_output")"
[ -n "$offset" ] || fail "send did not report the log offset"
"$RUNNER" wait-idle "$run_dir" --quiet-for 2 --timeout 30 >/dev/null ||
    fail "wait-idle never settled after a send"
"$RUNNER" read "$run_dir" --since "$offset" --plain | grep -q 'ECO\[mensagem-nova\]' ||
    fail "--since did not surface what arrived after the send"
"$RUNNER" read "$run_dir" --since "$offset" --plain | grep -q 'REPL pronto' &&
    fail "--since leaked output that predates the send"

# An ended session is idle too, but the caller must be able to tell them apart.
"$RUNNER" send "$run_dir" --text "sair" >/dev/null
"$RUNNER" wait "$run_dir" --timeout 20 >/dev/null 2>&1
idle="$("$RUNNER" wait-idle "$run_dir" --quiet-for 1 --timeout 20)"
[ $? -eq 4 ] || fail "wait-idle did not distinguish a finished session"
grep -qE '^state=(done|failed)$' <<<"$idle" || fail "wait-idle did not report the final state"

# --- a closed window must record a result, never leave a stale `running` ---

output="$(headless "$RUNNER" start \
    --task TASK-ORPHAN --role executor --runner fake --runner-bin fake-repl \
    --cwd "$PROJECT" --io broker --terminal custom \
    --terminal-cmd fake-terminal-exec --terminal-cmd '{title}' --terminal-cmd '{cwd}' \
    --terminal-cmd '{command}' --detach 2>&1)"
[ $? -eq 0 ] || fail "the orphan scenario did not start: $output"
run_dir="$(sed -n 's/^run_dir=//p' <<<"$output")"
deadline=$((SECONDS + 15))
while [ "$(cat "$run_dir/status" 2>/dev/null)" != running ] && [ "$SECONDS" -lt "$deadline" ]; do :; done
[ "$(cat "$run_dir/status")" = running ] || fail "the orphan scenario never started"

# SIGKILL leaves no chance to run a trap: this is the window being destroyed.
supervisor_pid="$(cat "$run_dir/supervisor.pid")"
kill -9 "$supervisor_pid" 2>/dev/null
deadline=$((SECONDS + 15))
while kill -0 "$supervisor_pid" 2>/dev/null && [ "$SECONDS" -lt "$deadline" ]; do :; done

[ "$(cat "$run_dir/status")" = running ] ||
    fail "this case is meant to leave a stale file behind; the test proves the reader is honest"
grep -q '^status=orphaned$' <<<"$("$RUNNER" status "$run_dir")" ||
    fail "a dead supervisor was still reported as running"
"$RUNNER" wait "$run_dir" --timeout 10 2>/dev/null &&
    fail "wait reported success for an orphaned run"
"$RUNNER" send "$run_dir" --text "oi" 2>/dev/null &&
    fail "send was accepted on an orphaned session"

# Closing the window hangs up the supervisor. That must record a verdict and
# must not leave the delegated agent running with nothing attached to it.
output="$(headless "$RUNNER" start \
    --task TASK-HANGUP --role executor --runner fake --runner-bin fake-repl \
    --cwd "$PROJECT" --io broker --terminal custom \
    --terminal-cmd fake-terminal-exec --terminal-cmd '{title}' --terminal-cmd '{cwd}' \
    --terminal-cmd '{command}' --detach 2>&1)"
[ $? -eq 0 ] || fail "the hangup scenario did not start: $output"
run_dir="$(sed -n 's/^run_dir=//p' <<<"$output")"
deadline=$((SECONDS + 15))
while [ "$(cat "$run_dir/status" 2>/dev/null)" != running ] && [ "$SECONDS" -lt "$deadline" ]; do :; done
[ "$(cat "$run_dir/status")" = running ] || fail "the hangup scenario never started"

# Closing a window hangs up the whole foreground group, so the signal reaches the
# PTY supervisor itself -- not just the shell that is blocked waiting on it.
broker_pid="$(pgrep -P "$(cat "$run_dir/supervisor.pid")" | head -1)"
[ -n "$broker_pid" ] || fail "could not find the PTY supervisor process"
agent_pid="$(pgrep -P "$broker_pid" | head -1)"
kill -HUP "$broker_pid" 2>/dev/null

deadline=$((SECONDS + 20))
while [ "$SECONDS" -lt "$deadline" ]; do
    state="$(cat "$run_dir/status" 2>/dev/null)"
    [ "$state" = running ] || [ "$state" = starting ] || break
done
state="$(cat "$run_dir/status")"
[ "$state" = failed ] || fail "a hung-up session did not record a verdict (status=$state)"
[ -n "$(cat "$run_dir/exit-code" 2>/dev/null)" ] || fail "a hung-up session recorded no exit code"

if [ -n "$agent_pid" ]; then
    deadline=$((SECONDS + 15))
    while kill -0 "$agent_pid" 2>/dev/null && [ "$SECONDS" -lt "$deadline" ]; do :; done
    kill -0 "$agent_pid" 2>/dev/null &&
        fail "the delegated agent survived the hangup with no terminal attached"
fi

# --- the window is the human's; it does not close on its own ---------------

[ "$(cat "$run_dir/hold")" = keep ] || fail "keep is not the default hold policy"

# --- numeric options are validated, not silently coerced -------------------

headless "$RUNNER" start --task TASK-8 --role executor --runner fake \
    --runner-bin fake-agent --cwd "$PROJECT" --fallback inline --hold-seconds abc 2>/dev/null &&
    fail "start accepted a non-numeric --hold-seconds"

headless "$RUNNER" start --task TASK-8 --role executor --runner fake \
    --runner-bin fake-agent --cwd "$PROJECT" --fallback inline --timeout later 2>/dev/null &&
    fail "start accepted a non-numeric --timeout"

echo "scripts/test-lnx-run.sh: ok"
