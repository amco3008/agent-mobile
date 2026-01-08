---
name: ralph-invoke
description: Allows Claude to directly start Ralph-Wiggum autonomous loops without user commands. Use when user asks to "start a ralph loop", "run ralph", wants autonomous iteration, says "keep working until done", or when a complex task would benefit from multiple iterations.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
---

# Ralph Invoke Skill

**Allows Claude to directly start Ralph-Wiggum autonomous loops without user commands.**

## Prerequisites

**IMPORTANT: Before using Ralph loops, you MUST ensure the plugin is installed.**

### Check if plugin is installed:
```bash
ls "$HOME/.claude/plugins/cache/claude-plugins-official/ralph-loop" 2>/dev/null && echo "INSTALLED" || echo "NOT_INSTALLED"
```

### If NOT_INSTALLED, tell the user:
> The ralph-wiggum plugin is not installed. Please run these commands in your Claude session:
> ```
> /plugin install ralph-loop@claude-plugins-official
> /plugin enable ralph-loop@claude-plugins-official
> ```
> Then try again.

## Triggers

Use this skill when:
- User asks to "start a ralph loop" or "run ralph"
- User wants autonomous iteration on a task
- User says "keep working until done" or "iterate until complete"
- A complex task would benefit from multiple iterations
- User explicitly requests Claude to invoke ralph

## How to Start a Ralph Loop

Run this bash command:

```bash
"$HOME/.claude/skills/ralph-loop/scripts/setup-ralph-loop.sh" \
  "<TASK_DESCRIPTION>" \
  --task-id "<UNIQUE_ID>" \
  --max-iterations <N> \
  --completion-promise "<PROMISE_TEXT>"
```

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| TASK_DESCRIPTION | Yes | - | The task to work on |
| --task-id | Recommended | "default" | Unique ID for concurrent loops |
| --max-iterations | Recommended | unlimited | Safety limit (use 20-100) |
| --completion-promise | Recommended | null | Text to output when truly done |

### Example Invocations

**Simple task:**
```bash
"$HOME/.claude/skills/ralph-loop/scripts/setup-ralph-loop.sh" \
  "Fix all TypeScript type errors" \
  --task-id "type-fixes" \
  --max-iterations 50 \
  --completion-promise "ALL_ERRORS_FIXED"
```

**Complex refactor:**
```bash
"$HOME/.claude/skills/ralph-loop/scripts/setup-ralph-loop.sh" \
  "Migrate all API handlers to the new v2 pattern" \
  --task-id "api-migration" \
  --max-iterations 100 \
  --completion-promise "MIGRATION_COMPLETE"
```

## Concurrent Loops (Multi-Ralph)

**Run multiple Ralph loops in parallel** using different `--task-id` values:

```bash
# Terminal 1: Trading system
/ralph-loop --task-id trading "Build trading system" --max-iterations 50

# Terminal 2: Zone completion
/ralph-loop --task-id zones "Complete zone design" --max-iterations 50

# Terminal 3: Bug fixes
/ralph-loop --task-id bugfix "Fix auth bugs" --max-iterations 30
```

Each loop:
- Has its own state file: `.claude/ralph-loop-{task-id}.local.md`
- Binds to the first Claude session that claims it
- Runs independently without interfering with other loops

### List Active Loops
```bash
ls .claude/ralph-loop-*.local.md 2>/dev/null
```

### Monitor Specific Loop
```bash
head -15 .claude/ralph-loop-{task-id}.local.md
```

### Cancel Specific Loop
```bash
rm .claude/ralph-loop-{task-id}.local.md
```

## How the Loop Works

1. **Claude runs the setup script** → Creates state file at `.claude/ralph-loop.local.md`
2. **Claude works on the task** → Normal operation
3. **Claude tries to exit** → Stop hook intercepts
4. **Hook re-injects prompt** → Claude continues with same task
5. **Repeat** until:
   - Max iterations reached, OR
   - Claude outputs `<promise>PROMISE_TEXT</promise>`

## Completing the Loop

When the task is genuinely complete, output the completion promise in XML tags:

```
<promise>ALL_ERRORS_FIXED</promise>
```

**CRITICAL RULES:**
- Only output the promise when the statement is TRUE
- Do NOT lie to exit the loop
- Do NOT output false promises even if stuck
- Trust the process - if stuck, iterate and try differently

---

## Steering Questions (User Guidance)

When the Ralph sub-agent needs clarification, guidance, or approval before proceeding, it can surface questions to the user through the **steering file**.

### How Steering Works

