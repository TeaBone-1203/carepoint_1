// ============================================================
//  CarePoint — PostgreSQL persistence service
//  Connects src/data/db.ts (the in-memory store) to the real
//  relational schema in src/data/postgres-schema.sql
//  (tables: pharmacies, medicines, orders, threads, ...).
//
//  Load:  loadSnapshot()   → hydrates the in-memory DB from SQL
//  Save:  saveSnapshot()   → mirrors the in-memory DB into SQL
//
//  Both no-op (returning false) when Postgres is not configured,
//  so the app still builds/runs/tests offline.
//
//  Mapping notes (in-memory ⇄ relational):
//    · staff.role 'pharmacyAdmin' ⇄ staff.is_owner
//    · thread.status 'resolved'   ⇄ thread_status 'closed'
//    · accounts 'inactive'        ⇄ account_status 'disabled'
//    · reviews/orders/thread message child rows are stored in
//      their own tables, keyed back to the parent row.
//    · flags: the schema only allows flag_target_type
//      'customer' | 'staff', so only those flags are persisted.
// ============================================================
import { supabase, supabaseEnabled } from '../supabase';
import { DB, counters } from './db';

const postgresSchemaHint =
  '[postgres] Tables missing. Run src/data/postgres-schema.sql once in your Postgres / Supabase SQL editor.';

/** Upper-camel collection keys on the in-memory DB object. */
export const SNAPSHOT_COLLECTIONS = [
  'pharmacies', 'medicines', 'customers', 'staff', 'admins',
  'orders', 'threads', 'flags', 'reviews', 'notifications',
  'returns', 'notificationLog', 'notifTemplates', 'settings',
  'pages', 'faqs', 'promotions', 'homepageBanner', 'auditLog',
] as const;

export type SnapshotCollection = (typeof SNAPSHOT_COLLECTIONS)[number];

// ---------- Table names ----------
const T = {
  pharmacies:       'pharmacies',
  admins:           'admins',
  staff:            'staff',
  customers:        'customers',
  addresses:        'customer_addresses',
  wishlist:         'customer_wishlist',
  medicines:        'medicines',
  orders:           'orders',
  orderItems:       'order_items',
  threads:          'threads',
  threadMessages:   'thread_messages',
  reviews:          'reviews',
  returns:          'returns',
  notifications:    'notifications',
  notifLog:         'notification_log',
  notifTemplates:   'notif_templates',
  flags:            'flags',
  pages:            'pages',
  faqs:             'faqs',
  promotions:       'promotions',
  banner:           'homepage_banner',
  audit:            'audit_log',
  settings:         'settings',
} as const;

/** Every table + the column used as its id / membership key. */
const TABLES: { table: string; key: string }[] = [
  { table: T.pharmacies,     key: 'id' },
  { table: T.admins,         key: 'id' },
  { table: T.staff,          key: 'id' },
  { table: T.customers,      key: 'id' },
  { table: T.addresses,      key: 'id' },
  { table: T.wishlist,       key: 'customer_id' },
  { table: T.medicines,      key: 'id' },
  { table: T.orders,         key: 'id' },
  { table: T.orderItems,     key: 'order_id' },
  { table: T.threads,        key: 'id' },
  { table: T.threadMessages, key: 'thread_id' },
  { table: T.reviews,        key: 'id' },
  { table: T.returns,        key: 'id' },
  { table: T.notifications,  key: 'id' },
  { table: T.notifLog,       key: 'id' },
  { table: T.notifTemplates, key: 'pharmacy_id' },
  { table: T.flags,          key: 'id' },
  { table: T.pages,          key: 'key' },
  { table: T.faqs,           key: 'id' },
  { table: T.promotions,     key: 'id' },
  { table: T.banner,         key: 'id' },
  { table: T.audit,          key: 'id' },
  { table: T.settings,       key: 'id' },
];

/** Sentinel used for "delete every row" filters (never matches real data). */
const SENTINEL = '__carepoint_sync__';

type Row = Record<string, any>;

