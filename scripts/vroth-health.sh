#!/bin/bash
# vroth-health.sh — Health check between Vroth instances
# Usage:
#   vroth-health.sh [target]     Check specific instance or all
#   vroth-health.sh --json       Output in JSON format
#   vroth-health.sh --monitor    Continuous monitoring mode
#
# Pings all other instances and reports:
# - Gateway health (HTTP endpoint)
# - Response time
# - Last seen timestamp
# - Model availability

set -euo pipefail

TARGETS_FILE="/home/agent/clawd/collective/bridge-targets.json"
JSON_OUTPUT=false
MONITOR_MODE=false
TARGET="${1:-}"

# Parse flags
if [[ "$TARGET" == "--json" ]]; then
  JSON_OUTPUT=true
  TARGET=""
elif [[ "$TARGET" == "--monitor" ]]; then
  MONITOR_MODE=true
  TARGET=""
fi

if [[ ! -f "$TARGETS_FILE" ]]; then
  echo "❌ Bridge targets not found: $TARGETS_FILE"
  exit 1
fi

SELF=$(jq -r '.self // "unknown"' "$TARGETS_FILE")

# Check health of a single instance
check_instance() {
  local name="$1"
  local hostname=$(jq -r ".instances.${name}.hostname // empty" "$TARGETS_FILE")
  local host=$(jq -r ".instances.${name}.host // empty" "$TARGETS_FILE")
  local port=$(jq -r ".instances.${name}.port // 18789" "$TARGETS_FILE")
  local token=$(jq -r ".instances.${name}.token // empty" "$TARGETS_FILE")
  
  # Try hostname first, fall back to IP
  local target="${hostname:-$host}"
  
  if [[ -z "$target" || -z "$token" ]]; then
    echo "{\"instance\":\"$name\",\"status\":\"error\",\"message\":\"Missing config\"}"
    return 1
  fi
  
  local url="http://${target}:${port}/v1/chat/completions"
  local start_time=$(date +%s%3N)
  
  # Send minimal health check message
  local payload=$(jq -n '{model:"anthropic/claude-sonnet-4-5",messages:[{role:"user",content:"HEARTBEAT_OK"}],max_tokens:10}')
  
  local response=$(curl -s --connect-timeout 3 --max-time 10 \
    -w "\n%{http_code}" \
    -X POST \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    -d "$payload" \
    "$url" 2>&1)
  
  local end_time=$(date +%s%3N)
  local response_time=$((end_time - start_time))
  
  local http_code=$(echo "$response" | tail -1)
  local body=$(echo "$response" | sed '$d')
  
  if [[ "$http_code" == "200" ]]; then
    local model=$(echo "$body" | jq -r '.model // "unknown"' 2>/dev/null || echo "unknown")
    echo "{\"instance\":\"$name\",\"status\":\"healthy\",\"response_time_ms\":$response_time,\"endpoint\":\"$target:$port\",\"model\":\"$model\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
  else
    # Try IP fallback if hostname failed
    if [[ -n "$hostname" && -n "$host" && "$target" == "$hostname" ]]; then
      url="http://${host}:${port}/v1/chat/completions"
      start_time=$(date +%s%3N)
      response=$(curl -s --connect-timeout 3 --max-time 10 \
        -w "\n%{http_code}" \
        -X POST \
        -H "Authorization: Bearer ${token}" \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "$url" 2>&1)
      end_time=$(date +%s%3N)
      response_time=$((end_time - start_time))
      http_code=$(echo "$response" | tail -1)
      body=$(echo "$response" | sed '$d')
      
      if [[ "$http_code" == "200" ]]; then
        local model=$(echo "$body" | jq -r '.model // "unknown"' 2>/dev/null || echo "unknown")
        echo "{\"instance\":\"$name\",\"status\":\"healthy_fallback\",\"response_time_ms\":$response_time,\"endpoint\":\"$host:$port\",\"model\":\"$model\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"note\":\"Hostname failed, IP worked\"}"
        return 0
      fi
    fi
    
    echo "{\"instance\":\"$name\",\"status\":\"unhealthy\",\"http_code\":\"$http_code\",\"endpoint\":\"$target:$port\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
  fi
}

# Pretty print health check result
pretty_print() {
  local result="$1"
  local instance=$(echo "$result" | jq -r '.instance')
  local status=$(echo "$result" | jq -r '.status')
  local response_time=$(echo "$result" | jq -r '.response_time_ms // "N/A"')
  local endpoint=$(echo "$result" | jq -r '.endpoint // "N/A"')
  local model=$(echo "$result" | jq -r '.model // ""')
  
  case "$status" in
    healthy)
      echo "✅ $instance: healthy (${response_time}ms) [$endpoint] $model"
      ;;
    healthy_fallback)
      echo "⚠️  $instance: healthy via IP fallback (${response_time}ms) [$endpoint] $model"
      ;;
    unhealthy)
      local http_code=$(echo "$result" | jq -r '.http_code // "timeout"')
      echo "❌ $instance: unhealthy (HTTP $http_code) [$endpoint]"
      ;;
    error)
      local message=$(echo "$result" | jq -r '.message // "unknown"')
      echo "❌ $instance: $message"
      ;;
  esac
}

# Run health checks
run_health_checks() {
  local results=()
  
  if [[ -n "$TARGET" ]]; then
    # Check specific target
    if [[ "$TARGET" == "$SELF" ]]; then
      echo "⚠️  Skipping self ($SELF)"
      return 0
    fi
    
    local result=$(check_instance "$TARGET")
    results+=("$result")
  else
    # Check all instances except self
    for name in $(jq -r '.instances | keys[]' "$TARGETS_FILE"); do
      if [[ "$name" == "$SELF" ]]; then
        continue
      fi
      
      local result=$(check_instance "$name")
      results+=("$result")
    done
  fi
  
  # Output results
  if [[ "$JSON_OUTPUT" == true ]]; then
    echo "{"
    echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
    echo "  \"self\": \"$SELF\","
    echo "  \"checks\": ["
    for i in "${!results[@]}"; do
      echo "    ${results[$i]}"
      if [[ $((i + 1)) -lt ${#results[@]} ]]; then
        echo ","
      fi
    done
    echo "  ]"
    echo "}"
  else
    echo "=== Vroth Collective Health Check ==="
    echo "Instance: $SELF"
    echo "Time: $(date)"
    echo ""
    for result in "${results[@]}"; do
      pretty_print "$result"
    done
    
    # Summary
    local total=${#results[@]}
    local healthy=$(printf '%s\n' "${results[@]}" | jq -s '[.[] | select(.status=="healthy" or .status=="healthy_fallback")] | length')
    local unhealthy=$((total - healthy))
    
    echo ""
    echo "Summary: $healthy/$total healthy"
    if [[ $unhealthy -gt 0 ]]; then
      echo "⚠️  $unhealthy instance(s) unhealthy or unreachable"
      return 1
    fi
  fi
}

# Monitor mode - continuous health checks
monitor() {
  echo "Starting continuous health monitoring (Ctrl+C to stop)..."
  echo ""
  
  while true; do
    clear
    run_health_checks
    sleep 30
  done
}

# Main
if [[ "$MONITOR_MODE" == true ]]; then
  monitor
else
  run_health_checks
fi
