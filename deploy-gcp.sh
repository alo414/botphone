#!/bin/bash
set -e

PROJECT=botphone-2024
REGION=us-east4
IMAGE=us-east4-docker.pkg.dev/botphone-2024/call-agent/call-agent:latest
SERVICE=call-agent
ENV_YAML=/tmp/call-agent-env.yaml

echo "==> Deploying $SERVICE to Cloud Run ($PROJECT / $REGION)..."

# Convert .env to YAML for --env-vars-file (handles special chars safely)
python3 - <<'PYEOF'
import re, sys

env_vars = {}
with open('.env') as f:
    for line in f:
        line = line.rstrip('\n')
        # Skip comments and blank lines
        if re.match(r'^\s*#', line) or not line.strip():
            continue
        key, _, value = line.partition('=')
        key = key.strip()
        if not key:
            continue
        # Strip surrounding quotes
        value = value.strip()
        if len(value) >= 2 and ((value[0] == '"' and value[-1] == '"') or
                                  (value[0] == "'" and value[-1] == "'")):
            value = value[1:-1]
        env_vars[key] = value

# Overrides for Cloud Run
env_vars.pop('PORT', None)
env_vars['NODE_ENV'] = 'production'
# Use placeholder; updated after first deploy
env_vars.setdefault('PUBLIC_URL', 'https://placeholder.example.com')
env_vars['PUBLIC_URL'] = 'https://placeholder.example.com'

with open('/tmp/call-agent-env.yaml', 'w') as f:
    for k, v in env_vars.items():
        # YAML block scalar: use double-quoted strings, escape backslash and quotes
        v_escaped = v.replace('\\', '\\\\').replace('"', '\\"')
        f.write(f'{k}: "{v_escaped}"\n')

print("Env vars YAML written.")
PYEOF

gcloud run deploy "$SERVICE" \
  --image="$IMAGE" \
  --platform=managed \
  --region="$REGION" \
  --project="$PROJECT" \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=10 \
  --memory=512Mi \
  --cpu=1 \
  --port=3000 \
  --env-vars-file="$ENV_YAML"

# Get the deployed URL and update PUBLIC_URL
echo ""
echo "==> Fetching service URL..."
SERVICE_URL=$(gcloud run services describe "$SERVICE" \
  --region="$REGION" \
  --project="$PROJECT" \
  --format='value(status.url)')

echo "==> Service URL: $SERVICE_URL"
echo "==> Updating PUBLIC_URL..."

gcloud run services update "$SERVICE" \
  --region="$REGION" \
  --project="$PROJECT" \
  --update-env-vars="PUBLIC_URL=$SERVICE_URL"

echo ""
echo "Deployment complete!"
echo "  URL: $SERVICE_URL"
echo ""
echo "Next steps:"
echo "  1. Update Twilio webhook URL to: $SERVICE_URL/twilio/voice"
echo "  2. Add Google OAuth redirect URIs in console.cloud.google.com:"
echo "       $SERVICE_URL/oauth/callback   (MCP / Claude.ai)"
echo "       $SERVICE_URL/api/auth/callback  (frontend login)"
