// ============================================================
//  CarePoint — Supabase persistence round-trip tests
//  Mocks the supabase client (no network) and verifies that
//  saveSnapshot / loadSnapshot mirror src/data/db.ts correctly:
//    write all collections → mutate → apply read-back (dates revived)
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { store } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
}));

vi.mock('../supabase', () => ({
  supabaseEnabled: true,
  supabase: {
    from: () => ({
      upsert: async (rows: Array<{ id: string; payload: unknown }>) => {
        // Supabase stores JSONB — serialize on write so the "server"
        // holds an independent copy (mirrors production behaviour).
        for (const r of rows) store.set(r.id, JSON.parse(JSON.stringify(r.payload)));
        return { error: null };
      },
      select: async () => ({
        data: [...store.entries()].map(([id, payload]) => ({ id, payload })),
        error: null,
      }),
    }),
  },
}));

import { DB } from './db';
import { DB as DbRef } from './db';
import { loadSnapshot, saveSnapshot, SNAPSHOT_COLLECTIONS } from './persistence';

describe('Supabase persistence round-trip', () => {
  beforeEach(() => {
    store.clear();
  });

  it('writes every collection and reads it back with Date fields revived', async () => {
    // Create — full snapshot lands on the (mocked) server
    expect(await saveSnapshot()).toBe(true);
    expect(store.size).toBe(SNAPSHOT_COLLECTIONS.length);

    // Update — mutate a local order, persist, confirm the server sees it
    const before = DB.orders.length;
    DB.orders.push({
      id: 'o-test-1', customerId: 'c1', pharmacyId: 'p1',
      items: [{ medId: 'm1', qty: 2, price: 85 }],
      fulfillment: 'pickup', addressId: null,
      status: 'pending', createdAt: new Date('2024-01-02T03:04:05Z'),
    });
    expect(await saveSnapshot()).toBe(true);
    const serverOrders = store.get('orders') as Array<{ id: string; createdAt: string }>;
    expect(serverOrders.some((o) => o.id === 'o-test-1')).toBe(true);

    // Read — discard local in-memory changes, reload from server
    DbRef.orders.length = before;
    expect(DB.orders.some((o) => o.id === 'o-test-1')).toBe(false);
    expect(await loadSnapshot()).toBe(true);

    const restored = DB.orders.find((o) => o.id === 'o-test-1');
    expect(restored).toBeDefined();
    expect(restored!.createdAt).toBeInstanceOf(Date);
    expect((restored!.createdAt as Date).toISOString()).toBe('2024-01-02T03:04:05.000Z');
  });

  it('returns false when the server has no data yet', async () => {
    expect(await loadSnapshot()).toBe(false);
  });
});