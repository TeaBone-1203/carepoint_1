// ============================================================
//  CarePoint — Supabase persistence service
//  Mirrors src/data/db.ts (the in-memory store) into a single
//  JSONB snapshot table, one row per collection.
//
//  Load:  loadSnapshot()   → replaces in-memory DB from server
//  Save:  saveSnapshot()   → upserts the whole in-memory DB
//
//  Both no-op (returning false) when Supabase is not configured,
//  so the app still builds/runs/test offline.
// ============================================================
import { supabase, supabaseEnabled } from '../supabase';
import { DB, counters } from './db';

const TABLE = 'carepoint_snapshot';

/** All mutable arrays + records on the DB object that get persisted. */
export const SNAPSHOT_COLLECTIONS = [
  'pharmacies', 'medicines', 'customers', 'staff', 'admins',
  'orders', 'threads', 'flags', 'reviews', 'notifications',
  'returns', 'notificationLog', 'notifTemplates', 'settings',
  'pages', 'faqs', 'promotions', 'homepageBanner', 'auditLog',
] as const;

export type SnapshotCollection = (typeof SNAPSHOT_COLLECTIONS)[number];

/** Field names the DB stores as Date instances. */
const DATE_KEYS = new Set(['createdAt', 'at']);

// JSON.stringify(DB) turns Dates into ISO strings; revive them.
function reviveDates(key: string, value: unknown): unknown {
  if (DATE_KEYS.has(key) && typeof value === 'string') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return value;
}

function parseJson<T>(raw: string): T {
  return JSON.parse(raw, reviveDates) as T;
}

/** Replace an array/record in place (keeps external references valid). */
function assignInPlace(target: unknown, value: unknown): void {
  if (Array.isArray(target) && Array.isArray(value)) {
    target.length = 0;
    target.push(...value);
    return;
  }
  if (target && typeof target === 'object' && value && typeof value === 'object') {
    Object.keys(target).forEach((k) => delete (target as Record<string, unknown>)[k]);
    Object.assign(target, value);
  }
}

/**
 * Pull every collection from Supabase into the in-memory DB.
 * Returns true when data was applied, false when unavailable.
 */
export async function loadSnapshot(): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, payload');

  if (error) {
    if (error.message?.includes('relation') || error.code === '42P01') {
      console.error(
        '[supabase] Table missing. Run src/data/supabase-schema.sql in your Supabase Dashboard → SQL Editor.',
        error.message,
      );
    } else {
      console.warn('[supabase] loadSnapshot failed:', error.message);
    }
    return false;
  }
  if (!data || data.length === 0) return false;

  const rows = new Map<string, unknown>(data.map((r) => [r.id as string, r.payload]));
  let applied = 0;
  for (const id of SNAPSHOT_COLLECTIONS) {
    const payload = rows.get(id);
    if (payload === undefined) continue;
    const revived = parseJson<unknown>(JSON.stringify(payload));
    assignInPlace((DB as Record<string, unknown>)[id], revived);
    applied += 1;
  }
  console.info(`[supabase] loaded ${applied} collections from server`);

  // Resync auto-increment counters so new IDs don't collide with loaded data.
  if (applied > 0) {
    const nextNum = (list: { id: string }[], prefix: string, fallback: number) => {
      const nums = list.map((r) => parseInt(r.id.replace(prefix, ''), 10)).filter((n) => !isNaN(n));
      return nums.length ? Math.max(...nums) + 1 : fallback;
    };
    counters.order  = nextNum(DB.orders,        'o',     counters.order);
    counters.thread = nextNum(DB.threads,        't',     counters.thread);
    counters.med    = nextNum(DB.medicines,      'm',     counters.med);
    counters.review = nextNum(DB.reviews,        'rv',    counters.review);
    counters.notif  = nextNum(DB.notifications,  'n',     counters.notif);
    counters.ret    = nextNum(DB.returns,        'r',     counters.ret);
    counters.admin  = nextNum(DB.admins,         'a',     counters.admin);
    counters.staff  = nextNum(DB.staff,          's',     counters.staff);
    counters.audit  = nextNum(DB.auditLog,       'audit', counters.audit);
    counters.promo  = nextNum(DB.promotions,     'promo', counters.promo);
    counters.faq    = nextNum(DB.faqs,           'faq',   counters.faq);
    console.info('[supabase] counters resynced after load');
  }

  return applied > 0;
}

/**
 * Upsert the full in-memory DB into Supabase.
 * Returns true on success.
 */
export async function saveSnapshot(): Promise<boolean> {
  if (!supabase) return false;
  const rows = SNAPSHOT_COLLECTIONS.map((id) => ({
    id,
    payload: (DB as Record<string, unknown>)[id],
  }));

  const { error } = await supabase.from(TABLE).upsert(rows);
  if (error) {
    if (error.message?.includes('relation') || error.code === '42P01') {
      console.error(
        '[supabase] Table missing. Run src/data/supabase-schema.sql in your Supabase Dashboard → SQL Editor.',
        error.message,
      );
    } else {
      console.warn('[supabase] saveSnapshot failed:', error.message);
    }
    return false;
  }
  return true;
}

export { supabaseEnabled };

/**
 * One-shot health probe: writes a heartbeat doc and reads it back.
 * Returns a diagnostics string for the UI / console.
 */
export async function probeConnection(): Promise<{ ok: boolean; detail: string }> {
  if (!supabase) {
    return { ok: false, detail: 'Supabase not configured (missing .env credentials).' };
  }
  const probeId = `probe_${Date.now()}`;
  try {
    const { error: writeErr } = await supabase.from(TABLE).upsert({ id: probeId, payload: { ok: true, at: new Date().toISOString() } });
    if (writeErr) {
      const isMissingTable = writeErr.message?.includes('relation') || writeErr.code === '42P01';
      return {
        ok: false,
        detail: isMissingTable
          ? `Table "${TABLE}" not found. Run src/data/supabase-schema.sql in Supabase Dashboard → SQL Editor.`
          : `Write blocked: ${writeErr.message}`,
      };
    }
    const { data, error: readErr } = await supabase.from(TABLE).select('id').eq('id', probeId).maybeSingle();
    if (readErr) return { ok: false, detail: `Read blocked: ${readErr.message}` };
    const ok = Boolean(data);
    await supabase.from(TABLE).delete().eq('id', probeId);
    return ok
      ? { ok: true, detail: `Connected to ${supabaseEnabled ? 'Supabase' : ''} — read/write OK.` }
      : { ok: false, detail: 'Heartbeat write succeeded but read-back was empty.' };
  } catch (err) {
    return { ok: false, detail: `Network error: ${(err as Error).message}` };
  }
}