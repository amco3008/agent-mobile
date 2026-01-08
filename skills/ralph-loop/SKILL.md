---
name: ralph-loop
description: Ralph Loop autonomous iteration plugin - enables self-referential development loops with multi-ralph support. Forked from ralph-loop@claude-plugins-official for persistence.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
---

# Ralph Loop Plugin (Forked)

This is a forked version of the `ralph-loop@claude-plugins-official` plugin, stored in the skills folder for persistence and version control.

## Why Forked?

The original plugin lives in `~/.claude/plugins/cache/` which:
- Is in a Docker named volume (not git-tracked)
- Can be lost on volume deletion
- Is not backed up to GitHub

This fork ensures multi-ralph changes persist across container rebuilds.

## Features

- **Multi-Ralph**: Run concurrent loops with different `--task-id` values
- **Session Binding**: Each loop binds to the first Claude session that claims it
- **Completion Promises**: Exit loops by outputting `<promise>TEXT</promise>`
- **Progress Tracking**: State files at `.claude/ralph-loop-{task-id}.local.md`

## Usage

Use via the `ralph-invoke` skill or directly:

```bash
/ralph-loop "Your task description" --task-id myloop --max-iterations 50 --completion-promise "DONE"
```

## Files

- `scripts/setup-ralph-loop.sh` - Initializes a ralph loop
- `hooks/stop-hook.sh` - Stop hook that intercepts exit and re-injects prompt
- `commands/ralph-loop.md` - Slash command definition
- `commands/cancel-ralph.md` - Cancel command definition
