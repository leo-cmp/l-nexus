# Root Agent Context Design

## Objective

Make the repository boundary explicit to any LLM working on l-nexus itself. The
repository is the development source for a portable context harness; it is not a
consumer project with l-nexus installed into it.

## Repository Boundaries

- Root files describe and implement the l-nexus package.
- `src/` is the installation payload copied into consumer projects.
- `src/AGENTS.md` governs agents inside consumer projects after installation. It
  does not govern development of this repository.
- `scripts/` contains packaging, installation, validation, migration, and
  release behavior for the harness.
- `docs/` contains designs and implementation plans for the harness itself.

## Root Instructions

Create a concise root `AGENTS.md` that:

1. identifies l-nexus as a context harness and package source;
2. explains the root versus `src/` boundary;
3. tells agents to edit the layer that owns the requested behavior;
4. prohibits treating the payload layout as a broken local installation;
5. prohibits creating consumer runtime state such as `.ai/` in the repository
   root merely to satisfy instructions from `src/AGENTS.md`;
6. requires checking installation scripts and tests when changing installed
   behavior; and
7. preserves unrelated user changes in the worktree.

The root instructions must not duplicate the consumer workflow from
`src/AGENTS.md`, because duplication would blur ownership and eventually drift.

## Claude Compatibility

`AGENTS.md` is the canonical root instruction file. Create the relative symlink
`CLAUDE.md -> AGENTS.md` so Claude and tools that discover `CLAUDE.md` receive the
same repository-specific instructions without maintaining a second copy.

## Verification

- Confirm `AGENTS.md` is a regular file.
- Confirm `CLAUDE.md` is a symlink whose target is `AGENTS.md`.
- Resolve and compare both paths to confirm they expose identical content.
- Inspect `git diff` to ensure no payload or unrelated files changed.
