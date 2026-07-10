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

- use [render.yaml](render.yaml) with Blueprint deploy
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
- `MAX_MESSAGE_BYTES`: websocket payload ceiling. Default `8388608` (8 MiB), large enough for initial VTT Yjs room seeds with map/token metadata.
- `ROOM_IDLE_TTL_MS`: how long an empty room can sit before cleanup.

Room state is intentionally memory-only. A Render restart or idle-room cleanup drops the warm Yjs document; Supabase room snapshots remain the durable recovery source.

For VTT rooms, the GM is the only cold-start authority. In live relay mode, player browsers do not load VTT state from local storage or Supabase; they wait for the GM-seeded Render room. The GM browser loads/saves the low-frequency Supabase room snapshot and seeds the in-memory Render Yjs document.

## Optional Local Smoke Test

If you want to test before deploying:

```bash
npm install
cp .env.example .env
npm run dev
```

Then point a temporary config at `ws://localhost:10000`.

## Endpoints

- `/healthz`: health plus per-room client counts, seeded state, Yjs update/sync counts, and last-activity ages
- `/info`: compact service metadata and websocket query requirements

## Manual VTT Verification

- Start the relay locally with `npm run dev`, or use the deployed Render service.
- Open `vtt.html` in a DM browser and a player browser using the same campaign and case.
- Confirm both clients load the same initial Supabase/cold snapshot.
- Move a token in the DM view; the player view should update through the Render relay without high-frequency Supabase writes.
- Move a token in the player view where permissions allow; the DM view should update.
- If a player opens the VTT before the GM, the chip should wait for the GM to seed the Render room instead of treating the player's cold snapshot as authoritative.
- Reload the player browser; it should receive the current warm Render Yjs room state.
- Kill and restart the relay; clients should leave `LIVE`, show reconnecting/degraded, then recover when the relay is reachable again.
- Open `/healthz` and confirm the VTT room shows `seeded: true`, with `updateCount` and `syncMessageCount` increasing during Yjs activity.
- Confirm the VTT chip only shows `LIVE` after Yjs sync/update activity, not merely after presence appears.