/** Untyped access for the dynamic table-name API surface. */
const db = supabase as any;

function logTableError(table: string, error: { code?: string; message?: string }): void {
  const isMissing = error.message?.includes('relation') || error.code === '42P01';
  if (isMissing) console.error(postgresSchemaHint, `${table}: ${error.message}`);
  else console.warn(`[postgres] ${table} failed:`, error.message);
}

// ---------- Helpers for reading a whole table ----------

async function fetchAll(table: string): Promise<Row[] | null> {
  const { data, error } = await db.from(table).select('*');
  if (error) { logTableError(table, error); return null; }
  return (data ?? []) as Row[];
}

// ---------- Enum-safe value translation ----------

const phoneStatus = (s: string): string =>
  s === 'approved' || s === 'pending' ? s : s === 'rejected' ? 'rejected' : 'pending';

const accountStatus = (s: string): 'pending' | 'active' | 'disabled' =>
  s === 'pending' ? 'pending' : s === 'disabled' || s === 'inactive' || s === 'rejected' ? 'disabled' : 'active';

const staffStatus = (s: string): 'pending' | 'active' | 'disabled' =>
  accountStatus(s);

const threadStatus = (s: string): 'open' | 'closed' =>
  s === 'resolved' ? 'closed' : s === 'closed' ? 'closed' : 'open';

const returnStatus = (s: string): string =>
  ['requested', 'approved', 'rejected', 'refunded'].includes(s) ? s : 'requested';

const returnSource = (s: string | undefined): 'customer' | 'staff' =>
  s === 'staff' ? 'staff' : 'customer';

const notifType = (s: string): string =>
  ['order', 'message', 'promo'].includes(s) ? s : 'message';

const notifKind = (s: string): string =>
  ['automated', 'manual'].includes(s) ? s : 'automated';

