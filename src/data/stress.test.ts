// ============================================================
//  CarePoint — stress / load test for the persistence layer.
//
//  Verifies the app survives a large relational dataset without
//  corruption or pathological slowness:
//    · 10,000 medicines, 2,000 customers (addresses + wishlists)
//    ·  5,000 orders (+items), 500 threads (+messages), ~1,200
//      reviews, 1,500 notifications, returns, log rows, flags
//    · save + idempotent re-saving, then load back and check
//      counts, Date revival, counters resync and FK self-healing.
//    · core helpers (publicMedicines, orderTotal, notifyOrderEvent,
//      medRatingAvg, nextCounter) exercised at scale.
//
//  The supabase client is mocked as in-memory relational tables, so
//  this measures algorithmic cost, not network round-trips.
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { tables } = vi.hoisted(() => ({
  tables: new Map<string, any[]>(),
}));

const serialize = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

vi.mock('../supabase', () => ({
  supabaseEnabled: true,
  supabase: {
    from: (name: string) => ({
      select: () => ({
        limit: async () => ({ data: [], error: null }),
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

import { DB, counters } from './db';
import { loadSnapshot, saveSnapshot } from './persistence';
import {
  CATEGORIES, publicMedicines, platformStats, pharmacyMedicines,
  orderTotal, medRatingAvg, notifyOrderEvent, nextCounter,
} from './helpers';

// ---------- deterministic test dataset generator ----------

interface Dataset {
  medCount: number; custCount: number; orderCount: number; threadCount: number;
  notifCount: number; returnCount: number; logCount: number; auditCount: number;
  itemCount: number; addressCount: number; wishlistCount: number; msgCount: number;
  reviewCount: number;
  ghostItems: number;                     // order items referencing a deleted med (dropped on save)
  persistedFlags: number;                 // customer/staff flags that survive
  orderItemRows: number;                  // = itemCount - ghostItems
  publicMedCount: number;                 // approved pharmacy + active listing
  p1MedCount: number;
}

function buildDataset(): Dataset {
  const medCount = 10_000;
  const custCount = 2_000;
  const orderCount = 5_000;
  const threadCount = 500;
  const notifCount = 1_500;
  const returnCount = 100;
  const logCount = 400;
  const auditCount = 200;

  const medIds: string[] = [];
  DB.medicines = Array.from({ length: medCount }, (_, j) => {
    const id = 'm' + (10_001 + j);
    medIds.push(id);
    return {
      id,
      pharmacyId: j % 10 === 9 ? 'p_pending' : 'p1',
      name: `Streress Relief ${j + 1}`,
      category: CATEGORIES[j % CATEGORIES.length],
      brand: `Brand ${j % 7}`,
      price: 40 + (j % 480),
      stock: j % 97 === 0 ? 0 : 5 + (j % 900),
      prescription: j % 5 === 0,
      sold: j % 13,
      addedAt: j,
      status: j % 97 === 96 ? 'inactive' : 'active',
      lowStockThreshold: j % 11 === 0 ? 50 : undefined,
      description: `Stress-tested remedy #${j + 1}.`,
      specs: { Form: j % 2 ? 'Tablet' : 'Syrup', 'Pack Size': `${1 + (j % 9)} per pack` },
    } as const;
  });

  let p1MedCount = 0;
  let publicMedCount = 0;
  for (const m of DB.medicines) {
    if (m.pharmacyId === 'p1') p1MedCount++;
    if (m.pharmacyId === 'p1' && (m.status ?? 'active') === 'active') publicMedCount++;
  }

  const custNum = (i: number) => 1_001 + (i % custCount);
  const medId = (i: number) => 'm' + (10_001 + (i % medCount));

  let wishlistCount = 0;
  DB.customers = Array.from({ length: custCount }, (_, ci) => {
    const n = 1_001 + ci;
    const wishlist = ci % 3 === 0
      ? Array.from(new Set([medId(ci * 7), medId(ci * 13)]).values()).slice(0, 2)
      : [];
    wishlistCount += wishlist.length;
    return {
      id: 'c' + n,
      name: `Customer No. ${n}`,
      email: `cust${n}@example.com`,
      password: 'demo123',
      status: 'active' as const,
      addresses: [
        { id: `addr${n}a`, label: 'Home', text: `${n} Mabini St.` },
        { id: `addr${n}b`, label: 'Office', text: `${n} Sampaguita Ave.` },
      ],
      wishlist,
    };
  });
  const addressCount = custCount * 2;

  let itemCount = 0;
  let ghostItems = 0;
  let reviewCount = 0;
  const reviewIds: string[] = [];
  const statuses = ['pending', 'confirmed', 'ready', 'completed'] as const;
  DB.orders = Array.from({ length: orderCount }, (_, i) => {
    const n = 50_001 + i;
    const status = i % 25 === 0 ? 'cancelled' : statuses[i % 4];
    let items: { medId: string; qty: number; price: number }[];
    if (i % 101 === 0) {
      // deleted-med item — must be self-healed out on write
      items = [{ medId: 'mGHOST' + i, qty: 1, price: 1 }];
      ghostItems++;
    } else {
      const itemCountThis = 1 + (i % 3);
      items = Array.from({ length: itemCountThis }, (_, k) => ({
        medId: medId(i * 3 + k),
        qty: 1 + (k % 3),
        price: 40 + (k % 200),
      }));
      itemCount += itemCountThis;
    }
    if (status === 'completed' && items[0].medId !== 'mGHOST' + i) {
      reviewIds.push(items[0].medId);
      reviewCount++;
    }
    return {
      id: 'o' + n,
      customerId: 'c' + custNum(i),
      pharmacyId: i % 10 === 9 ? 'p_pending' : 'p1',
      items,
      fulfillment: (i % 2 === 0 ? 'pickup' : 'delivery') as 'pickup' | 'delivery',
      addressId: i % 2 === 0 ? null : `addr${custNum(i)}a`,
      status,
      createdAt: new Date(Date.now() - i * 60_000),
      paymentMethod: i % 6 === 0 ? 'cod' : 'card',
      paymentLabel: i % 6 === 0 ? 'Cash on Delivery' : undefined,
    };
  });
  const orderItemRows = itemCount; // ghost items are excluded at write time

  let msgCount = 0;
  DB.threads = Array.from({ length: threadCount }, (_, i) => {
    const n = 5_001 + i;
    msgCount += 2;
    return {
      id: 't' + n,
      customerId: 'c' + custNum(i * 17),
      pharmacyId: 'p1',
      type: 'order' as const,
      orderId: 'o' + (50_001 + i),
      subject: `Question #${n}`,
      status: (i % 9 === 8 ? 'resolved' : 'open') as any,
      unreadForCustomer: i % 3 === 0,
      unreadForStaff: i % 3 === 1,
      messages: [
        { from: 'customer' as const, text: `Msg A ${n}`, at: new Date(Date.now() - i * 120_000) },
        { from: 'staff' as const, text: `Msg B ${n}`, at: new Date(Date.now() - i * 60_000) },
      ],
    } as any;
  });

  DB.reviews = reviewIds.map((medId2, i) => ({
    id: 'rv' + (5_001 + i),
    medId: medId2,
    customerId: 'c' + custNum(i * 5),
    orderId: 'o' + (50_001 + (i * 4)),
    rating: 1 + (i % 5),
    at: new Date(Date.now() - i * 3600_000),
  }));

  DB.notifications = Array.from({ length: notifCount }, (_, i) => ({
    id: 'n' + (5_001 + i),
    customerId: 'c' + custNum(i * 3),
    type: (['order', 'message', 'promo'] as const)[i % 3],
    text: `Stress notification ${i + 1}`,
    read: i % 4 === 0,
    at: new Date(Date.now() - i * 120_000),
  }));

  DB.returns = Array.from({ length: returnCount }, (_, i) => {
    const n = 5_001 + i;
    const orderId = 'o' + (50_001 + (i * 11));
    return {
      id: 'r' + n,
      orderId,
      customerId: 'c' + custNum(i * 7),
      pharmacyId: i % 10 === 9 ? 'p_pending' : 'p1',
      reason: `Stress return ${n}`,
      status: (i % 4 === 0 ? 'approved' : 'requested') as any,
      refundAmount: i % 4 === 0 ? 120 : undefined,
      source: 'customer' as const,
      at: new Date(Date.now() - i * 900_000),
    } as any;
  });

  DB.notificationLog = Array.from({ length: logCount }, (_, i) => ({
    id: 'log' + (5_001 + i),
    pharmacyId: 'p1',
    event: 'orderPlaced',
    customerId: 'c' + custNum(i * 9),
    text: `Logged stress event ${i}`,
    kind: 'automated',
    at: new Date(Date.now() - i * 90_000),
  }));

  DB.flags = [
    ...Array.from({ length: 40 }, (_, i) => ({
      id: 'flg_s' + (5_001 + i),
      status: 'open' as const, type: 'account', note: `Stress flag ${i}`,
      reason: `Stress flag ${i}`, targetType: 'customer', targetId: 'c' + (1_001 + i),
      at: new Date(Date.now() - i * 600_000),
    })),
    // non-persisted targets (schema only accepts customer/staff)
    { id: 'flg_order', status: 'open' as const, type: 'transaction', note: 'x', reason: 'x', targetType: 'order', targetId: 'o50001', at: new Date() },
    { id: 'flg_med', status: 'open' as const, type: 'product', note: 'x', reason: 'x', targetType: 'medicine', targetId: 'm10001', at: new Date() },
  ];
  const persistedFlags = 40;

  DB.auditLog = Array.from({ length: auditCount }, (_, i) => ({
    id: 'audit' + (5_001 + i),
    at: new Date(Date.now() - i * 30_000),
    actor: 'stress@test.ph',
    action: `hit ${i}`,
  }));

  DB.notifTemplates = {};
  DB.notificationLog.unshift({
    id: 'log0', pharmacyId: 'p1', event: 'orderPlaced',
    customerId: 'c1001', text: 'seed', kind: 'automated', at: new Date(),
  });

  return {
    medCount, custCount, orderCount, threadCount, notifCount, returnCount,
    logCount: logCount + 1,   // + the log0 seed row
    auditCount, itemCount, addressCount, wishlistCount, msgCount, reviewCount,
    ghostItems, persistedFlags, orderItemRows, publicMedCount, p1MedCount,
  };
}

beforeEach(() => {
  tables.clear();
});

function wipeDb() {
  DB.medicines = []; DB.customers = []; DB.orders = [];
  DB.threads = []; DB.reviews = []; DB.notifications = [];
  DB.returns = []; DB.notificationLog = []; DB.flags = [];
  DB.auditLog = []; DB.notifTemplates = {};
  DB.pharmacies = []; DB.staff = []; DB.admins = []; DB.faqs = [];
  DB.promotions = []; DB.pages = {} as any; DB.settings = {} as any;
  DB.homepageBanner = undefined as any;
}

describe('persistence stress / load test', () => {
  it('round-trips a large dataset without corruption, idempotently, within budget', async () => {
    const ds = buildDataset();

    // ---- Write ----
    const t0 = performance.now();
    expect(await saveSnapshot()).toBe(true);
    const saveMs = performance.now() - t0;

    expect(tables.get('medicines')!.length).toBe(ds.medCount);
    expect(tables.get('customers')!.length).toBe(ds.custCount);
    expect(tables.get('orders')!.length).toBe(ds.orderCount);
    expect(tables.get('order_items')!.length).toBe(ds.orderItemRows);
    expect(tables.get('customer_addresses')!.length).toBe(ds.addressCount);
    expect(tables.get('customer_wishlist')!.length).toBe(ds.wishlistCount);
    expect(tables.get('threads')!.length).toBe(ds.threadCount);
    expect(tables.get('thread_messages')!.length).toBe(ds.msgCount);
    expect(tables.get('reviews')!.length).toBe(ds.reviewCount);
    expect(tables.get('notifications')!.length).toBe(ds.notifCount);
    expect(tables.get('flags')!.length).toBe(ds.persistedFlags);
    expect(tables.get('returns')!.length).toBe(ds.returnCount);
    expect(tables.get('notification_log')!.length).toBe(ds.logCount);
    expect(tables.get('audit_log')!.length).toBe(ds.auditCount);

    // ---- Idempotency: re-saving never duplicates or corrupts ----
    expect(await saveSnapshot()).toBe(true);
    expect(await saveSnapshot()).toBe(true);
    expect(tables.get('medicines')!.length).toBe(ds.medCount);
    expect(tables.get('orders')!.length).toBe(ds.orderCount);
    expect(tables.get('order_items')!.length).toBe(ds.orderItemRows);
    const firstMed = tables.get('medicines')![0];
    expect(firstMed.stock).toBe(DB.medicines[0].stock);

    // ---- Read back ----
    const t1 = performance.now();
    DB.medicines.length = 0; DB.customers.length = 0; DB.orders.length = 0;
    DB.threads.length = 0; DB.reviews.length = 0; DB.notifications.length = 0;
    DB.returns.length = 0; DB.notificationLog.length = 0; DB.flags.length = 0;
    DB.auditLog.length = 0;
    expect(await loadSnapshot()).toBe(true);
    const loadMs = performance.now() - t1;

    // ---- Integrity after load ----
    expect(DB.medicines.length).toBe(ds.medCount);
    expect(DB.customers.length).toBe(ds.custCount);
    expect(DB.orders.length).toBe(ds.orderCount);
    expect(DB.threads.length).toBe(ds.threadCount);
    expect(DB.reviews.length).toBe(ds.reviewCount);
    expect(DB.notifications.length).toBe(ds.notifCount);
    expect(DB.returns.length).toBe(ds.returnCount);
    expect(DB.flags.length).toBe(ds.persistedFlags);
    expect(DB.notificationLog.length).toBe(ds.logCount);
    expect(DB.auditLog.length).toBe(ds.auditCount);

    const totItems = DB.orders.reduce((s, o) => s + o.items.length, 0);
    expect(totItems).toBe(ds.orderItemRows);
    const custAddrs = DB.customers.reduce((s, c) => s + c.addresses.length, 0);
    expect(custAddrs).toBe(ds.addressCount);
    const custWish = DB.customers.reduce((s, c) => s + c.wishlist.length, 0);
    expect(custWish).toBe(ds.wishlistCount);

    // dates revived as Date instances
    expect(DB.orders.every((o) => o.createdAt instanceof Date)).toBe(true);
    expect(DB.reviews.every((r) => r.at instanceof Date)).toBe(true);
    expect(DB.notifications.every((n) => n.at instanceof Date)).toBe(true);
    expect(DB.threads.every((t) => t.messages.every((m) => m.at instanceof Date))).toBe(true);

    // spot check a medicine round-trips the tricky fields
    const spot = DB.medicines.find((m) => m.id === 'm10421')!;
    expect(spot).toBeDefined();
    expect(spot.pharmacyId).toBe('p1');
    expect(Number(spot.price)).toBeGreaterThan(0);
    expect(typeof spot.specs).toBe('object');

    // counters resync so new IDs never collide with the loaded dataset
    expect(counters.order).toBe(50_001 + ds.orderCount);
    expect(counters.med).toBe(10_001 + ds.medCount);
    expect(counters.review).toBe(5_001 + ds.reviewCount);
    expect(counters.thread).toBe(5_001 + ds.threadCount);
    expect(counters.notif).toBe(5_001 + ds.notifCount);
    expect(counters.ret).toBe(5_001 + ds.returnCount);
    expect(counters.audit).toBe(5_001 + ds.auditCount);

    // self-heal: ghost order items were dropped, threads/returns survived intact
    expect(DB.orders.some((o) => o.items.some((i) => i.medId.startsWith('mGHOST')))).toBe(false);

    // FK integrity: no order references a missing customer/pharmacy/med
    const custIds = new Set(DB.customers.map((c) => c.id));
    const medIdsS = new Set(DB.medicines.map((m) => m.id));
    expect(DB.orders.every((o) => custIds.has(o.customerId))).toBe(true);
    expect(DB.orders.every((o) => o.items.every((i) => medIdsS.has(i.medId)))).toBe(true);
    expect(DB.reviews.every((r) => custIds.has(r.customerId))).toBe(true);

    const t2 = performance.now();
    // ---- Helpers at scale ----
    expect(publicMedicines().length).toBe(ds.publicMedCount);
    expect(platformStats().meds).toBe(ds.publicMedCount);
    expect(pharmacyMedicines('p1').length).toBe(ds.p1MedCount);

    const totals = DB.orders.map(orderTotal);
    expect(totals.every((n) => Number.isFinite(n) && n >= 0)).toBe(true);
    expect(totals.reduce((s, n) => s + n, 0)).toBeGreaterThan(0);

    const rated = DB.medicines.find((m) => DB.reviews.some((r) => r.medId === m.id))!;
    const avg = medRatingAvg(rated?.id ?? '');
    expect(avg).toBeGreaterThan(0);
    expect(avg).toBeLessThanOrEqual(5);

    const beforeNotifs = DB.notifications.length;
    const beforeLog = DB.notificationLog.length;
    const sample = DB.orders.slice(0, 300);
    sample.forEach((o) => notifyOrderEvent(o, 'orderPlaced'));
    expect(DB.notifications.length).toBe(beforeNotifs + sample.length);
    expect(DB.notificationLog.length).toBe(beforeLog + sample.length);

    expect(nextCounter(DB.orders, 'o', 1)).toBe(50_001 + ds.orderCount);
    const helperMs = performance.now() - t2;

    // ---- Budgets (generous; catches pathological blow-ups, not timeouts) ----
    console.info(
      `[stress] save=${saveMs.toFixed(1)}ms load=${loadMs.toFixed(1)}ms helpers=${helperMs.toFixed(1)}ms |
      meds=${ds.medCount} customers=${ds.custCount} orders=${ds.orderCount} items=${ds.orderItemRows}`,
    );
    expect(saveMs).toBeLessThan(10_000);
    expect(loadMs).toBeLessThan(10_000);
    expect(helperMs).toBeLessThan(10_000);
  });

  it('flags keep only schema-compatible targets and ghost references are self-healed', async () => {
    wipeDb();
    DB.pharmacies = [
      { id: 'p1', status: 'approved', name: 'Apollo', branch: 'Main', city: 'Manila', address: '1 Av', hours: { open: 480, close: 1140 } } as any,
    ];
    DB.customers = [{ id: 'c1', name: 'One', email: 'one@x.ph', password: 'x', status: 'active', addresses: [], wishlist: [] }];
    DB.medicines = [{ id: 'm1', pharmacyId: 'p1', name: 'Par', category: 'Pain Relief', brand: 'B', price: 5, stock: 9, sold: 0, addedAt: 0 } as any];
    DB.orders = [{
      id: 'o-ghost', customerId: 'c1', pharmacyId: 'p1',
      items: [{ medId: 'm-does-not-exist', qty: 1, price: 5 }],
      fulfillment: 'pickup', addressId: null, status: 'pending', createdAt: new Date(),
    }];

    // non-persisted targets (schema only accepts customer/staff)
    (DB.flags as any[]).push(
      { id: 'flg_ph', status: 'open', type: 'account', note: 'x', reason: 'x', targetType: 'pharmacy', targetId: 'p1', at: new Date() },
      { id: 'flg_ord', status: 'open', type: 'transaction', note: 'x', reason: 'x', targetType: 'order', targetId: 'o-ghost', at: new Date() },
      { id: 'flg_med', status: 'open', type: 'product', note: 'x', reason: 'x', targetType: 'medicine', targetId: 'm1', at: new Date() },
    );
    (DB.flags as any[]).push({
      id: 'flg_cust', status: 'open', type: 'account', note: 'on a shopper',
      reason: 'shopper issue', targetType: 'customer', targetId: 'c1', at: new Date(),
    });

    expect(await saveSnapshot()).toBe(true);
    const flags = tables.get('flags')!;
    expect(flags.length).toBe(1);
    expect(flags[0].id).toBe('flg_cust');
    expect(flags[0].target_type).toBe('customer');
    expect(tables.get('order_items')!.some((i: any) => i.med_id === 'm-does-not-exist')).toBe(false);

    DB.orders.length = 0;
    expect(await loadSnapshot()).toBe(true);
    const restored = DB.orders.find((o) => o.id === 'o-ghost');
    expect(restored).toBeDefined();
    expect(restored!.items.length).toBe(0);
  });
});