1. **Ralph writes a question** → Creates/updates `.claude/ralph-steering.md`
2. **Orchestrator monitors** → Reads steering file between iterations
3. **Orchestrator relays** → Shows questions to user
4. **User responds** → Orchestrator writes response to steering file
5. **Ralph reads response** → Continues with guidance

### Steering File Format

```markdown
---
status: pending | answered
iteration: <N>
timestamp: <ISO8601>
---

## Question

<The question Ralph needs answered>

## Context

<Why this matters for the task>

## Options (if applicable)

1. Option A - description
2. Option B - description

---

## Response

<User's answer goes here - filled in by orchestrator>
```

### For the Ralph Sub-Agent

When you need user input, write to the steering file:

```bash
cat > .claude/ralph-steering.md << 'EOF'
---
status: pending
iteration: 5
timestamp: 2025-01-08T12:00:00Z
---

## Question

Should I use Redis or PostgreSQL for the session store?

## Context

Both would work but have different tradeoffs. Redis is faster but PostgreSQL keeps everything in one place.

## Options

1. Redis - faster, ephemeral by nature
2. PostgreSQL - simpler ops, already in stack

---

## Response

EOF
```

Then **continue working on other aspects** of the task. Check for responses at the start of each iteration:

```bash
if [[ -f .claude/ralph-steering.md ]]; then
  STATUS=$(grep '^status:' .claude/ralph-steering.md | sed 's/status: *//')
  if [[ "$STATUS" == "answered" ]]; then
    # Read the response and incorporate it
    RESPONSE=$(sed -n '/^## Response/,$ p' .claude/ralph-steering.md | tail -n +2)
    echo "User responded: $RESPONSE"
    # Clear the steering file after reading
    rm .claude/ralph-steering.md
  fi
fi
```

### For the Orchestrating Claude

When monitoring a Ralph loop, check for steering questions:

```bash
# Check for pending questions
if [[ -f .claude/ralph-steering.md ]]; then
  STATUS=$(grep '^status:' .claude/ralph-steering.md | sed 's/status: *//')
  if [[ "$STATUS" == "pending" ]]; then
    echo "⚠️ Ralph has a steering question:"
    cat .claude/ralph-steering.md
  fi
fi
```

When you receive a response from the user, update the file:

```bash
# Add user response to steering file
sed -i 's/^status: pending/status: answered/' .claude/ralph-steering.md
cat >> .claude/ralph-steering.md << 'EOF'

Use PostgreSQL - we want to minimize infrastructure complexity.
EOF
```

### Steering Best Practices

1. **Non-blocking questions** - Ralph should continue on other work while waiting
2. **Clear options** - Provide 2-3 concrete choices when possible
3. **Context matters** - Explain why you need this decision
4. **One question at a time** - Don't overwhelm with multiple steering questions
5. **Check early** - Check for steering responses at the start of each iteration

### Example: Orchestrated Ralph with Steering

```bash
# Orchestrator script (conceptual)
while true; do
  # Check for steering questions
  if [[ -f .claude/ralph-steering.md ]]; then
    STATUS=$(grep '^status:' .claude/ralph-steering.md | sed 's/status: *//')
    if [[ "$STATUS" == "pending" ]]; then
      QUESTION=$(sed -n '/^## Question/,/^## Context/ p' .claude/ralph-steering.md | head -n -1 | tail -n +2)
      echo "🔔 Ralph asks: $QUESTION"
      read -p "Your response: " USER_RESPONSE
      sed -i 's/^status: pending/status: answered/' .claude/ralph-steering.md
      echo -e "\n$USER_RESPONSE" >> .claude/ralph-steering.md
    fi
  fi

  # Check Ralph loop status
  if [[ ! -f .claude/ralph-loop.local.md ]]; then
    echo "Ralph loop complete!"
    break
  fi

  sleep 5
done
```

---

## Progress Reporting & Milestone Commits

Ralph should commit progress at meaningful milestones and report status for the orchestrator to relay.

### Progress File Format

Write progress updates to `.claude/ralph-progress.md`:

```markdown
---
iteration: <N>
timestamp: <ISO8601>
---

## Milestone: <short title>

### Completed
- Item 1
- Item 2

### Files Changed
- path/to/file1.ts
- path/to/file2.ts

### Next Steps
- What's coming next

### Blockers (if any)
- Issues that may need user input
```

### When to Commit Progress

Commit at natural milestones:

```bash
# After completing a logical unit of work
git add -A && git commit -m "$(cat <<'EOF'
[Ralph] Milestone: <title>

- What was done
- Key changes

Iteration: N
EOF
)"
```

**Commit triggers:**
- Completed a feature/component
- Fixed a bug and verified
- Finished refactoring a module
- Tests passing after changes
- Before asking a steering question

### Progress Reporting Pattern

