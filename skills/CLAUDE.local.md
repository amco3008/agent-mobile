# Manual Directives

These directives are merged into the container's CLAUDE.md on startup.

## Preferences

- Use kebab-case for file names
- Before commit, update docs
- After commit, push

## Style

- Write like a human, not an AI
- Keep responses concise

## Skills Version Control

The skills folder is automatically version-controlled with git:
- **Repo**: `agent-mobile-claude-skills` (private, on your GitHub account)
- **Auto-commit on shutdown**: When container receives SIGTERM, all changes are committed and pushed
- **Auto-commit on startup**: Catches any uncommitted changes from previous unclean shutdown
- **Requires**: `GITHUB_TOKEN` environment variable with `repo` scope

### Manual commands
```bash
cd ~/.claude/skills
git status              # Check for changes
git add -A && git commit -m "Manual commit"
git push origin master
```
