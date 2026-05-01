-- Supabase row-normalized sync schema v2
-- Safe to run multiple times.
--
-- This schema is intentionally pragmatic: every independently edited object has
-- a row, common query/display fields are real columns, and `extra` carries
-- uncommon legacy/plugin fields during the migration window.

begin;

do $$
declare
  t text;
begin
  foreach t in array array[
    'rtf_v2_campaigns',
    'rtf_v2_campaign_fields',
    'rtf_v2_campaign_rep',
    'rtf_v2_campaign_scopes',
    'rtf_v2_campaign_scope_cases',
    'rtf_v2_cases',
    'rtf_v2_case_events',
    'rtf_v2_case_leads',
    'rtf_v2_players',
    'rtf_v2_player_projects',
    'rtf_v2_npcs',
    'rtf_v2_npc_tags',
    'rtf_v2_npc_relationships',
    'rtf_v2_locations',
    'rtf_v2_location_tags',
    'rtf_v2_location_links',
    'rtf_v2_requisitions',
    'rtf_v2_requisition_history',
    'rtf_v2_encounters',
    'rtf_v2_encounter_participants',
    'rtf_v2_hq_floors',
    'rtf_v2_hq_rooms',
    'rtf_v2_board_nodes',
    'rtf_v2_board_edges',
    'rtf_v2_vtt_scenes',
    'rtf_v2_vtt_tokens',
    'rtf_v2_vtt_templates',
    'rtf_v2_vtt_fog',
    'rtf_v2_vtt_initiative'
  ] loop
    execute format($sql$
      create table if not exists public.%I (
        campaign_id text not null,
        id text not null,
        parent_id text not null default '',
        scope text not null,
        sort_order integer not null default 0,
        kind text not null default '',
        name text not null default '',
        title text not null default '',
        type text not null default '',
        status text not null default '',
        source_id text not null default '',
        target_id text not null default '',
        value_text text not null default '',
        value_number numeric,
        x numeric,
        y numeric,
        width numeric,
        height numeric,
        extra jsonb not null default '{}'::jsonb,
        revision bigint not null default 0,
        updated_at timestamptz not null default timezone('utc', now()),
        updated_by text,
        updated_by_user uuid references auth.users(id) on delete set null,
        updated_by_name text,
        deleted_at timestamptz,
        primary key (campaign_id, id)
      );
    $sql$, t);

    execute format('create index if not exists %I on public.%I (campaign_id, scope, updated_at desc);', t || '_scope_idx', t);
    execute format('create index if not exists %I on public.%I (campaign_id, parent_id, sort_order, id);', t || '_parent_idx', t);
    execute format('create index if not exists %I on public.%I (campaign_id, updated_at desc);', t || '_updated_idx', t);
  end loop;
end
$$;

create table if not exists public.rtf_v2_sync_versions (
  campaign_id text not null,
  scope text not null,
  table_name text not null,
  row_id text not null default '',
  exists boolean not null default true,
  revision bigint not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by text,
  updated_by_user uuid references auth.users(id) on delete set null,
  updated_by_name text,
  primary key (campaign_id, scope)
);

create index if not exists rtf_v2_sync_versions_campaign_revision_idx
  on public.rtf_v2_sync_versions (campaign_id, revision, updated_at);

create table if not exists public.rtf_v2_sync_tombstones (
  campaign_id text not null,
  table_name text not null,
  row_id text not null,
  scope text not null,
  revision bigint not null default 0,
  deleted_at timestamptz not null default timezone('utc', now()),
  updated_by text,
  updated_by_user uuid references auth.users(id) on delete set null,
  updated_by_name text,
  primary key (campaign_id, table_name, row_id)
);

create index if not exists rtf_v2_sync_tombstones_campaign_revision_idx
  on public.rtf_v2_sync_tombstones (campaign_id, revision, deleted_at);

do $$
declare
  t text;
