#!/usr/bin/env python3
"""
claudemd.py - Maintains the global CLAUDE.md file.

Scans skills directory for SKILL.md files, extracts name and description
from YAML frontmatter, and merges missing skills into CLAUDE.md.

Content outside the auto-generated markers is preserved, allowing agents
and users to add their own notes over time.
"""

import os
import re
import argparse
from pathlib import Path

# Configuration - use /home/agent for container environment
AGENT_HOME = Path("/home/agent")
CLAUDE_DIR = Path(os.environ.get('CLAUDE_DIR', AGENT_HOME / ".claude"))
SKILLS_DIR = CLAUDE_DIR / "skills"
CLAUDE_MD_PATH = CLAUDE_DIR / "CLAUDE.md"

# Markers to identify auto-generated section
SKILLS_SECTION_START = "<!-- AUTO-GENERATED SKILLS START -->"
SKILLS_SECTION_END = "<!-- AUTO-GENERATED SKILLS END -->"


def parse_yaml_frontmatter(filepath):
    """
    Parse YAML frontmatter from a SKILL.md file using regex.
    Returns dict with 'name' and 'description' or None if parsing fails.
    """
    try:
        content = filepath.read_text()

        # Check for YAML frontmatter delimiters
        if not content.startswith("---"):
            return None

        # Find the closing ---
        end_idx = content.find("---", 3)
        if end_idx == -1:
            return None

        yaml_content = content[3:end_idx]

        # Extract key-value pairs using regex
        result = {}

        # Match name: value (simple key-value)
        name_match = re.search(r'^name:\s*(.+)$', yaml_content, re.MULTILINE)
        if name_match:
            value = name_match.group(1).strip()
            # Remove surrounding quotes if present
            if (value.startswith('"') and value.endswith('"')) or \
               (value.startswith("'") and value.endswith("'")):
                value = value[1:-1]
            result['name'] = value

        # Match description: value (can contain quotes and special chars)
        desc_match = re.search(r'^description:\s*(.+)$', yaml_content, re.MULTILINE)
        if desc_match:
            value = desc_match.group(1).strip()
            # Remove surrounding quotes if present
            if (value.startswith('"') and value.endswith('"')) or \
               (value.startswith("'") and value.endswith("'")):
                value = value[1:-1]
            result['description'] = value

        return result if result.get('name') else None

    except Exception as e:
        return None


def discover_skills(verbose=False):
    """
    Discover all skills with SKILL.md files.
    Returns list of dicts with 'name', 'description', 'dir'.
    """
    skills = []

    if not SKILLS_DIR.exists():
        return skills

    for item in SKILLS_DIR.iterdir():
        if not item.is_dir():
            continue

        # Skip hidden directories and system directories
        if item.name.startswith("."):
            continue

        # Look for SKILL.md in the skill directory
        skill_md = item / "SKILL.md"

        if not skill_md.exists():
            # Check one level deeper for nested structures
            for subdir in item.iterdir():
                if subdir.is_dir() and not subdir.name.startswith("."):
                    nested_skill_md = subdir / "SKILL.md"
                    if nested_skill_md.exists():
                        skill_md = nested_skill_md
                        break

        if skill_md.exists():
            frontmatter = parse_yaml_frontmatter(skill_md)
            if frontmatter and frontmatter.get("name"):
                skills.append({
                    "name": frontmatter.get("name"),
                    "description": frontmatter.get("description", "No description available"),
                    "dir": item.name,
                })
                if verbose:
                    print(f"  Found: {frontmatter.get('name')}")
            elif verbose:
                print(f"  Skipping {item.name}: no valid frontmatter")

    return skills