// ============================================================
//  Load — pull the relational tables into the in-memory DB
// ============================================================
export async function loadSnapshot(): Promise<boolean> {
  if (!supabase) return false;
  const [
    ph,     ad, st, cu, addr, wish, med, ord,
    items,  thr, msgs, rev, ret, notif, log, tpl,
    fl,     pg, fq, promo, banner, audit, settings,
  ] = await Promise.all([
    fetchAll(T.pharmacies), fetchAll(T.admins), fetchAll(T.staff), fetchAll(T.customers),
    fetchAll(T.addresses), fetchAll(T.wishlist), fetchAll(T.medicines), fetchAll(T.orders),
    fetchAll(T.orderItems), fetchAll(T.threads), fetchAll(T.threadMessages), fetchAll(T.reviews),
    fetchAll(T.returns), fetchAll(T.notifications), fetchAll(T.notifLog), fetchAll(T.notifTemplates),
    fetchAll(T.flags), fetchAll(T.pages), fetchAll(T.faqs), fetchAll(T.promotions),
    fetchAll(T.banner), fetchAll(T.audit), fetchAll(T.settings),
  ]);

  const applied: string[] = [];
  const applyCollection = (name: string, rows: Row[] | null, fn: (r: Row[]) => void) => {
    if (rows && rows.length) { fn(rows); applied.push(name); }
  };

  // ---- pharmacies ----
  applyCollection('pharmacies', ph, (rows) => {
    DB.pharmacies = rows.map((r) => ({
      id: r.id, name: r.name,
      location: r.location ?? '', hours: r.hours ?? '',
      status: (r.status ?? 'pending') as any,
    }));
  });

  // ---- admins ----
  applyCollection('admins', ad, (rows) => {
    DB.admins = rows.map((r) => ({ id: r.id, name: r.name, email: r.email, password: r.password }));
  });

  // ---- staff ----
  applyCollection('staff', st, (rows) => {
    DB.staff = rows.map((r) => ({
      id: r.id, name: r.name, email: r.email, password: r.password,
      pharmacyId: r.pharmacy_id,
      role: r.is_owner ? ('pharmacyAdmin' as const) : ('staff' as const),
      status: staffStatus(r.status) as any,
    }));
  });

  // ---- customers (with nested addresses + wishlist) ----
  applyCollection('customers', cu, (rows) => {
    if (!addr || !wish) return;
    DB.customers = rows.map((r) => ({
      id: r.id, name: r.name, email: r.email, password: r.password,
      status: (accountStatus(r.status) === 'active' ? 'active' : 'inactive') as any,
      addresses: addr
        .filter((a) => a.customer_id === r.id)
        .map((a) => ({ id: a.id, label: a.label, text: a.text })),
      wishlist: wish
        .filter((w) => w.customer_id === r.id)
        .map((w) => w.med_id),
    }));
  });

  // ---- medicines ----
  applyCollection('medicines', med, (rows) => {
    DB.medicines = rows.map((r) => ({
      id: r.id, pharmacyId: r.pharmacy_id, name: r.name, category: r.category,
      price: Number(r.price), stock: Number(r.stock),
      prescription: Boolean(r.prescription), sold: Number(r.sold),
      addedAt: Number(r.added_at ?? 0),
      brand: r.brand ?? undefined,
      description: r.description ?? undefined,
      specs: r.specs ?? undefined,
      images: r.images ?? undefined,
      status: r.status === 'inactive' ? ('inactive' as const) : ('active' as const),
      lowStockThreshold: r.low_stock_threshold != null ? Number(r.low_stock_threshold) : undefined,
    }));
  });

  // ---- orders (with nested items) ----
  applyCollection('orders', ord, (rows) => {
    DB.orders = rows.map((r) => ({
      id: r.id, customerId: r.customer_id, pharmacyId: r.pharmacy_id,
      fulfillment: r.fulfillment as any,
      addressId: r.address_id ?? null,
      status: r.status as any,
      createdAt: new Date(r.created_at),
      paymentMethod: r.payment_method ?? undefined,
      paymentLabel: r.payment_label ?? undefined,
      items: items
        ? items.filter((i) => i.order_id === r.id)
             .map((i) => ({ medId: i.med_id, qty: Number(i.qty), price: Number(i.price) }))
        : [],
    }));
  });

  // ---- threads (with nested messages) ----
  applyCollection('threads', thr, (rows) => {
    DB.threads = rows.map((r) => ({
      id: r.id, customerId: r.customer_id, pharmacyId: r.pharmacy_id,
      type: r.type as any, subject: r.subject,
      status: (threadStatus(r.status) === 'closed' ? 'resolved' : 'open') as any,
      orderId: r.order_id ?? undefined,
      medId: r.med_id ?? undefined,
      unreadForCustomer: Boolean(r.unread_for_customer),
      unreadForStaff: Boolean(r.unread_for_staff),
      messages: msgs
        ? msgs.filter((m) => m.thread_id === r.id)
             .map((m) => ({
               from: m.from_role as any,
               text: m.text,
               image: m.image ?? undefined,
               at: new Date(m.at),
             }))
        : [],
    }));
  });

  // ---- reviews ----
  applyCollection('reviews', rev, (rows) => {
    DB.reviews = rows.map((r) => ({
      id: r.id, medId: r.med_id, customerId: r.customer_id, orderId: r.order_id,
      rating: Number(r.rating), at: new Date(r.at),
    }));
  });

  // ---- returns ----
  applyCollection('returns', ret, (rows) => {
    DB.returns = rows.map((r) => ({
      id: r.id, orderId: r.order_id, customerId: r.customer_id, pharmacyId: r.pharmacy_id,
      reason: r.reason, status: r.status as any,
      refundAmount: r.refund_amount != null ? Number(r.refund_amount) : undefined,
      source: r.source ?? undefined,
      at: new Date(r.at),
    }));
  });

  // ---- notifications ----
  applyCollection('notifications', notif, (rows) => {
    DB.notifications = rows.map((r) => ({
      id: r.id, customerId: r.customer_id, type: r.type as any, text: r.text,
      read: Boolean(r.read), at: new Date(r.at),
    }));
  });

  // ---- notification log ----
  applyCollection('notificationLog', log, (rows) => {
    DB.notificationLog = rows.map((r) => ({
      id: r.id, pharmacyId: r.pharmacy_id, event: r.event,
      customerId: r.customer_id ?? undefined, text: r.text,
      kind: r.kind as any, at: new Date(r.at),
    }));
  });

  // ---- notification templates (flattened rows → nested map) ----
  applyCollection('notifTemplates', tpl, (rows) => {
    const map: Record<string, Record<string, { enabled: boolean; text: string }>> = {};
    rows.forEach((r) => {
      if (!map[r.pharmacy_id]) map[r.pharmacy_id] = {};
      map[r.pharmacy_id][r.event_id] = { enabled: Boolean(r.enabled), text: r.text };
    });
    DB.notifTemplates = map;
  });

  // ---- flags (only customer/staff-targeted fit the schema) ----
  applyCollection('flags', fl, (rows) => {
    DB.flags = rows.map((r) => ({
      id: r.id, status: r.status as any, type: r.target_type,
      note: r.reason, reason: r.reason, targetType: r.target_type, targetId: r.target_id,
      at: new Date(),
    }) as any);
  });

  // ---- pages (rows → keyed record) ----
  applyCollection('pages', pg, (rows) => {
    const map: Record<string, { title: string; body: string }> = {};
    rows.forEach((r) => { map[r.key] = { title: r.title, body: r.body }; });
    DB.pages = map;
  });

  // ---- faqs ----
  applyCollection('faqs', fq, (rows) => {
    DB.faqs = rows.map((r) => ({ id: r.id, q: r.q, a: r.a }));
  });

  // ---- promotions ----
  applyCollection('promotions', promo, (rows) => {
    DB.promotions = rows.map((r) => ({
      id: r.id, title: r.title, text: r.text, active: Boolean(r.active),
    }));
  });

  // ---- homepage banner (singleton row) ----
  applyCollection('homepageBanner', banner, (rows) => {
    const r = rows[0];
    DB.homepageBanner = {
      headline: r.headline, subtext: r.subtext ?? '', ctaLabel: r.cta_label ?? '',
      active: Boolean(r.active),
    };
  });

  // ---- audit log ----
  applyCollection('auditLog', audit, (rows) => {
    DB.auditLog = rows.map((r) => ({ id: r.id, at: new Date(r.at), actor: r.actor, action: r.action }));
  });

  // ---- settings (singleton row) ----
  applyCollection('settings', settings, (rows) => {
    const r = rows[0];
    DB.settings = {
      platformName: r.platform_name ?? 'CarePoint',
      supportEmail: r.support_email ?? undefined,
      currency: r.currency ?? 'PHP',
      pickupEnabled: Boolean(r.pickup_enabled),
      deliveryEnabled: Boolean(r.delivery_enabled),
      deliveryFee: Number(r.delivery_fee ?? 0),
      freeDeliveryOver: r.free_delivery_over != null ? Number(r.free_delivery_over) : 0,
      payments: (r.payments as Record<string, boolean>) ?? {},
      lowStockThreshold: Number(r.low_stock_threshold ?? 10),
      returnWindowDays: Number(r.return_window_days ?? 7),
    };
  });

  if (applied.length > 0) {
    resyncCounters();
    console.info(`[postgres] loaded ${applied.length} collections from relational tables`);
  }
  return applied.length > 0;
}

