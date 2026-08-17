#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

setup_release_repo() {
  local repo_dir="$1"
  local origin_dir="$2"

  git init -b main "$repo_dir" >/dev/null
  git -C "$repo_dir" config user.name "l-nexus Test"
  git -C "$repo_dir" config user.email "l-nexus-test@example.com"

  printf "0.2.0\n" > "$repo_dir/VERSION"
  git -C "$repo_dir" add VERSION
  git -C "$repo_dir" commit -m "chore: bump version to 0.2.0" >/dev/null
  git -C "$repo_dir" tag -a v0.2.0 -m "Release v0.2.0"

  git init --bare --initial-branch=main "$origin_dir" >/dev/null
  git -C "$repo_dir" remote add origin "$origin_dir"
  git -C "$repo_dir" push -u origin main --tags >/dev/null 2>&1
}

run_release() {
  local repo_dir="$1"
  local log_file="$2"

  (
    cd "$repo_dir"
    "$ROOT_DIR/scripts/release.sh" > "$log_file" 2>&1
  ) || {
    cat "$log_file" >&2
    return 1
  }
}

test_docs_guideline_change_releases_patch() {
  local repo_dir="$TMP_DIR/repo-guideline"
  local origin_dir="$TMP_DIR/origin-guideline.git"

  setup_release_repo "$repo_dir" "$origin_dir"

  mkdir -p "$repo_dir/.ai/guidelines/stacks"
  printf "# Astro\n" > "$repo_dir/.ai/guidelines/stacks/astro.md"
  git -C "$repo_dir" add .ai/guidelines/stacks/astro.md
  git -C "$repo_dir" commit -m "docs: adiciona guideline Astro de performance" >/dev/null

  run_release "$repo_dir" "$TMP_DIR/release-guideline.log"

  local version
  version="$(cat "$repo_dir/VERSION")"
  [ "$version" = "0.2.1" ] || fail "versao esperada 0.2.1, recebida $version"

  git -C "$repo_dir" rev-parse --verify v0.2.1 >/dev/null ||
    fail "tag v0.2.1 nao foi criada"
}

test_docs_skill_change_releases_patch() {
  local repo_dir="$TMP_DIR/repo-skill"
  local origin_dir="$TMP_DIR/origin-skill.git"

  setup_release_repo "$repo_dir" "$origin_dir"

  mkdir -p "$repo_dir/.agents/skills/nova-skill"
  printf "# Nova Skill\n" > "$repo_dir/.agents/skills/nova-skill/SKILL.md"
  git -C "$repo_dir" add .agents/skills/nova-skill/SKILL.md
  git -C "$repo_dir" commit -m "docs: adiciona skill nova" >/dev/null

  run_release "$repo_dir" "$TMP_DIR/release-skill.log"

  local version
  version="$(cat "$repo_dir/VERSION")"
  [ "$version" = "0.2.1" ] || fail "versao esperada 0.2.1 para skill, recebida $version"

  git -C "$repo_dir" rev-parse --verify v0.2.1 >/dev/null ||
    fail "tag v0.2.1 nao foi criada para skill"
}

test_docs_model_routing_change_releases_patch() {
  local repo_dir="$TMP_DIR/repo-model-routing"
  local origin_dir="$TMP_DIR/origin-model-routing.git"

  setup_release_repo "$repo_dir" "$origin_dir"

  mkdir -p "$repo_dir/.ai"
  printf "schema_version: 1\n" > "$repo_dir/.ai/model-routing.yaml"
  git -C "$repo_dir" add .ai/model-routing.yaml
  git -C "$repo_dir" commit -m "docs: atualiza politica de roteamento" >/dev/null

  run_release "$repo_dir" "$TMP_DIR/release-model-routing.log"

  local version
  version="$(cat "$repo_dir/VERSION")"
  [ "$version" = "0.2.1" ] ||
    fail "versao esperada 0.2.1 para roteamento, recebida $version"

  git -C "$repo_dir" rev-parse --verify v0.2.1 >/dev/null ||
    fail "tag v0.2.1 nao foi criada para roteamento"
}

test_docs_outside_distributed_paths_does_not_release() {
  local repo_dir="$TMP_DIR/repo-readme"
  local origin_dir="$TMP_DIR/origin-readme.git"

  setup_release_repo "$repo_dir" "$origin_dir"

  printf "# README\n" > "$repo_dir/README.md"
  git -C "$repo_dir" add README.md
  git -C "$repo_dir" commit -m "docs: atualiza README" >/dev/null

  run_release "$repo_dir" "$TMP_DIR/release-readme.log"

  local version
  version="$(cat "$repo_dir/VERSION")"
  [ "$version" = "0.2.0" ] || fail "docs fora de paths distribuidos nao deveria gerar release: $version"

  if git -C "$repo_dir" rev-parse --verify v0.2.1 >/dev/null 2>&1; then
    fail "tag v0.2.1 nao deveria existir para docs fora de paths distribuidos"
  fi
}

test_docs_guideline_change_releases_patch
test_docs_skill_change_releases_patch
test_docs_model_routing_change_releases_patch
test_docs_outside_distributed_paths_does_not_release

echo "scripts/test-release.sh: ok"
