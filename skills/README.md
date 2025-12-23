# Skills

Drop Claude Code skills here. They will be mounted into the container at `~/.claude/skills/`.

## Global CLAUDE.md

The container entrypoint auto-generates `~/.claude/CLAUDE.md` with:

- **Available Skills** - Auto-discovered from `SKILL.md` files
- **GitHub Access** - `GITHUB_TOKEN` env var, pre-authenticated `gh` CLI
- **Tailscale Network** - How to access locally deployed services via Tailscale IP
- **Package Installation** - Passwordless sudo for installing dependencies
- **Skill System** - Pattern tracking and skill learning commands

This file is regenerated on container start via `_skill-manager/scripts/claudemd.py`.

## Installing Skills

```bash
# Clone a skill into this folder
git clone https://github.com/alchemiststudiosDOTai/claude-code-gemini-manager-skill.git

# Or copy a skill folder directly
cp -r /path/to/my-skill ./skills/
```

## Example: gemini-manager

```bash
cd skills
git clone https://github.com/alchemiststudiosDOTai/claude-code-gemini-manager-skill.git
# Restart container to pick up new skills
docker-compose restart
```

Then use in Claude:
```
> Manage the implementation of X using Gemini
```