def get_initial_template():
    """Return the initial CLAUDE.md template."""
    return f'''# Agent Mobile

Global configuration for Claude Code in the agent-mobile container.

## Available Skills

{SKILLS_SECTION_START}
<!-- Skills will be auto-inserted here -->
{SKILLS_SECTION_END}

## Environment Capabilities

### GitHub Access

A `GITHUB_TOKEN` personal access token is available in the environment. Use it for:
- GitHub API operations via `gh` CLI (already authenticated)
- Cloning/pushing to private repositories (git credentials configured)
- Direct API requests: `curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/...`

### Tailscale Network

This container runs on a Tailscale network. When deploying local services (web servers, APIs, etc.), the user connects via the container's Tailscale IP:
- Get IP: `tailscale ip -4`
- Example: If you start a server on port 3000, the user accesses it at `http://<tailscale-ip>:3000`

Always provide the Tailscale IP when starting services so the user knows how to connect.

### Package Installation

This container has **passwordless sudo** configured. You can install missing packages without prompts:

```bash
sudo apt-get update && sudo apt-get install -y <package-name>
```

Common packages you might need:
- Build tools: `build-essential`, `cmake`, `pkg-config`
- Python: `python3-pip`, `python3-venv`, `python3-dev`
- Languages: `golang-go`, `rustc`, `cargo`
- Databases: `postgresql-client`, `redis-tools`, `sqlite3`
- Networking: `netcat`, `nmap`, `dnsutils`

Use this proactively when a tool or dependency is missing rather than asking the user to install it.

## Documentation

**Always update documentation** when completing features, changes, or tasks:

- Update `README.md` when adding/changing features, commands, or configuration
- Update relevant `.md` files in the project when behavior changes
- Keep docs concise and accurate - remove outdated information
- Add new features to appropriate sections (Features list, usage examples, etc.)

Do this automatically as part of completing work, not as a separate step.

## Skill System Awareness

**Pattern learning via transcript scanning.** After complex sessions, run:
```bash
# Scan transcripts for patterns (run this first)
python3 ~/.claude/skills/_skill-manager/scripts/manage.py scan

# Analyze patterns and generate skill candidates
python3 ~/.claude/skills/_skill-manager/scripts/manage.py learn

# Review and approve candidates
python3 ~/.claude/skills/_skill-manager/scripts/manage.py candidates
python3 ~/.claude/skills/_skill-manager/scripts/manage.py approve <candidate-id>
```

**Automatic workflow:** Run `scan` then `learn` after completing multi-step tasks. If candidates are generated, inform the user.

## Project Domains

Default domains: devops, security, data_science, frontend, backend, git

For niche areas, add custom domain markers in:
`~/.claude/skills/.skill-system/config.json`

## Preferred Workflows

Note your workflow preferences below to help pattern detection:
- (e.g., "Always run tests before commits")
- (e.g., "Use conventional commit messages")

## Notes

Add your own notes below this line. They will be preserved across updates.

---

'''


def generate_skills_section(skills):
    """Generate the skills documentation section."""
    if not skills:
        return "No skills installed yet.\n"

    lines = []
    for skill in sorted(skills, key=lambda s: s["name"]):
        lines.append(f"### {skill['name']}")
        lines.append(f"{skill['description']}")
        lines.append("")

    return "\n".join(lines)


def update_claude_md(verbose=True):
    """
    Main function to update CLAUDE.md.
    Discovers skills and merges them into the auto-generated section.
    Preserves all content outside the markers.
    """
    # Discover all skills
    if verbose:
        print("Scanning for skills...")
    skills = discover_skills(verbose=verbose)
    if verbose:
        print(f"Found {len(skills)} skill(s) with SKILL.md files")

    # Check if CLAUDE.md exists
    if not CLAUDE_MD_PATH.exists():
        if verbose:
            print("Creating new CLAUDE.md from template...")
        content = get_initial_template()
    else:
        content = CLAUDE_MD_PATH.read_text()

    # Find skills section markers
    start_idx = content.find(SKILLS_SECTION_START)
    end_idx = content.find(SKILLS_SECTION_END)

    # Generate new skills content
    new_skills_content = generate_skills_section(skills)

    if start_idx == -1 or end_idx == -1:
        # No markers found - add the skills section
        if verbose:
            print("Skills section markers not found, adding them...")

        # Try to insert after "## Available Skills" if it exists
        avail_skills_idx = content.find("## Available Skills")
        if avail_skills_idx != -1:
            # Find end of that line
            newline_idx = content.find("\n", avail_skills_idx)
            if newline_idx != -1:
                insert_pos = newline_idx + 1
                skills_block = f"\n{SKILLS_SECTION_START}\n{new_skills_content}{SKILLS_SECTION_END}\n"
                content = content[:insert_pos] + skills_block + content[insert_pos:]
        else:
            # Insert after first heading or at start
            first_heading = content.find("\n## ")
            if first_heading != -1:
                insert_pos = first_heading + 1
            else:
                insert_pos = 0

            skills_block = f"\n## Available Skills\n\n{SKILLS_SECTION_START}\n{new_skills_content}{SKILLS_SECTION_END}\n\n"
            content = content[:insert_pos] + skills_block + content[insert_pos:]
    else:
        # Replace content between markers
        content = (
            content[:start_idx + len(SKILLS_SECTION_START)]
            + "\n"
            + new_skills_content
            + content[end_idx:]
        )

    # Write back
    CLAUDE_MD_PATH.parent.mkdir(parents=True, exist_ok=True)
    CLAUDE_MD_PATH.write_text(content)

    if verbose:
        print(f"Updated {CLAUDE_MD_PATH}")
        for skill in sorted(skills, key=lambda s: s["name"]):
            desc_preview = skill['description'][:50] + "..." if len(skill['description']) > 50 else skill['description']
            print(f"  - {skill['name']}: {desc_preview}")


def main():
    parser = argparse.ArgumentParser(description="Maintain global CLAUDE.md with skill documentation")
    parser.add_argument("--quiet", "-q", action="store_true", help="Suppress output")
    parser.add_argument("--check", action="store_true", help="Check skills without updating")
    args = parser.parse_args()

    if args.check:
        skills = discover_skills(verbose=True)
        print(f"\nTotal skills found: {len(skills)}")
        for s in skills:
            print(f"  {s['name']}: {s['description'][:60]}...")
    else:
        update_claude_md(verbose=not args.quiet)


if __name__ == "__main__":
    main()