At the end of each iteration (or after milestones), update progress:

```bash
ITERATION=$(grep '^iteration:' .claude/ralph-loop.local.md | sed 's/iteration: *//')
cat > .claude/ralph-progress.md << EOF
---
iteration: $ITERATION
timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)
---

## Milestone: Completed auth refactor

### Completed
- Migrated session handling to JWT
- Updated all protected routes
- Added refresh token logic

### Files Changed
- src/auth/session.ts
- src/middleware/auth.ts
- src/routes/protected/*.ts

### Next Steps
- Add rate limiting
- Update tests

### Blockers
- None currently
EOF
```

### For the Orchestrating Claude

Monitor progress and relay to user:

```bash
# Check for progress updates
if [[ -f .claude/ralph-progress.md ]]; then
  TIMESTAMP=$(grep '^timestamp:' .claude/ralph-progress.md | sed 's/timestamp: *//')
  echo "📊 Ralph progress update ($TIMESTAMP):"
  cat .claude/ralph-progress.md
fi

# Check git log for milestone commits
git log --oneline -5 --grep='\[Ralph\]' 2>/dev/null
```

### Example: Full Orchestrator Loop

```bash
#!/bin/bash
# Orchestrator that monitors Ralph and relays to user

LAST_PROGRESS=""

while [[ -f .claude/ralph-loop.local.md ]]; do
  # Check for new progress
  if [[ -f .claude/ralph-progress.md ]]; then
    CURRENT=$(cat .claude/ralph-progress.md)
    if [[ "$CURRENT" != "$LAST_PROGRESS" ]]; then
      echo ""
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      echo "📊 RALPH PROGRESS UPDATE"
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      cat .claude/ralph-progress.md
      LAST_PROGRESS="$CURRENT"
    fi
  fi

  # Check for steering questions
  if [[ -f .claude/ralph-steering.md ]]; then
    STATUS=$(grep '^status:' .claude/ralph-steering.md | sed 's/status: *//')
    if [[ "$STATUS" == "pending" ]]; then
      echo ""
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      echo "❓ RALPH NEEDS YOUR INPUT"
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      # Extract and show question
      sed -n '/^## Question/,/^## Context/p' .claude/ralph-steering.md | head -n -1
      sed -n '/^## Options/,/^---/p' .claude/ralph-steering.md | head -n -1
      echo ""
      read -p "Your response: " USER_RESPONSE
      # Write response
      sed -i 's/^status: pending/status: answered/' .claude/ralph-steering.md
      echo -e "\n$USER_RESPONSE" >> .claude/ralph-steering.md
      echo "✅ Response recorded"
    fi
  fi

  sleep 3
done

echo ""
echo "✅ Ralph loop complete!"
echo ""
echo "Recent commits:"
git log --oneline -10 --grep='\[Ralph\]'
```

### Summary Files

At completion, Ralph should create `.claude/ralph-summary.md`:

```markdown
---
task: <original task>
iterations: <total>
duration: <start to end>
status: complete | max_iterations | error
---

## Summary

Brief description of what was accomplished.

## Key Changes
- Major change 1
- Major change 2

## Files Modified
- file1.ts - description
- file2.ts - description

## Commits
- abc123 - Milestone: X
- def456 - Milestone: Y

## Notes for User
Any important follow-up items or things to review.
```

---

## Canceling a Loop

If needed, cancel with:
```bash
rm .claude/ralph-loop.local.md
```

Or use: `/ralph-wiggum:cancel-ralph`

## Best Practices

1. **Always set --max-iterations** - Prevents runaway costs (50-100 is reasonable)
2. **Use specific completion promises** - "ALL_TESTS_PASS" not "DONE"
3. **Include success criteria in task** - Be explicit about what "done" means
4. **Monitor progress** - `head -10 .claude/ralph-loop.local.md`
5. **Start small** - Test with 3-5 iterations first
6. **Use steering for decisions** - Don't guess on ambiguous requirements
7. **Commit at milestones** - Use `[Ralph] Milestone:` prefix for easy tracking
8. **Update progress file** - Keep orchestrator informed via `.claude/ralph-progress.md`
9. **Create summary on completion** - Write `.claude/ralph-summary.md` when done

## Cost Warning

Autonomous loops consume tokens rapidly. A 50-iteration loop can cost $50-100+ in API usage. Always use --max-iterations as a safety net.

## Why This Skill Exists

The official ralph-wiggum plugin requires users to run `/ralph-loop` commands. This skill enables Claude to invoke loops directly, enabling:
- Claude-initiated iteration on complex tasks
- Programmatic loop triggers from other skills/agents
- Automated workflows without manual commands
- **User steering** for guidance on ambiguous decisions
