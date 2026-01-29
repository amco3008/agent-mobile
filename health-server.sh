#!/bin/bash
# Lightweight HTTP health server on port 18790
# Serves /opt/agent-mobile/healthcheck.sh output as JSON
# Usage: health-server.sh &

PORT=${HEALTH_PORT:-18790}

while true; do
    # Use netcat to listen for HTTP requests and respond with health JSON
    {
        read -r request_line
        # Consume headers
        while read -r header && [ "$header" != $'\r' ] && [ -n "$header" ]; do :; done
        
        # Run healthcheck
        body=$(/opt/agent-mobile/healthcheck.sh 2>/dev/null || echo '{"status":"unhealthy","error":"healthcheck failed"}')
        content_length=${#body}
        
        echo -e "HTTP/1.1 200 OK\r"
        echo -e "Content-Type: application/json\r"
        echo -e "Content-Length: ${content_length}\r"
        echo -e "Access-Control-Allow-Origin: *\r"
        echo -e "Connection: close\r"
        echo -e "\r"
        echo -n "$body"
    } | nc -l -p "$PORT" -q 1 2>/dev/null || sleep 1
done