begin
  foreach t in array array[
    'rtf_v2_campaigns',
    'rtf_v2_campaign_fields',
    'rtf_v2_campaign_rep',
    'rtf_v2_campaign_scopes',
    'rtf_v2_campaign_scope_cases',
    'rtf_v2_cases',
    'rtf_v2_case_events',
    'rtf_v2_case_leads',
    'rtf_v2_players',
    'rtf_v2_player_projects',
    'rtf_v2_npcs',
    'rtf_v2_npc_tags',
    'rtf_v2_npc_relationships',
    'rtf_v2_locations',
    'rtf_v2_location_tags',
    'rtf_v2_location_links',
    'rtf_v2_requisitions',
    'rtf_v2_requisition_history',
    'rtf_v2_encounters',
    'rtf_v2_encounter_participants',
    'rtf_v2_hq_floors',
    'rtf_v2_hq_rooms',
    'rtf_v2_board_nodes',
    'rtf_v2_board_edges',
    'rtf_v2_vtt_scenes',
    'rtf_v2_vtt_tokens',
    'rtf_v2_vtt_templates',
    'rtf_v2_vtt_fog',
    'rtf_v2_vtt_initiative',
    'rtf_v2_sync_versions',
    'rtf_v2_sync_tombstones'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t || '_auth_rw', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true);',
      t || '_auth_rw',
      t
    );
  end loop;
end
$$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.rtf_v2_sync_versions;
  exception
    when duplicate_object then null;
    when undefined_object then
      raise notice 'Publication supabase_realtime not found. Add public.rtf_v2_sync_versions manually after enabling Realtime.';
  end;
end
$$;