/** Resync auto-increment counters so new IDs don't collide with loaded data. */
function resyncCounters(): void {
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
  if (DB.customers.length) {
    const addrNums = DB.customers
      .flatMap((c) => c.addresses.map((a) => a.id))
      .map((id) => parseInt(id.replace('addr', ''), 10))
      .filter((n) => !isNaN(n));
    counters.addr = addrNums.length ? Math.max(...addrNums) + 1 : counters.addr;
  }
  console.info('[postgres] counters resynced after load');
}

// ============================================================
//  Save — mirror the in-memory DB into the relational tables
// ============================================================

/** One cheap read per table before any write; aborts if the schema is missing. */
async function ensureTables(): Promise<boolean> {
  const results = await Promise.all(
    TABLES.map(async ({ table, key }) => {
      const { error } = await db.from(table).select(key).limit(1);
      return error ? { table, key, error } : null;
    }),
  );
  const missing = results.filter(Boolean).slice(0, 5) as { table: string; error: { code?: string; message?: string } }[];
  if (missing.length) {
    console.error(postgresSchemaHint, missing.map((m) => `${m.table}: ${m.error.message}`).join(' | '));
    return false;
  }
  return true;
}

async function replaceRows(table: string, key: string, rows: Row[]): Promise<void> {
  await db.from(table).delete().neq(key, SENTINEL);
  if (rows.length) await db.from(table).insert(rows);
}

