# Supabase Sync (`RTF_STORE`)

Optional cloud sync for the shared campaign stack (`hub`, `campaign-board`, `board`, `campaign-timeline`, `timeline`, `roster`, `locations`, `requisitions`, `ledger`, `encounters`, `hq`, `player-dashboard`).

The Character Sheet (`index.html`) is intentionally separate and remains local per browser by default.

Campaign-level meta board/timeline state (`campaign.meta.board`, `campaign.meta.events`) syncs through the same campaign payload path; no legacy table changes are required for that scope expansion.

Realtime board collaboration now uses a dedicated room table plus Supabase Realtime broadcast/presence for `board.html` and `campaign-board.html`. The regular campaign state row still mirrors board snapshots for compatibility, but live board transport no longer depends on the legacy board payload path.

Room checkpoint storage is now hybrid-compatible:
- older rows may still contain plain snapshot JSON in `rtf_board_rooms.payload`
- newer rows can store a compact Yjs checkpoint envelope in the same `jsonb` column
- the client reads both formats and rewrites rooms forward to the compact format on the next save

For higher-concurrency deployments, see the hybrid normalized model:
- `docs/SupabaseSyncNormalized.md`
- `docs/SupabaseSyncNormalized.sql`

## 1. Create Table

Run this in Supabase SQL Editor:

```sql
create table if not exists public.rtf_campaign_state (
  campaign_id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by text,
  updated_by_user uuid references auth.users(id) on delete set null,
  updated_by_name text
);

alter table public.rtf_campaign_state enable row level security;

create table if not exists public.rtf_board_rooms (
  campaign_id text not null,
  room_id text not null,
  board_scope text not null,
  case_id text,
  payload jsonb not null,
  revision bigint not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by text,
  updated_by_user uuid references auth.users(id) on delete set null,
  updated_by_name text,
  primary key (campaign_id, room_id)
);

alter table public.rtf_board_rooms enable row level security;

create table if not exists public.rtf_board_room_history (
  id bigint generated always as identity primary key,
  campaign_id text not null,
  room_id text not null,
  board_scope text not null,
  case_id text,
  payload jsonb not null,
  revision bigint not null default 0,
  reason text not null default 'snapshot',
  captured_at timestamptz not null default timezone('utc', now()),
  captured_by text,
  captured_by_user uuid references auth.users(id) on delete set null,
  captured_by_name text
);

alter table public.rtf_board_room_history enable row level security;
```

## 2. Add Baseline Policy

For fast setup (trusted table/users), allow any authenticated user:

```sql
drop policy if exists "rtf_campaign_state_auth_rw" on public.rtf_campaign_state;
drop policy if exists "rtf_board_rooms_auth_rw" on public.rtf_board_rooms;
drop policy if exists "rtf_board_room_history_auth_rw" on public.rtf_board_room_history;

create policy "rtf_campaign_state_auth_rw"
on public.rtf_campaign_state
for all
to authenticated
using (true)
with check (true);

create policy "rtf_board_rooms_auth_rw"
on public.rtf_board_rooms
for all
to authenticated
using (true)
with check (true);

create policy "rtf_board_room_history_auth_rw"
on public.rtf_board_room_history
for all
to authenticated
using (true)
with check (true);
```

If you need stricter campaign membership policies, add those after initial validation.

## 3. Enable Realtime Postgres Changes (Free-Tier Friendly)

Do this in SQL Editor (not the separate Database Replication/ETL feature):

```sql
alter publication supabase_realtime
add table public.rtf_campaign_state;

alter publication supabase_realtime
add table public.rtf_board_rooms;
```

If the table is already in the publication, Supabase may return a harmless duplicate-entry style message.

This project uses Realtime Postgres Changes. It does **not** require the paid/alpha Database Replication pipeline.

## 4. Enable Anonymous Auth (Recommended)

This app auto-signs in anonymously for shared tablet/URL use:

1. Go to `Authentication` -> `Providers`.
2. Enable `Anonymous` provider.

If you do not want anonymous auth, use email magic links and custom policies.

## 5. Configure In Tools Hub

Open `tools.html` and fill the Cloud Sync panel:

- `Project URL`: `https://<project-ref>.supabase.co`
- `Anon Key`: Supabase anon/public key
- `Campaign ID`: shared slug like `ravnica-main`
- `Profile Name`: optional display label

### Where To Find These

- `Project URL`:
  - Supabase dashboard -> `Settings` -> `API` -> `Project URL`
- `Anon Key`:
  - Supabase dashboard -> `Settings` -> `API` -> `Project API keys` -> `anon` / `public`
- `Campaign ID` (shared slug):
  - You choose this value. Everyone joining the same campaign must use the exact same string.
  - Recommended format: lowercase with dashes, e.g. `ravnica-main`, `table-alpha-2026`.
  - Avoid spaces/special characters to prevent typo mismatches.
