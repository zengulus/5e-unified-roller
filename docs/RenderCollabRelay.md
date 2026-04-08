# Render Collab Relay

This repo now includes a minimal websocket relay for live Yjs board/VTT transport under [render-collab/server.js](/home/nathm/5e-unified-roller/render-collab/server.js).

This is meant for the hosted stack:

- GitHub Pages serves the static app
- Supabase handles auth, room snapshots, and recovery
- Render handles live websocket transport for boards and VTT

If you want the quickest end-to-end path, use these companion files:

- [render-collab/README.md](/home/nathm/5e-unified-roller/render-collab/README.md)
- [render-collab/.env.example](/home/nathm/5e-unified-roller/render-collab/.env.example)
- [render-collab/connect.example.json](/home/nathm/5e-unified-roller/render-collab/connect.example.json)

## What it does

- Relays live board/VTT websocket messages room-by-room
- Mirrors presence state for peer cursors/awareness
- Leaves Supabase responsible for auth, room snapshots, and recovery

That means:

- GitHub Pages still serves the app
- Render carries the live collaboration traffic
- Supabase stops acting as the hot path for every collab message

## Zero To Hero

### 1. Publish the app on GitHub Pages

Push this repo to GitHub and enable Pages for the branch/folder that serves the site.

You should end up with a site URL like:

- `https://<user>.github.io/<repo>/`

Keep that exact origin handy for Render's `ALLOWED_ORIGINS`.

### 2. Set up Supabase

Follow [docs/SupabaseSync.md](/home/nathm/5e-unified-roller/docs/SupabaseSync.md):

- create the required tables
- enable the baseline auth policies
- enable anonymous auth if you want frictionless shared-device/player access
- decide on one shared `campaignId`

You will need:

- `supabaseUrl`
- `anonKey`
- `campaignId`

### 3. Deploy the relay on Render

Use [render-collab/render.yaml](/home/nathm/5e-unified-roller/render-collab/render.yaml) or create a Web Service manually:

- Root directory: `render-collab`
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/healthz`
- Plan: `free`
- Environment variable: `ALLOWED_ORIGINS=https://<your-github-pages-origin>`

After deploy, Render will give you a URL like:

- `https://your-render-service.onrender.com`

Your app should use the websocket form of that URL:

- `wss://your-render-service.onrender.com`

The relay listens on Render's provided `PORT`.

Quick verification:

- open `https://your-render-service.onrender.com/healthz`
- confirm it returns JSON with `"ok": true`
- keep that service awake long enough for your first browser connection test

### 4. Wire the hosted stack together

Put the Render websocket URL into Tools Hub or `connect.json`:

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

Then:

- open `tools.html` on GitHub Pages
- import that config or paste the values into the sync panel
- connect sync
- open `board.html` or `vtt.html` in two browsers/devices using the same campaign
- confirm live presence/cursor/state updates work

### 5. Share with players

From Tools Hub:

- fill in Supabase settings and the Render relay URL
- click `Export connect.json`
- hand that file to players, or bundle it at the site root

Players then only need:

- your GitHub Pages URL
- the DM-provided `connect.json`

### 6. Recovery model

Even with the Render relay enabled:

- Render carries live board/VTT traffic
- Supabase still stores room snapshots and history
- Tools Hub board recovery remains your recovery path if a room goes bad

That is the intended hosted production flow.

## Optional Local Smoke Test

If you want to verify the relay before deploying Render, [render-collab/README.md](/home/nathm/5e-unified-roller/render-collab/README.md) includes a small local run path. It is only a smoke test; the intended real deployment is Render.

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

When you export `connect.json` from Tools Hub, the current relay URL is included automatically.

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
- `/info` returns a compact summary of service options and websocket query params

## Practical notes

- Render free services can sleep when idle, so the first reconnect after dormancy may be slower.
- `ALLOWED_ORIGINS` should match your GitHub Pages origin exactly, including repo pathless origin format such as `https://user.github.io`.
- If you use a custom domain for GitHub Pages, use that domain as the allowed origin instead.
- This relay is intentionally tiny and room-scoped. It is a good fit for a small hobby deployment, not a hardened production collab cluster.
- The relay protocol is purpose-built to match the app's current board/VTT channel usage, which keeps the migration smaller than swapping the whole client to a different provider in one shot.