/**
 * Upsert the full in-memory DB into Postgres.
 * Returns true on success (false when Postgres isn't configured,
 * or the schema hasn't been applied yet — nothing is modified then).
 */
export async function saveSnapshot(): Promise<boolean> {
  if (!supabase) return false;
  if (!(await ensureTables())) return false;

  try {
    const phIds     = new Set(DB.pharmacies.map((p) => p.id));
    const custIds   = new Set(DB.customers.map((c) => c.id));
    const medIds    = new Set(DB.medicines.map((m) => m.id));
    const orderIds  = new Set(DB.orders.map((o) => o.id));

    const idSet = (s: Set<string>) => s.has.bind(s);
    const hasPh = idSet(phIds), hasCust = idSet(custIds), hasMed = idSet(medIds);
    const hasOrder = idSet(orderIds);

    // ---- Row payloads (parent rows first, children reference them) ----
    const pharmacyRows: Row[] = DB.pharmacies.map((p) => ({
      id: p.id, name: p.name, location: p.location || null, hours: p.hours || null,
      status: phoneStatus(p.status),
    }));

    const adminRows: Row[] = DB.admins.map((a) => ({
      id: a.id, name: a.name, email: a.email, password: a.password,
    }));

    const customerRows: Row[] = DB.customers.map((c) => ({
      id: c.id, name: c.name, email: c.email, password: c.password,
      status: accountStatus(c.status),
    }));

    const addressRows: Row[] = DB.customers.flatMap((c) =>
      (c.addresses ?? []).filter((a) => Boolean(a.id)).map((a) => ({
        id: a.id, customer_id: c.id, label: a.label, text: a.text,
      })),
    );

    const wishlistRows: Row[] = DB.customers.flatMap((c) =>
      (c.wishlist ?? []).filter((mid) => mid && hasMed(mid)).map((mid) => ({
        customer_id: c.id, med_id: mid,
      })),
    );

    const staffRows: Row[] = DB.staff.map((s) => ({
      id: s.id, name: s.name, email: s.email, password: s.password,
      pharmacy_id: s.pharmacyId, status: staffStatus(s.status),
      is_owner: s.role === 'pharmacyAdmin',
    }));

    const medicineRows: Row[] = DB.medicines.map((m) => ({
      id: m.id, pharmacy_id: m.pharmacyId, name: m.name,
      brand: m.brand ?? null, category: m.category,
      price: Number(m.price), stock: Number(m.stock),
      prescription: Boolean(m.prescription), sold: Number(m.sold),
      added_at: Number(m.addedAt ?? 0), status: m.status ?? 'active',
      low_stock_threshold: m.lowStockThreshold != null ? Number(m.lowStockThreshold) : null,
      description: m.description ?? null,
      specs: m.specs ?? null,
      images: m.images ?? null,
    }));

    const orderRows: Row[] = DB.orders.map((o) => ({
      id: o.id, customer_id: o.customerId, pharmacy_id: o.pharmacyId,
      fulfillment: o.fulfillment, address_id: o.addressId ?? null,
      status: o.status,
      payment_method: o.paymentMethod ?? null,
      payment_label: o.paymentLabel ?? null,
      created_at: o.createdAt,
    }));

    const orderItemRows: Row[] = DB.orders.flatMap((o) =>
      o.items
        .filter((it) => hasMed(it.medId))
        .map((it) => ({ order_id: o.id, med_id: it.medId, qty: Number(it.qty), price: Number(it.price) })),
    );

    const threadRows: Row[] = DB.threads
      .filter((t) => hasPh(t.pharmacyId) && hasCust(t.customerId)
        && (!t.orderId || hasOrder(t.orderId))
        && (!t.medId || hasMed(t.medId)))
      .map((t) => ({
        id: t.id, pharmacy_id: t.pharmacyId, customer_id: t.customerId,
        type: t.type, order_id: t.orderId ?? null, med_id: t.medId ?? null,
        subject: t.subject ?? '',
        status: threadStatus(t.status),
        unread_for_customer: t.unreadForCustomer,
        unread_for_staff: t.unreadForStaff,
      }));

    const messageRows: Row[] = DB.threads.flatMap((t) =>
      (t.messages ?? []).map((m) => ({
        thread_id: t.id, from_role: m.from,
        text: m.text ?? null, image: m.image ?? null, at: m.at,
      })),
    );

    const reviewRows: Row[] = DB.reviews
      .filter((r) => hasMed(r.medId) && hasCust(r.customerId) && hasOrder(r.orderId))
      .map((r) => ({
        id: r.id, med_id: r.medId, customer_id: r.customerId, order_id: r.orderId,
        rating: Number(r.rating), at: r.at,
      }));

    const returnRows: Row[] = DB.returns.map((r) => ({
      id: r.id, order_id: r.orderId, customer_id: r.customerId, pharmacy_id: r.pharmacyId,
      reason: r.reason, status: returnStatus(r.status),
      refund_amount: r.refundAmount != null ? Number(r.refundAmount) : null,
      source: returnSource(r.source), at: r.at,
    }));

    const notifRows: Row[] = DB.notifications.map((n) => ({
      id: n.id, customer_id: n.customerId, type: notifType(n.type), text: n.text,
      read: n.read, at: n.at,
    }));

    const notifLogRows: Row[] = DB.notificationLog.map((l) => ({
      id: l.id, pharmacy_id: l.pharmacyId, event: l.event,
      customer_id: l.customerId ?? null, text: l.text,
      kind: notifKind(l.kind), at: l.at,
    }));

    const templateRows: Row[] = Object.entries(DB.notifTemplates).flatMap(([pharmacyId, tpls]) =>
      Object.entries(tpls ?? {}).map(([eventId, t]) => ({
        pharmacy_id: pharmacyId, event_id: eventId,
        enabled: Boolean(t.enabled), text: t.text,
      })),
    );

    // The schema's flags table only accepts customer/staff targets.
    const flagRows: Row[] = (DB.flags as any[])
      .filter((f: any) => f.targetType === 'customer' || f.targetType === 'staff')
      .map((f: any) => ({
        id: f.id, target_type: f.targetType, target_id: f.targetId ?? '',
        reason: f.reason ?? f.note ?? '', status: f.status,
      }));

    const pageRows: Row[] = Object.entries(DB.pages).map(([key, p]) => ({
      key, title: p.title, body: p.body,
    }));

    const faqRows: Row[] = DB.faqs.map((f) => ({ id: f.id, q: f.q, a: f.a }));
    const promoRows: Row[] = DB.promotions.map((p) => ({
      id: p.id, title: p.title, text: p.text, active: p.active,
    }));

    const bannerRows: Row[] = DB.homepageBanner
      ? [{ id: true, headline: DB.homepageBanner.headline, subtext: DB.homepageBanner.subtext ?? '', cta_label: DB.homepageBanner.ctaLabel ?? '', active: DB.homepageBanner.active }]
      : [];

    const auditRows: Row[] = DB.auditLog.map((a) => ({
      id: a.id, at: a.at, actor: a.actor, action: a.action,
    }));

    const settingsRows: Row[] = [{
      id: true,
      platform_name: DB.settings.platformName,
      support_email: DB.settings.supportEmail ?? null,
      currency: DB.settings.currency,
      pickup_enabled: DB.settings.pickupEnabled,
      delivery_enabled: DB.settings.deliveryEnabled,
      delivery_fee: Number(DB.settings.deliveryFee),
      free_delivery_over: DB.settings.freeDeliveryOver != null ? Number(DB.settings.freeDeliveryOver) : null,
      low_stock_threshold: Number(DB.settings.lowStockThreshold),
      return_window_days: Number(DB.settings.returnWindowDays),
      payments: DB.settings.payments,
    }];

    // ---- Wipe (children before parents so FKs never block) ----
    const wipeOrder: string[] = [
      T.flags, T.pages, T.faqs, T.promotions, T.audit, T.settings, T.banner,
      T.threadMessages, T.notifications, T.addresses, T.wishlist, T.orderItems, T.reviews, T.returns,
      T.threads, T.orders, T.medicines, T.staff, T.notifTemplates, T.notifLog,
      T.customers, T.admins, T.pharmacies,
    ];
    for (const { table, key } of TABLES.sort((a, b) => wipeOrder.indexOf(a.table) - wipeOrder.indexOf(b.table))) {
      await db.from(table).delete().neq(key, SENTINEL);
    }

    // ---- Write (roots before children, FK-safe) ----
    const writes: { table: string; key: string; rows: Row[] }[] = [
      { table: T.pharmacies,      key: 'id',          rows: pharmacyRows },
      { table: T.admins,          key: 'id',          rows: adminRows },
      { table: T.customers,       key: 'id',          rows: customerRows },
      { table: T.staff,           key: 'id',          rows: staffRows },
      { table: T.medicines,       key: 'id',          rows: medicineRows },
      { table: T.addresses,       key: 'id',          rows: addressRows },
      { table: T.wishlist,        key: 'customer_id', rows: wishlistRows },
      { table: T.notifTemplates,  key: 'pharmacy_id', rows: templateRows },
      { table: T.notifLog,        key: 'id',          rows: notifLogRows },
      { table: T.orders,          key: 'id',          rows: orderRows },
      { table: T.threads,         key: 'id',          rows: threadRows },
      { table: T.orderItems,      key: 'order_id',    rows: orderItemRows },
      { table: T.threadMessages,  key: 'thread_id',   rows: messageRows },
      { table: T.reviews,         key: 'id',          rows: reviewRows },
      { table: T.returns,         key: 'id',          rows: returnRows },
      { table: T.notifications,   key: 'id',          rows: notifRows },
      { table: T.flags,           key: 'id',          rows: flagRows },
      { table: T.pages,           key: 'key',         rows: pageRows },
      { table: T.faqs,            key: 'id',          rows: faqRows },
      { table: T.promotions,      key: 'id',          rows: promoRows },
      { table: T.banner,          key: 'id',          rows: bannerRows },
      { table: T.audit,           key: 'id',          rows: auditRows },
      { table: T.settings,        key: 'id',          rows: settingsRows },
    ];
    for (const { table, key, rows } of writes) {
      await replaceRows(table, key, rows);
    }

    return true;
  } catch (err) {
    console.error('[postgres] saveSnapshot failed:', (err as Error).message);
    return false;
  }
}

export { supabaseEnabled };

/**
 * One-shot health probe: reads the settings table.
 * Returns a diagnostics string for the UI / console.
 */
export async function probeConnection(): Promise<{ ok: boolean; detail: string }> {
  if (!supabase) {
    return { ok: false, detail: 'Postgres not configured (missing .env credentials).' };
  }
  const { error } = await db.from(T.settings).select('id').limit(1);
  if (error) {
    const isMissing = error.message?.includes('relation') || error.code === '42P01';
    return {
      ok: false,
      detail: isMissing
        ? `Schema not found. Run src/data/postgres-schema.sql in your Postgres / Supabase SQL editor.`
        : `Read blocked: ${error.message}`,
    };
  }
  return { ok: true, detail: `Connected to Postgres — read OK.` };
}