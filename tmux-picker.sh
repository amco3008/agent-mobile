#!/bin/bash
# tmux-picker.sh - Interactive tmux session picker for SSH login

# Only run for interactive SSH sessions, not already in tmux
[[ -z "$SSH_CONNECTION" || -n "$TMUX" || ! -t 0 ]] && return 2>/dev/null

# Get existing sessions
sessions=$(tmux list-sessions -F "#{session_name}" 2>/dev/null)

echo ""
echo "╭─────────────────────────────────╮"
echo "│      tmux Session Picker        │"
echo "╰─────────────────────────────────╯"
echo ""

if [[ -n "$sessions" ]]; then
    echo "Existing sessions:"
    i=1
    declare -a session_array
    while IFS= read -r session; do
        # Get window count and attached status
        info=$(tmux list-sessions -F "#{session_name}: #{session_windows} windows#{?session_attached, (attached),}" 2>/dev/null | grep "^$session:")
        echo "  $i) $info"
        session_array[$i]="$session"
        ((i++))
    done <<< "$sessions"
    echo ""
    echo "  n) New session"
    echo "  s) Skip (no tmux)"
    echo ""
    read -r -p "Select [1]: " choice

    # Default to 1 if empty
    [[ -z "$choice" ]] && choice=1

    case "$choice" in
        [0-9]*)
            if [[ -n "${session_array[$choice]}" ]]; then
                exec tmux attach -t "${session_array[$choice]}"
            else
                echo "Invalid selection"
            fi
            ;;
        n|N)
            read -r -p "Session name [main]: " name
            [[ -z "$name" ]] && name="main"
            exec tmux new -s "$name"
            ;;
        s|S)
            echo "Skipping tmux..."
            ;;
        *)
            echo "Invalid choice, skipping tmux..."
            ;;
    esac
else
    echo "No existing sessions."
    echo ""
    echo "  1) Create new session"
    echo "  s) Skip (no tmux)"
    echo ""
    read -r -p "Select [1]: " choice

    [[ -z "$choice" ]] && choice=1

    case "$choice" in
        1)
            read -r -p "Session name [main]: " name
            [[ -z "$name" ]] && name="main"
            exec tmux new -s "$name"
            ;;
        s|S)
            echo "Skipping tmux..."
            ;;
        *)
            exec tmux new -s main
            ;;
    esac
fi
