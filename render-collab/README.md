# Render Collab Relay

Tiny websocket relay for the hosted stack:

- GitHub Pages serves the app
- Supabase stores campaign state and board snapshots
- Render carries live websocket traffic for `board.html` and `vtt.html`

## Hosted Deployment

Use [render.yaml](/home/nathm/5e-unified-roller/render-collab/render.yaml) to create a Render Web Service from this repo.

Recommended settings:

- Root directory: `render-collab`
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/healthz`
- Environment variable: `ALLOWED_ORIGINS=https://<your-github-pages-origin>`

After deploy, verify:

- `https://<your-render-service>.onrender.com/healthz`
- `https://<your-render-service>.onrender.com/info`

Then put this into Tools Hub or your shared `connect.json`:

```json
{
  "supabaseUrl": "https://YOUR_PROJECT.supabase.co",
  "anonKey": "YOUR_SUPABASE_ANON_KEY",
  "campaignId": "your-campaign",
  "profileName": "",
  "backendMode": "normalized",
  "collabRelayUrl": "wss://your-render-service.onrender.com"
}
```

## Environment

- `PORT`: listen port. Render sets this automatically.
- `HOST`: bind host. Default `0.0.0.0`.
- `SERVICE_NAME`: label used in logs and health output.
- `ALLOWED_ORIGINS`: comma-separated allowlist for websocket `Origin` headers.
- `LOG_CONNECTIONS`: when `true`, logs room joins/leaves.
- `MAX_MESSAGE_BYTES`: websocket payload ceiling.
- `ROOM_IDLE_TTL_MS`: how long an empty room can sit before cleanup.

## Optional Local Smoke Test

If you want to test before deploying:

```bash
npm install
cp .env.example .env
npm run dev
```

Then point a temporary config at `ws://localhost:10000`.

## Endpoints

- `/healthz`: health and room/client counts
- `/info`: compact service metadata and websocket query requirements
