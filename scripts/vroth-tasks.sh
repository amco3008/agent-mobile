#!/bin/bash
# vroth-tasks.sh — Shared task queue for Vroth Collective
# Usage: 
#   vroth-tasks.sh add "description" [priority]     # Add a new task
#   vroth-tasks.sh list                              # List all tasks
#   vroth-tasks.sh claim <task-id>                  # Claim a task
#   vroth-tasks.sh complete <task-id> [result]      # Mark task as complete
#   vroth-tasks.sh status                           # Show queue stats
#
# Tasks are stored in /home/agent/clawd/collective/tasks.json
# Synced via git for cross-instance coordination

set -euo pipefail

TASKS_FILE="/home/agent/clawd/collective/tasks.json"
INSTANCE_NAME="${VROTH_INSTANCE:-$(hostname)}"

# Ensure tasks file exists
if [[ ! -f "$TASKS_FILE" ]]; then
  echo '{"version":"1.0","tasks":[]}' > "$TASKS_FILE"
fi

# Generate unique task ID (timestamp + random)
gen_task_id() {
  echo "task-$(date +%s)-$RANDOM"
}

# Add a new task
add_task() {
  local description="$1"
  local priority="${2:-medium}"
  local task_id=$(gen_task_id)
  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  
  # Add task to array
  jq --arg id "$task_id" \
     --arg desc "$description" \
     --arg prio "$priority" \
     --arg time "$timestamp" \
     --arg instance "$INSTANCE_NAME" \
     '.tasks += [{
       id: $id,
       description: $desc,
       priority: $prio,
       status: "pending",
       created_by: $instance,
       created_at: $time,
       claimed_by: null,
       claimed_at: null,
       completed_at: null,
       result: null
     }]' "$TASKS_FILE" > "${TASKS_FILE}.tmp" && mv "${TASKS_FILE}.tmp" "$TASKS_FILE"
  
  echo "✅ Task added: $task_id"
  echo "   Description: $description"
  echo "   Priority: $priority"
  
  # Auto-commit and push to sync with other instances
  sync_tasks "Added task: $description"
}

# List all tasks
list_tasks() {
  local filter="${1:-all}"
  
  case "$filter" in
    pending)
      jq -r '.tasks[] | select(.status=="pending") | "[\(.id)] \(.priority) | \(.description) (by \(.created_by))"' "$TASKS_FILE"
      ;;
    claimed)
      jq -r '.tasks[] | select(.status=="claimed") | "[\(.id)] \(.priority) | \(.description) (claimed by \(.claimed_by))"' "$TASKS_FILE"
      ;;
    completed)
      jq -r '.tasks[] | select(.status=="completed") | "[\(.id)] \(.priority) | \(.description) (✓ \(.completed_at))"' "$TASKS_FILE"
      ;;
    *)
      echo "=== Pending Tasks ==="
      jq -r '.tasks[] | select(.status=="pending") | "[\(.id)] [\(.priority)] \(.description) (by \(.created_by))"' "$TASKS_FILE" || echo "(none)"
      echo ""
      echo "=== Claimed Tasks ==="
      jq -r '.tasks[] | select(.status=="claimed") | "[\(.id)] [\(.priority)] \(.description) (claimed by \(.claimed_by))"' "$TASKS_FILE" || echo "(none)"
      echo ""
      echo "=== Completed Tasks (last 10) ==="
      jq -r '.tasks[] | select(.status=="completed") | "[\(.id)] \(.description) (✓ by \(.claimed_by))"' "$TASKS_FILE" | tail -10 || echo "(none)"
      ;;
  esac
}

# Claim a task
claim_task() {
  local task_id="$1"
  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  
  # Check if task exists and is pending
  local status=$(jq -r ".tasks[] | select(.id==\"$task_id\") | .status" "$TASKS_FILE")
  
  if [[ -z "$status" ]]; then
    echo "❌ Task not found: $task_id"
    return 1
  fi
  
  if [[ "$status" != "pending" ]]; then
    echo "❌ Task already $status"
    return 1
  fi
  
  # Update task status
  jq --arg id "$task_id" \
     --arg instance "$INSTANCE_NAME" \
     --arg time "$timestamp" \
     '(.tasks[] | select(.id==$id)) |= (.status="claimed" | .claimed_by=$instance | .claimed_at=$time)' \
     "$TASKS_FILE" > "${TASKS_FILE}.tmp" && mv "${TASKS_FILE}.tmp" "$TASKS_FILE"
  
  local desc=$(jq -r ".tasks[] | select(.id==\"$task_id\") | .description" "$TASKS_FILE")
  
  echo "✅ Task claimed: $task_id"
  echo "   Description: $desc"
  
  # Auto-commit and push
  sync_tasks "Claimed task: $desc"
}

