# Skills

Drop Claude Code skills here. They will be mounted into the container at `~/.claude/skills/`.

## Container Environment

Skills run in an environment with these capabilities:

### GitHub Access
- `GITHUB_TOKEN` environment variable with a personal access token
- `gh` CLI pre-authenticated
- Git credentials configured for private repos

### Tailscale Network
- Container runs on a Tailscale VPN
- Get container IP: `tailscale ip -4`
- Local services are accessible to the user via `http://<tailscale-ip>:<port>`

### System Access
- Passwordless sudo for package installation
- Python 3, pip, and common build tools available

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
