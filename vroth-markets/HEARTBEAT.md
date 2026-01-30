# HEARTBEAT.md - Vroth-Markets

## Every Heartbeat (NO EXCEPTIONS)

### Step 1: Bot Health Check
```bash
bash /home/agent/clawd/scripts/railway-api.sh logs prod 20
bash /home/agent/clawd/scripts/railway-api.sh logs dev 20
```
- Any errors? → Alert group immediately
- Position changes? → Report in group

### Step 2: P&L Status
- Extract current P&L from logs
- Compare to last known state
- Report if changed by > $50 or any new trades

### Step 3: Market Scan
- Check for new high-edge opportunities
- Monitor existing position health
- Flag any risk concerns

### Step 4: Report to Group
Format:
```
📊 [HH:MM] Bot Status
Live: $XXX (X open) | Paper: $XXk (+XX%)
Trades: X new since last check
Alerts: None / [details]
```

## Rules
- ALWAYS report something — never silent
- Errors = immediate @VrothCore alert
- Loss > $100 = immediate @Matthew alert
- Keep reports to 3-5 lines max
