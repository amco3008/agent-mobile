#!/bin/bash
# deploy-status.sh — Quick health check across all deploy services
# Usage: bash scripts/deploy-status.sh [--verbose]
set -uo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

VERBOSE=${1:-}

ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
info() { echo -e "  ${CYAN}ℹ${NC} $1"; }

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║       Deploy Status — All Services        ║"
echo "╚═══════════════════════════════════════════╝"
echo ""

# ─── Supabase ───────────────────────────────────────────
echo "── Supabase ──"
if [ -n "${SUPABASE_ACCESS_TOKEN:-}" ]; then
    PROJECT_COUNT=$(supabase projects list 2>/dev/null | grep -c '|' || echo 0)
    # Subtract header rows
    PROJECT_COUNT=$((PROJECT_COUNT > 2 ? PROJECT_COUNT - 2 : 0))
    ok "Authenticated — $PROJECT_COUNT projects accessible"
    
    if [ "$VERBOSE" = "--verbose" ]; then
        # Check key projects
        for ref in fgntevxilzimiynbsnee geycrylkddzsegdefgas; do
            name=$(supabase projects list 2>/dev/null | grep "$ref" | awk -F'|' '{print $4}' | xargs)
            if [ -n "$name" ]; then
                info "  $name ($ref)"
            fi
        done
    fi
else
    fail "SUPABASE_ACCESS_TOKEN not set"
fi
echo ""

# ─── Vercel ─────────────────────────────────────────────
echo "── Vercel ──"
if [ -n "${VERCEL_TOKEN:-}" ]; then
    VERCEL_USER=$(vercel whoami --token "$VERCEL_TOKEN" 2>/dev/null)
    if [ -n "$VERCEL_USER" ]; then
        ok "Authenticated as: $VERCEL_USER"
        
        if [ "$VERBOSE" = "--verbose" ]; then
            # List recent deployments
            info "Recent deployments:"
            vercel ls --token "$VERCEL_TOKEN" 2>/dev/null | head -8 | while read -r line; do
                echo "    $line"
            done
        fi
    else
        fail "Vercel token invalid"
    fi
else
    fail "VERCEL_TOKEN not set"
fi
echo ""

# ─── Railway ────────────────────────────────────────────
echo "── Railway ──"
RAILWAY_SCRIPT="/home/agent/clawd/scripts/railway-api.sh"
if [ -f "$RAILWAY_SCRIPT" ]; then
    HEALTH=$(bash "$RAILWAY_SCRIPT" health 2>&1)
    if echo "$HEALTH" | grep -q "SUCCESS"; then
        PROD_STATUS=$(echo "$HEALTH" | grep "prod:" | head -1)
        DEV_STATUS=$(echo "$HEALTH" | grep "dev:" | head -1)
        ok "API connected"
        [ -n "$PROD_STATUS" ] && info "$PROD_STATUS"
        [ -n "$DEV_STATUS" ] && info "$DEV_STATUS"
    else
        fail "Railway API not responding"
    fi
else
    if RAILWAY_TOKEN="$RAILWAY_TOKEN" railway whoami &>/dev/null; then
        ok "Railway CLI authenticated"
    else
        warn "Railway: no API script and CLI token rejected"
    fi
fi
echo ""

# ─── GitHub ─────────────────────────────────────────────
echo "── GitHub ──"
if gh auth status &>/dev/null; then
    GH_USER=$(gh api user --jq '.login' 2>/dev/null || echo "unknown")
    ok "Authenticated as: $GH_USER"
    
    if [ "$VERBOSE" = "--verbose" ]; then
        # Check for open PRs on key repos
        for repo in amco3008/agent-mobile; do
            PR_COUNT=$(gh pr list --repo "$repo" --state open 2>/dev/null | wc -l)
            info "  $repo: $PR_COUNT open PRs"
        done
    fi
else
    fail "GitHub CLI not authenticated"
fi
echo ""

# ─── Tailscale ──────────────────────────────────────────
echo "── Tailscale ──"
if tailscale status &>/dev/null; then
    HOSTNAME=$(tailscale status --json 2>/dev/null | jq -r '.Self.HostName // "unknown"')
    ok "Connected as: $HOSTNAME"
else
    fail "Tailscale not connected"
fi
echo ""

echo "────────────────────────────────────────────"
echo "  $(date '+%Y-%m-%d %H:%M:%S UTC')"
echo ""