-- Starter legacy backfill. The client-side "Save This State as Canonical" path
-- writes the complete row set, including board/VTT/HQ child rows.
do $$
begin
  if to_regclass('public.rtf_campaign_state') is null then
    raise notice 'Legacy table public.rtf_campaign_state not found. Skipping v2 starter backfill.';
    return;
  end if;

  insert into public.rtf_v2_campaigns (
    campaign_id, id, scope, kind, name, extra, revision, updated_at, updated_by, updated_by_user, updated_by_name
  )
  select
    campaign_id,
    'campaign',
    'campaign',
    'campaign',
    campaign_id,
    jsonb_build_object('meta', coalesce(state #> '{meta}', '{}'::jsonb)),
    coalesce((state #>> '{meta,syncRevision}')::bigint, 0),
    coalesce(updated_at, timezone('utc', now())),
    updated_by,
    updated_by_user,
    updated_by_name
  from public.rtf_campaign_state
  on conflict (campaign_id, id) do update set
    extra = excluded.extra,
    revision = greatest(public.rtf_v2_campaigns.revision, excluded.revision),
    updated_at = greatest(public.rtf_v2_campaigns.updated_at, excluded.updated_at);

  insert into public.rtf_v2_campaign_fields (
    campaign_id, id, scope, kind, title, value_number, extra, revision, updated_at, updated_by, updated_by_user, updated_by_name
  )
  select campaign_id, id, scope, kind, title, value_number, extra, revision, updated_at, updated_by, updated_by_user, updated_by_name
  from (
    select
      s.campaign_id,
      ('campaign-field.' || f.id) as id,
      f.scope,
      f.kind,
      f.title,
      f.value_number,
      f.extra,
      coalesce((s.state #>> '{meta,syncRevision}')::bigint, 0) as revision,
      coalesce(s.updated_at, timezone('utc', now())) as updated_at,
      s.updated_by,
      s.updated_by_user,
      s.updated_by_name
    from public.rtf_campaign_state s
    cross join lateral (
      values
        ('heat', 'campaign.heat', 'campaign-field', '', case when coalesce(s.state #>> '{campaign,heat}', '') ~ '^-?[0-9]+(?:\.[0-9]+)?$' then (s.state #>> '{campaign,heat}')::numeric else 0 end, jsonb_build_object('value', coalesce(s.state #> '{campaign,heat}', '0'::jsonb))),
        ('cognitive-risk', 'campaign.cognitiveRisk', 'campaign-field', '', case when coalesce(s.state #>> '{campaign,cognitiveRisk}', '') ~ '^-?[0-9]+(?:\.[0-9]+)?$' then (s.state #>> '{campaign,cognitiveRisk}')::numeric else 0 end, jsonb_build_object('value', coalesce(s.state #> '{campaign,cognitiveRisk}', '0'::jsonb))),
        ('case', 'campaign.case', 'campaign-field', coalesce(s.state #>> '{campaign,case,title}', ''), null::numeric, coalesce(s.state #> '{campaign,case}', '{}'::jsonb)),
        ('ledger', 'campaign.ledger', 'ledger', '', null::numeric, coalesce(s.state #> '{campaign,ledger}', '{"entries":[],"ui":{"filter":"all","search":"","sort":"updated_desc"}}'::jsonb)),
        ('context', 'campaign.context', 'campaign-context', '', null::numeric, coalesce(s.state #> '{campaignContext}', '{}'::jsonb)),
        ('meta', 'campaign.meta', 'campaign-meta', '', null::numeric, coalesce(s.state #> '{campaignMeta}', '{}'::jsonb)),
        ('hq-meta', 'hq', 'hq-meta', '', null::numeric, jsonb_build_object(
          'grid', coalesce(s.state #> '{hq,grid}', '{}'::jsonb),
          'snapToGrid', coalesce(s.state #> '{hq,snapToGrid}', 'true'::jsonb),
          'activeFloorId', coalesce(s.state #> '{hq,activeFloorId}', '""'::jsonb)
        ))
    ) as f(id, scope, kind, title, value_number, extra)
  ) src
  on conflict (campaign_id, id) do update set
    title = excluded.title,
    value_number = excluded.value_number,
    extra = excluded.extra,
    revision = greatest(public.rtf_v2_campaign_fields.revision, excluded.revision),
    updated_at = greatest(public.rtf_v2_campaign_fields.updated_at, excluded.updated_at);

  insert into public.rtf_v2_campaign_rep (
    campaign_id, id, scope, kind, name, value_number, extra, revision, updated_at, updated_by, updated_by_user, updated_by_name
  )
  select
    s.campaign_id,
    'campaign-rep.' || regexp_replace(lower(rep.key), '[^a-z0-9_-]+', '-', 'g'),
    'campaign.rep.' || regexp_replace(lower(rep.key), '[^a-z0-9_-]+', '-', 'g'),
    'campaign-rep',
    rep.key,
    case when coalesce(rep.value #>> '{}', '') ~ '^-?[0-9]+(?:\.[0-9]+)?$' then (rep.value #>> '{}')::numeric else 0 end,
    jsonb_build_object('guild', rep.key, 'value', rep.value),
    coalesce((s.state #>> '{meta,syncRevision}')::bigint, 0),
    coalesce(s.updated_at, timezone('utc', now())),
    s.updated_by,
    s.updated_by_user,
    s.updated_by_name
  from public.rtf_campaign_state s
  cross join lateral jsonb_each(coalesce(s.state #> '{campaign,rep}', '{}'::jsonb)) as rep
  on conflict (campaign_id, id) do update set
    value_number = excluded.value_number,
    extra = excluded.extra,
    revision = greatest(public.rtf_v2_campaign_rep.revision, excluded.revision),
    updated_at = greatest(public.rtf_v2_campaign_rep.updated_at, excluded.updated_at);

  insert into public.rtf_v2_players (
    campaign_id, id, scope, sort_order, kind, name, source_id, value_number, extra, revision, updated_at, updated_by, updated_by_user, updated_by_name
  )
  select
    s.campaign_id,
    'player.' || coalesce(nullif(item->>'id', ''), 'player_' || ord::text),
    'campaign.players.' || coalesce(nullif(item->>'id', ''), 'player_' || ord::text),
    ord - 1,
    'players',
    coalesce(item->>'name', ''),
    coalesce(item->>'sheetKey', ''),
    case when coalesce(item->>'dp', '') ~ '^-?[0-9]+(?:\.[0-9]+)?$' then (item->>'dp')::numeric else null end,
    item,
    coalesce((s.state #>> '{meta,syncRevision}')::bigint, 0),
    coalesce(s.updated_at, timezone('utc', now())),
    s.updated_by,
    s.updated_by_user,
    s.updated_by_name
  from public.rtf_campaign_state s
  cross join lateral jsonb_array_elements(coalesce(s.state #> '{campaign,players}', '[]'::jsonb)) with ordinality as arr(item, ord)
  on conflict (campaign_id, id) do update set
    name = excluded.name,
    source_id = excluded.source_id,
    value_number = excluded.value_number,
    extra = excluded.extra,
    revision = greatest(public.rtf_v2_players.revision, excluded.revision),
    updated_at = greatest(public.rtf_v2_players.updated_at, excluded.updated_at);

  insert into public.rtf_v2_npcs (
    campaign_id, id, scope, sort_order, kind, name, type, status, extra, revision, updated_at, updated_by, updated_by_user, updated_by_name
  )
  select
    s.campaign_id,
    'npc.' || coalesce(nullif(item->>'id', ''), 'npc_' || ord::text),
    'campaign.npcs.' || coalesce(nullif(item->>'id', ''), 'npc_' || ord::text),
    ord - 1,
    'npcs',
    coalesce(item->>'name', ''),
    coalesce(item->>'guild', ''),
    coalesce(item->>'status', ''),
    item,
    coalesce((s.state #>> '{meta,syncRevision}')::bigint, 0),
    coalesce(s.updated_at, timezone('utc', now())),
    s.updated_by,
    s.updated_by_user,
    s.updated_by_name
  from public.rtf_campaign_state s
  cross join lateral jsonb_array_elements(coalesce(s.state #> '{campaign,npcs}', '[]'::jsonb)) with ordinality as arr(item, ord)
  on conflict (campaign_id, id) do update set
    name = excluded.name,
    type = excluded.type,
    status = excluded.status,
    extra = excluded.extra,
    revision = greatest(public.rtf_v2_npcs.revision, excluded.revision),
    updated_at = greatest(public.rtf_v2_npcs.updated_at, excluded.updated_at);

  insert into public.rtf_v2_locations (
    campaign_id, id, scope, sort_order, kind, name, type, extra, revision, updated_at, updated_by, updated_by_user, updated_by_name
  )
  select
    s.campaign_id,
    'loc.' || coalesce(nullif(item->>'id', ''), 'loc_' || ord::text),
    'campaign.locations.' || coalesce(nullif(item->>'id', ''), 'loc_' || ord::text),
    ord - 1,
    'locations',
    coalesce(item->>'name', ''),
    coalesce(item->>'district', ''),
    item,
    coalesce((s.state #>> '{meta,syncRevision}')::bigint, 0),
    coalesce(s.updated_at, timezone('utc', now())),
    s.updated_by,
    s.updated_by_user,
    s.updated_by_name
  from public.rtf_campaign_state s
  cross join lateral jsonb_array_elements(coalesce(s.state #> '{campaign,locations}', '[]'::jsonb)) with ordinality as arr(item, ord)
  on conflict (campaign_id, id) do update set
    name = excluded.name,
    type = excluded.type,
    extra = excluded.extra,
    revision = greatest(public.rtf_v2_locations.revision, excluded.revision),
    updated_at = greatest(public.rtf_v2_locations.updated_at, excluded.updated_at);

  insert into public.rtf_v2_cases (
    campaign_id, id, scope, sort_order, kind, name, status, extra, revision, updated_at, updated_by, updated_by_user, updated_by_name
  )
  select
    s.campaign_id,
    'case.' || coalesce(nullif(item->>'id', ''), 'case_' || ord::text),
    'cases.' || coalesce(nullif(item->>'id', ''), 'case_' || ord::text),
    ord - 1,
    'case',
    coalesce(item->>'name', 'Primary Case'),
    case when coalesce(item->>'id', '') = coalesce(s.state #>> '{cases,activeCaseId}', '') then 'active' else '' end,
    jsonb_build_object('id', coalesce(nullif(item->>'id', ''), 'case_' || ord::text), 'name', coalesce(item->>'name', 'Primary Case')),
    coalesce((s.state #>> '{meta,syncRevision}')::bigint, 0),
    coalesce(s.updated_at, timezone('utc', now())),
    s.updated_by,
    s.updated_by_user,
    s.updated_by_name
  from public.rtf_campaign_state s
  cross join lateral jsonb_array_elements(coalesce(s.state #> '{cases,items}', '[]'::jsonb)) with ordinality as arr(item, ord)
  on conflict (campaign_id, id) do update set
    name = excluded.name,
    status = excluded.status,
    extra = excluded.extra,
    revision = greatest(public.rtf_v2_cases.revision, excluded.revision),
    updated_at = greatest(public.rtf_v2_cases.updated_at, excluded.updated_at);

  raise notice 'Rows v2 starter backfill complete. Use the app canonical push once to fill board, VTT, HQ rooms, requisitions, encounters, and child rows exactly.';
end
$$;

commit;
