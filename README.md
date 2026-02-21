# Botphone

An AI-powered phone agent that makes outbound calls on your behalf. Give it a phone number and an objective — it calls, talks, and reports back with a transcript and summary.

Supports restaurant reservations, appointment scheduling, info gathering, and general custom objectives. Integrates with Claude.ai via MCP.

## Stack

- **Backend:** Node.js + TypeScript, Express v5
- **Frontend:** React 19 + Vite
- **Database:** PostgreSQL
- **Telephony:** Twilio (outbound calls, media streaming)
- **Voice AI:** OpenAI Realtime API or ElevenLabs (switchable)
- **Auth:** Google OAuth + JWT
- **Deployment:** GCP Cloud Run (auto-deploys on push to `main`)

## Local Setup

### Prerequisites

- Node.js 20+
- A PostgreSQL database (e.g. [Neon](https://neon.tech) or local Docker)
- Twilio account with a phone number
- OpenAI API key
- Google OAuth app ([console.cloud.google.com](https://console.cloud.google.com))
- For local HTTPS tunneling: [ngrok](https://ngrok.com)

### Install

```bash
npm install
cd frontend && npm install && cd ..
```

### Configure

```bash
cp .env.example .env
```

Edit `.env` with your credentials (see [Environment Variables](#environment-variables) below).

### Run

```bash
npm run dev
```

The app runs at `http://localhost:3000`. The frontend dev server is at `http://localhost:5173` (proxied to the backend automatically).

On first run the server initializes the DB schema and prints a default API key to the console — copy it to `DEV_API_KEY` in your `.env` for the frontend dev proxy.

### Expose locally (for Twilio webhooks)

Twilio needs a public URL to deliver call webhooks. Use ngrok:

```bash
ngrok http 3000
```

Set `PUBLIC_URL` in `.env` to the ngrok HTTPS URL, then update your Twilio phone number's voice webhook to `https://<your-ngrok-url>/twilio/voice`.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `TWILIO_ACCOUNT_SID` | ✅ | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | ✅ | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | ✅ | Twilio number to call from (E.164 format) |
| `OPENAI_API_KEY` | ✅ | OpenAI API key (used for voice + summaries) |
| `GOOGLE_OAUTH_CLIENT_ID` | ✅ | Google OAuth client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | ✅ | Google OAuth client secret |
| `JWT_SECRET` | ✅ | Random secret for signing JWTs — generate with `openssl rand -hex 32` |
| `PUBLIC_URL` | ✅ | Public URL for Twilio webhooks (ngrok URL locally, Cloud Run URL in prod) |
| `GOOGLE_PLACES_API_KEY` | Optional | Enables Google Places lookup for restaurant calls |
| `ELEVENLABS_API_KEY` | Optional | Required if using ElevenLabs as the voice provider |
| `ALLOWED_EMAILS` | Optional | Comma-separated list of Google emails allowed to log in (empty = allow all) |
| `OAUTH_ALLOWED_REDIRECT_URIS` | Optional | Allowed OAuth redirect URIs for MCP/Claude.ai integration |
| `DEV_API_KEY` | Optional | API key for the Vite dev proxy (copy from server startup output) |
| `PORT` | Optional | Server port (default: `3000`) |
| `NODE_ENV` | Optional | `development` or `production` |

## Scripts

```bash
npm run dev            # Run backend in watch mode
npm run build          # Compile TypeScript
npm run build:frontend # Build React frontend
npm start              # Run compiled backend
```

## Deployment

The app deploys automatically to **GCP Cloud Run** on every push to `main` via Cloud Build.

- Region: `us-east4`
- Scales to zero when idle (cold start ~8s)
- Max 10 instances

For manual deployment, run:

```bash
./deploy-gcp.sh
```

This builds the Docker image, pushes it to Artifact Registry, deploys to Cloud Run, and prints instructions for updating Twilio and Google OAuth redirect URIs with the new Cloud Run URL.

## MCP Integration

Botphone exposes an MCP server at `/mcp` for use with Claude.ai. To connect:

1. Add `https://<your-app-url>/mcp` as an MCP server in Claude.ai settings
2. Authenticate via the OAuth flow
3. Use the `make_call`, `list_calls`, `get_call`, and `wake` tools in Claude

The `wake` tool is useful for waking the server from a cold start before placing a call.

## Architecture

```
User → Frontend (React)
         ↓ JWT auth
       Backend (Express)
         ↓                    ↓
     PostgreSQL           Twilio outbound call
                              ↓
                     Twilio media stream (WebSocket)
                              ↓
                    OpenAI Realtime API / ElevenLabs
                              ↓
                    Transcript + summary saved to DB
```

**Call lifecycle:**
1. User submits a call via the dashboard or MCP
2. Call stored in DB with status `queued`, Twilio initiates the outbound call
3. When answered, Twilio opens a WebSocket media stream to the backend
4. The media bridge (OpenAI or ElevenLabs) handles the conversation in real time
5. On hang-up, the transcript is persisted and a summary is generated
6. Frontend polls for live transcript during the call; final transcript available after
