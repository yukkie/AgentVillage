# AGENTS.md

## Project Context

- For project overview, architecture docs, and broader team conventions, refer to [CLAUDE.md](CLAUDE.md).
- Key project docs listed in `CLAUDE.md` are the source of truth for product and design intent.

## Repository Expectations

- Use `uv` as the default local workflow tool.
- Run project commands via `uv run ...`.
- Before opening a PR, run `uv run ruff check .` and `uv run pytest`.
- Pre-commit is configured to run tests via `uv run pytest`.

## Windows / PowerShell Notes

- If Japanese Markdown looks garbled in PowerShell, read files with `Get-Content -Encoding UTF8`.
- If `git add` or `git commit` fails in sandbox with `.git\\index.lock` or branch lock permission errors, rerun with escalated permissions instead of working around it.

## Working Conventions

- Absolute imports only: `from src.xxx`, not relative imports.
- When an external skill file is provided by path but is not registered as a session skill, state that briefly before reading it.
- Put specialized instructions in files close to the relevant subtree if directory-specific overrides are needed later.

## Known Environment Caveat

- Some full-suite tests that rely on Windows temp directories may fail for environment-permission reasons unrelated to the current code change. When that happens, separate targeted test results from environment failures in the report.
