# Render Collab Relay

This repo now includes a minimal websocket relay for live Yjs board/VTT transport under [render-collab/server.js](/home/nathm/5e-unified-roller/render-collab/server.js).

## What it does

- Relays live board/VTT websocket messages room-by-room
- Mirrors presence state for peer cursors/awareness
- Leaves Supabase responsible for auth, room snapshots, and recovery

That means:

- GitHub Pages still serves the app
- Render carries the live collaboration traffic
- Supabase stops acting as the hot path for every collab message

## Deploy on Render

Use [render-collab/render.yaml](/home/nathm/5e-unified-roller/render-collab/render.yaml) or create a Web Service manually:

- Root directory: `render-collab`
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/healthz`
- Plan: `free`

The relay listens on Render's provided `PORT`.

## App config

Add the relay URL to your sync config or `connect.json`:

```json
{
  "supabaseUrl": "https://YOUR_PROJECT.supabase.co",
  "anonKey": "YOUR_SUPABASE_ANON_KEY",
  "campaignId": "your-campaign",
  "backendMode": "normalized",
  "collabRelayUrl": "wss://your-render-service.onrender.com"
}
```

You can also paste the same URL into the Tools sync panel under `Collab Relay URL (Optional)`.

Accepted aliases during import:

- `collabRelayUrl`
- `collabServerUrl`
- `relayUrl`

The current client behavior is:

- if `collabRelayUrl` is present, board/VTT live transport uses the Render relay
- Supabase is still used for room snapshots and recovery
- if `collabRelayUrl` is missing, board/VTT fall back to the current Supabase live transport

## Endpoints

- `/healthz` returns room/client counts for quick verification

## Practical notes

- Render free services can sleep when idle, so the first reconnect after dormancy may be slower.
- This relay is intentionally tiny and room-scoped. It is a good fit for a small hobby deployment, not a hardened production collab cluster.
- The relay protocol is purpose-built to match the app's current board/VTT channel usage, which keeps the migration smaller than swapping the whole client to a different provider in one shot.
