#!/bin/bash
# Agent Mobile Healthcheck
# Returns JSON with service status. Exit 0 = healthy, Exit 1 = unhealthy.
# Used by Docker HEALTHCHECK and accessible via: curl http://agent-mobile:18790/health

set -euo pipefail

status="healthy"
checks=()

# Check Tailscale
if tailscale status &>/dev/null; then
    checks+=('{"name":"tailscale","status":"up"}')
else
    checks+=('{"name":"tailscale","status":"down"}')
    status="unhealthy"
fi

# Check Clawdbot gateway
if pgrep -f "clawdbot-gateway" &>/dev/null; then
    checks+=('{"name":"clawdbot","status":"up"}')
else
    checks+=('{"name":"clawdbot","status":"down"}')
    status="unhealthy"
fi

# Check SSH
if pgrep -f "sshd" &>/dev/null; then
    checks+=('{"name":"ssh","status":"up"}')
else
    checks+=('{"name":"ssh","status":"down"}')
    status="unhealthy"
fi

# Check webtmux
if pgrep -f "webtmux" &>/dev/null; then
    checks+=('{"name":"webtmux","status":"up"}')
else
    checks+=('{"name":"webtmux","status":"down"}')
    status="degraded"
fi

# Check RTS Manager
if pgrep -f "rts-manager" &>/dev/null || curl -sf http://localhost:9091 &>/dev/null; then
    checks+=('{"name":"rts-manager","status":"up"}')
else
    checks+=('{"name":"rts-manager","status":"down"}')
    status="degraded"
fi

# System stats
uptime_sec=$(cat /proc/uptime | awk '{print int($1)}')
mem_total=$(free -m | awk '/^Mem:/{print $2}')
mem_used=$(free -m | awk '/^Mem:/{print $3}')
mem_pct=$((mem_used * 100 / mem_total))
disk_pct=$(df -h /home/agent | awk 'NR==2{print $5}' | tr -d '%')

# Build JSON
checks_json=$(IFS=,; echo "${checks[*]}")
cat <<EOF
{
  "status": "${status}",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "uptime_seconds": ${uptime_sec},
  "memory": {"used_mb": ${mem_used}, "total_mb": ${mem_total}, "percent": ${mem_pct}},
  "disk_percent": ${disk_pct},
  "services": [${checks_json}]
}
EOF

# Exit code for Docker HEALTHCHECK
if [ "$status" = "unhealthy" ]; then
    exit 1
fi
exit 0
