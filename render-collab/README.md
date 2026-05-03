# Render Collab Relay

Tiny websocket relay for the hosted stack:

- GitHub Pages serves the app
- Supabase stores campaign state and board snapshots
- Render carries live websocket traffic for `board.html` and `vtt.html`
- Render keeps warm room state in memory so late joiners can sync recent live edits before the next Supabase checkpoint

## Hosted Deployment

Create a Node **Web Service** in Render for this folder.
Deploy it from this full repository so the relay can import the vendored Yjs modules under `js/vendor`.

You can either:

- use [render.yaml](/home/nathm/5e-unified-roller/render-collab/render.yaml) with Blueprint deploy
- or click `New +` -> `Web Service` in Render and enter the settings below manually

Recommended settings:

- Root directory: `render-collab`
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/healthz`
- Environment variable: `ALLOWED_ORIGINS=https://<your-github-pages-origin>`

Do not create a Static Site in Render for the relay. GitHub Pages already serves the app; Render only needs to run the websocket server.

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

Room state is intentionally memory-only. A Render restart or idle-room cleanup drops the warm Yjs document; Supabase room snapshots remain the durable recovery source.

## Optional Local Smoke Test

If you want to test before deploying:

```bash
npm install
cp .env.example .env
npm run dev
```

Then point a temporary config at `ws://localhost:10000`.

## Endpoints

- `/healthz`: health plus room/client/stateful-room counts
- `/info`: compact service metadata and websocket query requirements
