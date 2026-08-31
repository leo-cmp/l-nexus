#!/usr/bin/env bash
set -euo pipefail

# Override explicito do bump calculado. Existe porque o calculo automatico nao
# conhece a intencao do humano: uma mudanca marcada BREAKING CHANGE pode, num
# projeto ainda em 0.x, ser publicada como minor de proposito -- em 0.x bumpar o
# minor JA e a sinalizacao de ruptura.
BUMP_OVERRIDE=""
while [ "$#" -gt 0 ]; do
	case "$1" in
		--bump)
			BUMP_OVERRIDE="${2:-}"
			case "$BUMP_OVERRIDE" in
				major|minor|patch) ;;
				*) echo "ERRO: --bump aceita major, minor ou patch" >&2; exit 1 ;;
			esac
			shift 2
			;;
		*) echo "ERRO: opcao desconhecida: $1" >&2; exit 1 ;;
	esac
done

echo "Sincronizando 'main' local com origin..."
git fetch origin
git checkout main
git pull --ff-only origin main

LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")
echo "Ultima tag: $LAST_TAG"

if git rev-parse "$LAST_TAG" >/dev/null 2>&1; then
	RANGE="$LAST_TAG..HEAD"
else
	RANGE="HEAD"
fi

COMMITS=$(git log $RANGE --pretty=format:'%s%n%b')
CHANGED_FILES=$(git log $RANGE --name-only --pretty=format: | sed '/^$/d' | sort -u)

if [ -z "$(echo "$COMMITS" | tr -d '[:space:]')" ]; then
	echo "Nada releasable desde $LAST_TAG."
	exit 0
fi

if echo "$COMMITS" | grep -q "BREAKING CHANGE:"; then
	BUMP=major
elif echo "$COMMITS" | grep -qE "^feat(\(.+\))?:"; then
	BUMP=minor
elif echo "$COMMITS" | grep -qE "^(fix|perf|refactor)(\(.+\))?:"; then
	BUMP=patch
elif echo "$COMMITS" | grep -qE "^docs(\(.+\))?:" &&
	echo "$CHANGED_FILES" | grep -qE "^(src/)?(\.ai/guidelines/|\.ai/templates/|\.ai/model-routing\.yaml$|\.agents/skills/|\.agents/scripts/|GEMINI\.md$)"; then
	BUMP=patch
else
	BUMP=none
fi

if [ -n "$BUMP_OVERRIDE" ]; then
	if [ "$BUMP" = "none" ]; then
		echo "Nada releasable desde $LAST_TAG; --bump nao cria release do nada."
		exit 0
	fi
	echo "Bump calculado: $BUMP. Sobrescrito por --bump: $BUMP_OVERRIDE."
	BUMP="$BUMP_OVERRIDE"
fi

if [ "$BUMP" = "none" ]; then
	echo "Nada releasable desde $LAST_TAG."
	exit 0
fi

CURRENT_VERSION="${LAST_TAG#v}"
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

case "$BUMP" in
	major)
		MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0
		;;
	minor)
		MINOR=$((MINOR + 1)); PATCH=0
		;;
	patch)
		PATCH=$((PATCH + 1))
		;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
NEW_TAG="v$NEW_VERSION"

echo "$NEW_VERSION" > VERSION
[ -f package.json ] && sed -i "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" package.json
git add VERSION
[ -f package.json ] && git add package.json
git commit -m "chore: bump version to $NEW_VERSION"

TAG_MESSAGE="Release $NEW_TAG

$COMMITS"
git tag -a "$NEW_TAG" -m "$TAG_MESSAGE"

git push origin main --tags

echo "Release $NEW_TAG criada e publicada (bump: $BUMP)."
