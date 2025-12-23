# Skills

Drop Claude Code skills here. They will be mounted into the container at `~/.claude/skills/`.

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
