#!/bin/bash
# setup-deploy-access.sh — Configure deploy CLI auth for all services
# Run once after container start (or after token changes)
# Part of agent-mobile infra — committed for permanence
set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; }

echo "═══════════════════════════════════════════"
echo "  Deploy Access Setup — agent-mobile"
echo "═══════════════════════════════════════════"
echo ""

# ─── Supabase CLI ───────────────────────────────────────
echo "── Supabase CLI ──"
if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
    fail "SUPABASE_ACCESS_TOKEN not set. Add to .env and restart container."
else
    # Verify token works
    if supabase projects list &>/dev/null; then
        ok "Supabase authenticated"
        
        # Known projects to link
        declare -A SUPABASE_PROJECTS=(
            ["myria"]="fgntevxilzimiynbsnee"
            ["eth-arb-bot"]="geycrylkddzsegdefgas"
            ["bitcoinhashratetwitter"]="qyhcoodzhzaxllgghird"
        )
        
        for project in "${!SUPABASE_PROJECTS[@]}"; do
            ref="${SUPABASE_PROJECTS[$project]}"
            project_dir="/home/agent/projects/$project"
            
            if [ -d "$project_dir" ]; then
                # Check if already linked
                if [ -f "$project_dir/supabase/.temp/project-ref" ]; then
                    existing_ref=$(cat "$project_dir/supabase/.temp/project-ref" 2>/dev/null || echo "")
                    if [ "$existing_ref" = "$ref" ]; then
                        ok "  $project already linked → $ref"
                        continue
                    fi
                fi
                
                # Link project
                echo "  Linking $project → $ref ..."
                cd "$project_dir"
                mkdir -p supabase/.temp
                echo "$ref" > supabase/.temp/project-ref
                ok "  $project linked → $ref"
            else
                warn "  $project dir not found at $project_dir (skipped)"
            fi
        done
    else
        fail "Supabase token invalid — check SUPABASE_ACCESS_TOKEN"
    fi
fi
echo ""

# ─── Vercel CLI ─────────────────────────────────────────
echo "── Vercel CLI ──"
if [ -z "${VERCEL_TOKEN:-}" ]; then
    fail "VERCEL_TOKEN not set. Add to .env and restart container."
else
    # Vercel CLI needs --token flag or explicit login
    if vercel whoami --token "$VERCEL_TOKEN" &>/dev/null; then
        VERCEL_USER=$(vercel whoami --token "$VERCEL_TOKEN" 2>/dev/null)
        ok "Vercel authenticated as: $VERCEL_USER"
        
        # Create a global config so --token isn't needed every time
        VERCEL_DIR="/home/agent/.local/share/com.vercel.cli"
        mkdir -p "$VERCEL_DIR"
        cat > "$VERCEL_DIR/auth.json" << EOF
{
  "token": "$VERCEL_TOKEN"
}
EOF
        chown -R agent:agent "$VERCEL_DIR" 2>/dev/null || true
        
        # Also set in vercel's expected config path
        VERCEL_CONFIG="/home/agent/.config/vercel"
        mkdir -p "$VERCEL_CONFIG"
        cat > "$VERCEL_CONFIG/auth.json" << EOF
{
  "token": "$VERCEL_TOKEN"
}
EOF
        chown -R agent:agent "$VERCEL_CONFIG" 2>/dev/null || true
        ok "Vercel auth persisted (no --token needed)"
    else
        fail "Vercel token invalid — check VERCEL_TOKEN"
    fi
fi
echo ""

# ─── Railway CLI ────────────────────────────────────────
echo "── Railway CLI ──"
if [ -z "${RAILWAY_TOKEN:-}" ]; then
    fail "RAILWAY_TOKEN not set. Add to .env and restart container."
else
    # Railway CLI's `railway whoami` often rejects project tokens
    # We use GraphQL API directly (railway-api.sh) — more reliable
    if RAILWAY_TOKEN="$RAILWAY_TOKEN" railway whoami &>/dev/null; then
        ok "Railway CLI authenticated"
    else
        warn "Railway CLI token rejected (common with project tokens)"
        warn "Using GraphQL API script instead (scripts/railway-api.sh)"
        
        # Verify GraphQL works
        if [ -f "/home/agent/clawd/scripts/railway-api.sh" ]; then
            if bash /home/agent/clawd/scripts/railway-api.sh health &>/dev/null; then
                ok "Railway GraphQL API working ✓"
            else
                fail "Railway GraphQL API also failing — token may be expired"
            fi
        else
            warn "railway-api.sh not found — use clawd workspace script"
        fi
    fi
fi
echo ""

# ─── GitHub CLI ─────────────────────────────────────────
echo "── GitHub CLI ──"
if gh auth status &>/dev/null; then
    GH_USER=$(gh api user --jq '.login' 2>/dev/null || echo "unknown")
    ok "GitHub authenticated as: $GH_USER"
else
    if [ -n "${GITHUB_TOKEN:-}" ]; then
        warn "GitHub token set but CLI not authenticated — run: echo \$GITHUB_TOKEN | gh auth login --with-token"
    else
        fail "GITHUB_TOKEN not set"
    fi
fi
echo ""

# ─── Summary ────────────────────────────────────────────
echo "═══════════════════════════════════════════"
echo "  Quick Reference"
echo "═══════════════════════════════════════════"
echo ""
echo "  Supabase:  supabase db dump --project-ref <ref>"
echo "             supabase functions list --project-ref <ref>"
echo "  Vercel:    vercel ls (should work without --token now)"
echo "  Railway:   bash /home/agent/clawd/scripts/railway-api.sh status"
echo "  GitHub:    gh pr list / gh issue list"
echo ""
echo "  Project refs:"
echo "    myria              → fgntevxilzimiynbsnee"
echo "    eth-arb-bot (prod) → geycrylkddzsegdefgas"
echo "    btc-hashrate       → qyhcoodzhzaxllgghird"
echo ""
