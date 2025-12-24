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

# Configuration from environment
NTFY_ENABLED = os.environ.get('NTFY_ENABLED', 'false').lower() == 'true'
NTFY_TOPIC = os.environ.get('NTFY_TOPIC', '')
NTFY_SERVER = os.environ.get('NTFY_SERVER', 'https://ntfy.sh')
NTFY_RATE_LIMIT = int(os.environ.get('NTFY_RATE_LIMIT', '30'))

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
    """Handle permission_prompt notification."""
    message = hook_data.get('message', 'Permission required for an action')

    send_notification(
        message=message[:200] if message else 'Permission required',
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
    if len(sys.argv) < 2:
        sys.exit(0)

    event_type = sys.argv[1]

    # Read hook data from stdin
    try:
        hook_data = json.load(sys.stdin)
    except Exception:
        hook_data = {}

    # Handle based on event type
    if event_type == 'ask_question':
        handle_ask_question(hook_data)
    elif event_type == 'permission':
        handle_permission(hook_data)
    elif event_type == 'stop':
        handle_stop(hook_data)

    sys.exit(0)


if __name__ == "__main__":
    main()