- `Profile Name`:
  - Any label you want shown in sync metadata, e.g. `DM-Laptop`, `Player-Tablet-1`.

Then click:

- `Save Config`
- `Connect`

Use `Pull Latest` and `Push Now` for manual control. Non-Yjs campaign pages show `Editing` while local edits are pending, then auto-sync after 8 seconds of inactivity. Board/VTT collaboration uses Yjs for live traffic; Supabase room writes are slower checkpoints for restoring state between sessions, with final flushes on hide/unload/manual save.

DM/GM mode also includes **Save This State as Canonical**. Use it only when this browser should overwrite the shared campaign state in Supabase, such as after resolving stale local data by inspection. Board/VTT live rooms are separate checkpoint rows; use **Board Recovery** to promote a browser mirror or restore room snapshots.

## 6. `connect.json` Workflow (Recommended For Players)

This project supports a simple `connect.json` profile so players do not need to manually enter Supabase details.

### DM Flow

1. Open `tools.html`.
2. Enter cloud settings in secret mode (`Alt+Shift+Click` title).
3. Click `Export connect.json`.
4. Share that file with players.

If you already filled in `Collab Relay URL (Optional)`, that relay URL is exported too.

### Player Flow

1. Open `tools.html`.
2. Click `Import connect.json`.
3. Select DM-provided file.
4. Sync connects automatically.

### Bundled Default (Optional)

If you place a `connect.json` file at the site root (same level as `tools.html`), Tools Hub will auto-apply it on first run when no sync config is already saved locally.

### `connect.json` Format

```json
{
  "supabaseUrl": "https://your-project-ref.supabase.co",
  "anonKey": "your-anon-public-key",
  "campaignId": "ravnica-main",
  "profileName": "",
  "collabRelayUrl": "wss://your-render-service.onrender.com",
  "login": {
    "email": "players@example.com",
    "password": "shared-player-password"
  }
}
```

Accepted aliases are also supported:
- `projectUrl` or `url` for `supabaseUrl`
- `key` or `publicKey` for `anonKey`
- `slug` or `campaign` for `campaignId`
- `collabServerUrl` or `relayUrl` for `collabRelayUrl`
- `loginEmail` / `loginPassword` or top-level `email` / `password` for the shared player login

If `login.email` and `login.password` are present, importing `connect.json` signs in with that shared Supabase Auth account before connecting sync. This is meant for a generic table/player login, not per-player identity.

## Notes

- Sync is offline-first: local state always saves immediately.
- First cloud connect in a browser session force-pulls remote state; remote is treated as source-of-truth at initial load.
- Remote sync now uses optimistic conflict checks with per-state `meta.syncRevision`.
- In normalized mode, routine row edits for players, NPCs, locations, requisitions, encounters, and timeline events auto-resolve against newer remote rows.
- Conflicts now mostly mean protected shared scopes such as boards, HQ, ledger/core payloads, or bulk collection edits. Resolve those from `tools.html` (`Accept Remote` or `Keep Local + Merge Push`).
- Non-overlapping changes still auto-merge by scope.
- Reconciliation pulls run every few seconds while connected, and returning to a tab triggers a quick catch-up pull.
- Realtime presence advertises active peers and soft-lock scopes to reduce accidental overwrite collisions. Soft locks remain advisory for routine row edits.
- Campaign tools share one cloud row per `campaign_id` (including campaign meta board/timeline payloads).
- Case Board and Campaign Board layout (`x/y`) is now shared live per room, with cursors, drag previews, and text-edit locks carried by the board collaboration channel.
- Tools Hub secret mode now includes **Board Recovery** for recent snapshot restore, promoting this browser's mirrored board to live, busting a corrupted live room, and clearing this browser's stale room cache.
- The board room ids are `case:<case_id>` for case boards and `campaign:meta` for the campaign board.
- Character sheets are not part of this sync path unless you add a separate sheet sync layer.

## Board Recovery Workflow

When a board room goes bad:

1. Open `tools.html`, toggle secret mode (`Alt+Shift+Click` title), and use **Board Recovery**.
2. If a recent snapshot is correct, restore it directly from the snapshot list.
3. If the live room itself is corrupted, click **Bust Live Room**. This archives the current live payload, broadcasts a reset to connected boards, and deletes the live row.
4. On stale browsers, click **Clear This Browser Cache** so they do not reseed the bad room from local IndexedDB/store mirrors.
5. Open the correct board in a clean browser, or use **Promote This Browser Mirror** from that browser's Tools Hub, to seed the room again.

## Related Project
For a less setting-specific version of this toolset, see [5e-unified-roller-base](https://github.com/zengulus-d-and-d-tools/5e-unified-roller-base).
