#!/usr/bin/env python3
"""
push_notify.py - Send push notifications via ntfy.sh when Claude Code needs attention.

Usage:
    python3 push_notify.py <event_type>

Event types:
    ask_question - Claude is asking a question via AskUserQuestion tool
    permission   - Claude needs permission for a dangerous action
    stop         - Claude session has ended

Hook data is read from stdin as JSON.
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path

# Configuration - try environment first, then config file
def load_config():
    """Load ntfy config from environment or config file."""
    # First try environment variables
    enabled = os.environ.get('NTFY_ENABLED', '').lower() == 'true'
    topic = os.environ.get('NTFY_TOPIC', '')
    server = os.environ.get('NTFY_SERVER', 'https://ntfy.sh')
    rate_limit = os.environ.get('NTFY_RATE_LIMIT', '30')

    # If not in env, try config file
    if not topic:
        config_file = Path.home() / ".claude" / "ntfy.conf"
        if config_file.exists():
            try:
                for line in config_file.read_text().splitlines():
                    line = line.strip()
                    if '=' in line and not line.startswith('#'):
                        key, value = line.split('=', 1)
                        key = key.strip()
                        value = value.strip().strip("'\"")
                        if key == 'NTFY_ENABLED':
                            enabled = value.lower() == 'true'
                        elif key == 'NTFY_TOPIC':
                            topic = value
                        elif key == 'NTFY_SERVER':
                            server = value
                        elif key == 'NTFY_RATE_LIMIT':
                            rate_limit = value
            except Exception:
                pass

    return enabled, topic, server, int(rate_limit)

NTFY_ENABLED, NTFY_TOPIC, NTFY_SERVER, NTFY_RATE_LIMIT = load_config()

# Rate limiting state file
SKILLS_DIR = Path(os.environ.get('SKILL_SYSTEM_DIR', Path.home() / ".claude" / "skills"))
RATE_LIMIT_FILE = SKILLS_DIR / ".skill-system" / "ntfy-ratelimit.json"


def is_rate_limited():
    """Check if notifications are rate-limited."""
    try:
        if RATE_LIMIT_FILE.exists():
            data = json.loads(RATE_LIMIT_FILE.read_text())
            last_sent = data.get('last_sent', 0)
            if time.time() - last_sent < NTFY_RATE_LIMIT:
                return True
    except Exception:
        pass
    return False


def update_rate_limit():
    """Update rate limit timestamp."""
    try:
        RATE_LIMIT_FILE.parent.mkdir(parents=True, exist_ok=True)
        RATE_LIMIT_FILE.write_text(json.dumps({
            'last_sent': time.time(),
            'last_sent_iso': datetime.utcnow().isoformat() + 'Z'
        }))
    except Exception:
        pass


def send_notification(message, title=None, priority='default', tags=None):
    """
    Send a push notification via ntfy.sh.

    Args:
        message: Notification body text
        title: Optional notification title
        priority: 'min', 'low', 'default', 'high', 'urgent'
        tags: List of emoji tags (e.g., ['robot', 'question'])

    Returns:
        True if sent successfully, False otherwise
    """
    if not NTFY_ENABLED or not NTFY_TOPIC:
        return False

    if is_rate_limited():
        return False

    try:
        url = f"{NTFY_SERVER.rstrip('/')}/{NTFY_TOPIC}"

        headers = {
            'Content-Type': 'text/plain; charset=utf-8'
        }

        if title:
            headers['Title'] = title
        if priority and priority != 'default':
            headers['Priority'] = priority
        if tags:
            headers['Tags'] = ','.join(tags)

        req = urllib.request.Request(
            url,
            data=message.encode('utf-8'),
            headers=headers,
            method='POST'
        )

        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 200:
                update_rate_limit()
                return True
    except urllib.error.URLError:
        pass  # Network error - fail silently
    except Exception:
        pass  # Any other error - fail silently

    return False


def handle_ask_question(hook_data):
    """Handle AskUserQuestion tool notification."""
    tool_input = hook_data.get('tool_input', {})
    questions = tool_input.get('questions', [])

    if questions:
        # Get the first question text
        question = questions[0].get('question', 'Claude needs your input')
    else:
        question = 'Claude needs your input'

    send_notification(
        message=question[:200],  # Truncate long questions
        title='Claude needs input',
        priority='high',
        tags=['robot', 'question']
    )


def handle_permission(hook_data):
    """Handle permission_prompt notification (legacy)."""
    message = hook_data.get('message', 'Permission required for an action')

    send_notification(
        message=message[:200] if message else 'Permission required',
        title='Claude needs permission',
        priority='high',
        tags=['warning', 'lock']
    )


def handle_permission_request(hook_data):
    """Handle PermissionRequest hook - fires when permission dialog shown."""
    tool_name = hook_data.get('tool_name', 'Unknown tool')
    tool_input = hook_data.get('tool_input', {})

    # Build a descriptive message
    if tool_name == 'Bash':
        cmd = tool_input.get('command', '')[:100]
        message = f"Run: {cmd}"
    elif tool_name in ['Write', 'Edit']:
        path = tool_input.get('file_path', 'unknown file')
        message = f"{tool_name}: {path}"
    else:
        message = f"Use {tool_name} tool"

    send_notification(
        message=message,
        title='Claude needs permission',
        priority='high',
        tags=['warning', 'lock']
    )


def handle_stop(hook_data):
    """Handle session stop notification."""
    send_notification(
        message='Claude session has ended',
        title='Session complete',
        priority='default',
        tags=['white_check_mark']
    )


def main():
    # Debug logging
    debug_file = SKILLS_DIR / ".skill-system" / "patterns" / "push-notify-debug.log"
    try:
        debug_file.parent.mkdir(parents=True, exist_ok=True)
        with open(debug_file, "a") as f:
            f.write(f"{datetime.utcnow().isoformat()} - Called with args: {sys.argv}\n")
    except:
        pass

    if len(sys.argv) < 2:
        sys.exit(0)

    event_type = sys.argv[1]

    # Read hook data from stdin
    try:
        hook_data = json.load(sys.stdin)
        # Log what we received
        try:
            with open(debug_file, "a") as f:
                f.write(f"  Data: {json.dumps(hook_data)[:500]}\n")
        except:
            pass
    except Exception:
        hook_data = {}

    # Handle based on event type
    if event_type == 'ask_question':
        handle_ask_question(hook_data)
    elif event_type == 'permission':
        handle_permission(hook_data)
    elif event_type == 'permission_request':
        handle_permission_request(hook_data)
    elif event_type == 'pretool':
        handle_permission_request(hook_data)  # Same handler - fires before tool execution
    elif event_type == 'stop':
        handle_stop(hook_data)
    elif event_type == 'notification_debug':
        # Debug: send notification for ANY notification event
        notif_type = hook_data.get('notification_type', 'unknown')
        message = hook_data.get('message', 'No message')[:150]
        send_notification(
            message=f"[{notif_type}] {message}",
            title='Debug: Notification',
            priority='high',
            tags=['bell']
        )

    sys.exit(0)


if __name__ == "__main__":
    main()
