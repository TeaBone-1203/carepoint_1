// ============================================================
//  CarePoint — PostgreSQL persistence round-trip tests
//  Mocks the supabase client (no network) as a set of relational
//  tables and verifies that saveSnapshot / loadSnapshot mirror
//  src/data/db.ts correctly across the postgres-schema tables:
//    write all tables → mutate → apply read-back (dates revived)
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { tables } = vi.hoisted(() => ({
  tables: new Map<string, any[]>(),
}));

// The "server" stores an independent copy of every row (Dates become
// ISO strings on insert, like Postgres timestamps do).
const serialize = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

vi.mock('../supabase', () => ({
  supabaseEnabled: true,
  supabase: {
    from: (name: string) => ({
      select: () => ({
        // `select('key').limit(1)` — used by the pre-save schema check
        limit: async () => ({ data: [], error: null }),
        // `select('*')` — the load path awaits this directly
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: (tables.get(name) ?? []).map((r) => ({ ...r })), error: null }),
      }),
      insert: async (rows: unknown[]) => {
        tables.set(name, rows.map(serialize));
        return { error: null };
      },
      delete: () => ({
        neq: async () => {
          tables.set(name, []);
          return { error: null };
        },
      }),
    }),
  },
}));

import { DB } from './db';
import { loadSnapshot, saveSnapshot } from './persistence';

describe('Postgres persistence round-trip', () => {
  beforeEach(() => {
    tables.clear();
  });

  it('writes the relational tables and reads them back with Date fields revived', async () => {
    // Create — full relational snapshot lands on the (mocked) server
    expect(await saveSnapshot()).toBe(true);
    expect(tables.get('pharmacies')!.length).toBeGreaterThan(0);
    expect(tables.get('medicines')!.length).toBeGreaterThan(0);

    // Update — mutate a local order, persist, confirm the server sees it
    DB.orders.push({
      id: 'o-test-1', customerId: 'c1', pharmacyId: 'p1',
      items: [{ medId: 'm1', qty: 2, price: 85 }],
      fulfillment: 'pickup', addressId: null,
      status: 'pending', createdAt: new Date('2024-01-02T03:04:05Z'),
    });
    expect(await saveSnapshot()).toBe(true);
    const serverOrders = tables.get('orders') as Array<{ id: string; created_at: string }>;
    expect(serverOrders.some((o) => o.id === 'o-test-1')).toBe(true);
    expect(tables.get('order_items')!.some((i) => i.order_id === 'o-test-1')).toBe(true);

    // Read — discard local in-memory changes, reload from server
    DB.orders = [] as any;
    expect(DB.orders.some((o) => o.id === 'o-test-1')).toBe(false);
    expect(await loadSnapshot()).toBe(true);

    const restored = DB.orders.find((o) => o.id === 'o-test-1');
    expect(restored).toBeDefined();
    expect(restored!.createdAt).toBeInstanceOf(Date);
    expect((restored!.createdAt as Date).toISOString()).toBe('2024-01-02T03:04:05.000Z');
  });

  it('returns false when the database has no data yet', async () => {
    expect(await loadSnapshot()).toBe(false);
  });
});