# Complete a task
complete_task() {
  local task_id="$1"
  local result="${2:-completed}"
  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  
  # Check if task exists and is claimed by this instance
  local claimed_by=$(jq -r ".tasks[] | select(.id==\"$task_id\") | .claimed_by" "$TASKS_FILE")
  
  if [[ -z "$claimed_by" ]]; then
    echo "❌ Task not found: $task_id"
    return 1
  fi
  
  if [[ "$claimed_by" != "$INSTANCE_NAME" ]]; then
    echo "⚠️  Warning: Task was claimed by $claimed_by, not $INSTANCE_NAME"
  fi
  
  # Update task status
  jq --arg id "$task_id" \
     --arg time "$timestamp" \
     --arg res "$result" \
     '(.tasks[] | select(.id==$id)) |= (.status="completed" | .completed_at=$time | .result=$res)' \
     "$TASKS_FILE" > "${TASKS_FILE}.tmp" && mv "${TASKS_FILE}.tmp" "$TASKS_FILE"
  
  local desc=$(jq -r ".tasks[] | select(.id==\"$task_id\") | .description" "$TASKS_FILE")
  
  echo "✅ Task completed: $task_id"
  echo "   Description: $desc"
  echo "   Result: $result"
  
  # Auto-commit and push
  sync_tasks "Completed task: $desc"
}

# Show queue statistics
show_status() {
  local total=$(jq '.tasks | length' "$TASKS_FILE")
  local pending=$(jq '[.tasks[] | select(.status=="pending")] | length' "$TASKS_FILE")
  local claimed=$(jq '[.tasks[] | select(.status=="claimed")] | length' "$TASKS_FILE")
  local completed=$(jq '[.tasks[] | select(.status=="completed")] | length' "$TASKS_FILE")
  
  echo "=== Task Queue Status ==="
  echo "Total tasks:     $total"
  echo "Pending:         $pending"
  echo "Claimed:         $claimed"
  echo "Completed:       $completed"
  echo ""
  echo "My instance:     $INSTANCE_NAME"
  echo ""
  
  # Show next pending task
  local next=$(jq -r '.tasks[] | select(.status=="pending") | "[\(.id)] [\(.priority)] \(.description)"' "$TASKS_FILE" | head -1)
  if [[ -n "$next" ]]; then
    echo "Next task: $next"
  fi
}

# Sync tasks file via git
sync_tasks() {
  local msg="${1:-Task queue update}"
  
  cd /home/agent/clawd || return 1
  
  # Pull latest first (merge any changes from other instances)
  git pull --no-edit --quiet origin master 2>/dev/null || true
  
  # Commit and push
  if [[ -n "$(git status --porcelain collective/tasks.json)" ]]; then
    git add collective/tasks.json
    git commit -m "collective: $msg (from $INSTANCE_NAME)" --quiet
    git push origin master --quiet 2>/dev/null || echo "⚠️  Push failed (will retry later)"
  fi
  
  cd - >/dev/null
}

# Main command router
ACTION="${1:-}"

case "$ACTION" in
  add)
    if [[ -z "${2:-}" ]]; then
      echo "Usage: vroth-tasks.sh add <description> [priority]"
      exit 1
    fi
    add_task "$2" "${3:-medium}"
    ;;
  list)
    list_tasks "${2:-all}"
    ;;
  claim)
    if [[ -z "${2:-}" ]]; then
      echo "Usage: vroth-tasks.sh claim <task-id>"
      exit 1
    fi
    claim_task "$2"
    ;;
  complete)
    if [[ -z "${2:-}" ]]; then
      echo "Usage: vroth-tasks.sh complete <task-id> [result]"
      exit 1
    fi
    complete_task "$2" "${3:-completed}"
    ;;
  status)
    show_status
    ;;
  sync)
    sync_tasks "Manual sync"
    ;;
  *)
    echo "vroth-tasks.sh — Shared task queue for Vroth Collective"
    echo ""
    echo "Commands:"
    echo "  add <description> [priority]    Add a new task (priority: high|medium|low)"
    echo "  list [filter]                   List tasks (filter: pending|claimed|completed|all)"
    echo "  claim <task-id>                 Claim a pending task"
    echo "  complete <task-id> [result]     Mark task as complete"
    echo "  status                          Show queue statistics"
    echo "  sync                            Manually sync with other instances"
    echo ""
    echo "Examples:"
    echo "  vroth-tasks.sh add 'Analyze SOL markets' high"
    echo "  vroth-tasks.sh list pending"
    echo "  vroth-tasks.sh claim task-1234567890-5678"
    echo "  vroth-tasks.sh complete task-1234567890-5678 'Found 3 arb opportunities'"
    exit 1
    ;;
esac
