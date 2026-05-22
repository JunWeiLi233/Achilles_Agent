# Framework Design

Achilles commands keep the same layered shape across projects:

1. Command adapters live in `.codex/commands/` and expose the `auto-achilles-*` names.
2. Tool runners live in `.tools/` and do the deterministic filesystem, git, scan, and report work.
3. Project configuration lives in `.achilles-agent.json` and stays local by default.
4. Runtime state lives under `.agent-state/` and is ignored by git.
5. Verification gates run before any publish command mutates a remote.

The adapters are intentionally thin. They should describe intent, call a tool runner, and require the agent to cite verification evidence. All project identity, branch names, checks, and privacy restrictions belong in config or command arguments, not in the command files.

## Data Boundaries

Do not commit local state, run transcripts, machine paths, account emails, access tokens, credentials, customer data, or project-specific task history. If a project needs custom forbidden terms, add them to `.achilles-agent.json` under `privacy.forbid` or pass them with `--forbid`.

## Publish Gate

`auto-achilles-push-main` is guarded by:

1. expected remote validation when configured,
2. optional git identity validation,
3. configured check commands,
4. the privacy scanner,
5. an explicit `--execute` flag.
