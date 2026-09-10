// ============================================================
//  CarePoint — pure helper functions
// ============================================================

import { DB, counters } from './db';
import type { Medicine, Order, Notification, StaffMember } from './types';

// ---------- Currency ----------

export const CURRENCIES: Record<string, { symbol: string; label: string }> = {
  PHP: { symbol: '₱', label: 'Philippine Peso (₱)' },
  USD: { symbol: '$', label: 'US Dollar ($)' },
  EUR: { symbol: '€', label: 'Euro (€)' },
  SGD: { symbol: 'S$', label: 'Singapore Dollar (S$)' },
  JPY: { symbol: '¥', label: 'Japanese Yen (¥)' },
};

export function currencySymbol(): string {
  const c = CURRENCIES[DB.settings.currency];
  return c ? c.symbol : '₱';
}

export function money(n: number): string {
  return currencySymbol() + Number(n).toFixed(2);
}

// ---------- Categories ----------

export const CATEGORIES = [
  'Pain Relief',
  'Cold & Flu',
  'Allergy',
  'Vitamins',
  'First Aid',
  'Digestive',
  'Skin Care',
];

export const CAT_ICON: Record<string, string> = {
  'Pain Relief': 'leaf',
  'Cold & Flu': 'droplet',
  'Allergy': 'flower',
  'Vitamins': 'capsule',
  'First Aid': 'cross',
  'Digestive': 'sprout',
  'Skin Care': 'jar',
  'Prescription': 'quill',
};

// ---------- Order status ----------

export const STATUS_FLOW = ['pending', 'confirmed', 'ready', 'completed'] as const;

export const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

// ---------- Entity lookups ----------

export const pharmacy = (id: string) => DB.pharmacies.find((p) => p.id === id);
export const medicine = (id: string) => DB.medicines.find((m) => m.id === id);
export const customer = (id: string) => DB.customers.find((c) => c.id === id);
export const staffMember = (id: string) => DB.staff.find((s) => s.id === id);
export const adminUser = (id: string) => DB.admins.find((a) => a.id === id);
export const order = (id: string) => DB.orders.find((o) => o.id === id);

// ---------- Brand helpers ----------

/** Resolve a product's brand: explicit field → spec Manufacturer → generic fallback. */
export function medBrand(m: { brand?: string; specs?: Record<string, string> }): string {
  if (m.brand && m.brand.trim()) return m.brand.trim();
  const specBrand = m.specs?.['Brand'] || m.specs?.['Manufacturer'];
  if (specBrand && specBrand.trim()) return specBrand.trim();
  return 'Generic';
}

/** Distinct brands offered on the public storefront, sorted alphabetically. */
export function brandList(): string[] {
  return [...new Set(
    publicMedicines()
      .map((m) => medBrand(m))
      .filter((b) => b && b !== 'Generic'),
  )].sort((a, b) => a.localeCompare(b));
}

// ---------- Staff / role helpers ----------

/** True when the staff member is a Pharmacy-level administrator. */
export function isPharmacyAdmin(s?: { role?: string }): boolean {
  return s?.role === 'pharmacyAdmin';
}

/** Human-readable label for an active user role. */
export function roleLabel(role: string | null | undefined): string {
  if (role === 'siteAdmin')     return 'Site Admin';
  if (role === 'pharmacyAdmin') return 'Pharmacy Admin';
  if (role === 'staff')         return 'Staff';
  if (role === 'customer')      return 'Customer';
  return 'Unknown';
}

/** Pharmacy admins assigned to a pharmacy. */
export function pharmacyManagers(pharmacyId: string): StaffMember[] {
  return DB.staff.filter((s) => s.pharmacyId === pharmacyId && s.role === 'pharmacyAdmin');
}

/** Regular staff members of a pharmacy (excludes pharmacy admins). */
export function pharmacyTeam(pharmacyId: string): StaffMember[] {
  return DB.staff.filter((s) => s.pharmacyId === pharmacyId && (s.role ?? 'staff') === 'staff');
}

export const pharmacyName = (id: string): string => {
  const p = pharmacy(id);
  return p ? p.name : 'Unknown pharmacy';
};

export const customerName = (id: string): string => {
  const c = customer(id);
  return c ? c.name : 'Removed customer';
};

// ---------- Medicine helpers ----------

export const MED_EMOJI: Record<string, string> = {
  Paracetamol: '💊', Ibuprofen: '💊', Cetirizine: '💊', Amoxicillin: '💊',
  'Cough Syrup': '🍯', 'Oral Rehydration': '🧂', 'Vitamin C': '🍊',
  Multivitamins: '🥗', Antiseptic: '🧴', Hydrocortisone: '🧴',
  Salbutamol: '💨', Echinacea: '🌿', Ginger: '🍯',
};

export const MED_GRADIENT: Record<string, [string, string]> = {
  Paracetamol: ['#E8D5B7', '#D4BFA0'],
  Ibuprofen: ['#E8D5B7', '#D4BFA0'],
  Cetirizine: ['#D4E0D8', '#B8C9BE'],
  Amoxicillin: ['#F5E3D4', '#E8CDB8'],
  'Cough Syrup': ['#F0D4B0', '#E0BC8A'],
  'Oral Rehydration': ['#D4E8E0', '#B8D4C8'],
  'Vitamin C': ['#F5E0B0', '#E8CC8A'],
  Multivitamins: ['#D4E8D0', '#B8D4B0'],
  Antiseptic: ['#D0E0E8', '#B0C8D4'],
  Hydrocortisone: ['#E8DDE0', '#D4C4C8'],
  Salbutamol: ['#D0E0F0', '#B0C8E0'],
  Echinacea: ['#D4E8D8', '#B0C8B8'],
  Ginger: ['#E8D8B8', '#D4C4A0'],
};

export function getMedEmoji(name: string): string {
  for (const [key, val] of Object.entries(MED_EMOJI)) {
    if (name.includes(key)) return val;
  }
  return '💊';
}

export function getMedGradient(name: string): [string, string] {
  for (const [key, val] of Object.entries(MED_GRADIENT)) {
    if (name.includes(key)) return val;
  }
  return ['#D4D4D4', '#B8B8B8'];
}

export function isListed(m: Medicine): boolean {
  return (m.status ?? 'active') === 'active';
}

export function lowStockThreshold(m: Medicine): number {
  const t = m.lowStockThreshold;
  return t === undefined || t === null || isNaN(t)
    ? DB.settings.lowStockThreshold
    : t;
}

export function isLowStock(m: Medicine): boolean {
  return m.stock > 0 && m.stock <= lowStockThreshold(m);
}

export function stockState(s: number): 'out' | 'low' | 'in' {
  return s === 0 ? 'out' : s <= 10 ? 'low' : 'in';
}

export function stockText(s: number): string {
  return s === 0
    ? 'Out of stock'
    : s <= 10
    ? `Low stock — ${s} left`
    : `${s} in stock`;
}

export function productStatus(m: Medicine): 'inactive' | 'out' | 'active' {
  if ((m.status ?? 'active') === 'inactive') return 'inactive';
  return m.stock === 0 ? 'out' : 'active';
}

// ---------- Reviews / ratings ----------

export function medReviews(medId: string) {
  return DB.reviews.filter((r) => r.medId === medId);
}

export function medRatingAvg(medId: string): number {
  const rs = medReviews(medId);
  if (!rs.length) return 0;
  return rs.reduce((s, r) => s + r.rating, 0) / rs.length;
}

// ---------- Public listing helpers ----------

export function publicMedicines(): Medicine[] {
  return DB.medicines.filter((m) => {
    const ph = pharmacy(m.pharmacyId);
    return ph && ph.status === 'approved' && isListed(m);
  });
}

export function platformStats() {
  const openPharmacies = DB.pharmacies.filter((p) => p.status === 'approved');
  const meds = publicMedicines();
  const rated = meds.filter((m) => medReviews(m.id).length);
  const avg = rated.length
    ? rated.reduce((s, m) => s + medRatingAvg(m.id), 0) / rated.length
    : 0;
  return {
    pharmacies: openPharmacies.length,
    meds: meds.length,
    avg,
    delivered: DB.orders.filter((o) => o.status === 'completed').length,
  };
}

// ---------- Order helpers ----------

export function orderTotal(o: Order): number {
  return o.items.reduce((sum, it) => sum + it.price * it.qty, 0);
}

export function deliveryFeeFor(subtotal: number): number {
  const s = DB.settings;
  if (s.freeDeliveryOver > 0 && subtotal >= s.freeDeliveryOver) return 0;
  return Number(s.deliveryFee) || 0;
}

// ---------- Notifications ----------

export function custNotifications(custId: string): Notification[] {
  return DB.notifications
    .filter((n) => n.customerId === custId)
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}

export function unreadNotifCount(custId: string): number {
  return DB.notifications.filter((n) => n.customerId === custId && !n.read).length;
}

export function pushNotification(custId: string, type: string, text: string): void {
  DB.notifications.unshift({
    id: 'n' + counters.notif++,
    customerId: custId,
    type,
    text,
    read: false,
    at: new Date(),
  });
}

// ---------- Wishlist ----------

export function isWishlisted(custId: string, medId: string): boolean {
  const c = customer(custId);
  return !!(c && c.wishlist && c.wishlist.includes(medId));
}

// ---------- Unread messages ----------

export function unreadForCustomer(custId: string): number {
  return DB.threads.filter((t) => t.customerId === custId && t.unreadForCustomer).length;
}

export function unreadForStaffPharmacy(pharmacyId: string): number {
  return DB.threads.filter((t) => t.pharmacyId === pharmacyId && t.unreadForStaff).length;
}

// ---------- Formatting ----------

export function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function timeGreeting(): { text: string; icon: string } {
  const h = new Date().getHours();
  if (h < 12) return { text: 'Good morning', icon: 'sprout' };
  if (h < 18) return { text: 'Good afternoon', icon: 'flower' };
  return { text: 'Good evening', icon: 'leaf' };
}

// ============================================================
//  Extended helpers — imported from Phase 3 prototype
// ============================================================

import type { ReturnRequest } from './types';

// ---------- Product status labels / badges ----------

export const PRODUCT_STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  inactive: 'Inactive',
  out: 'Out of stock',
};

export const PRODUCT_STATUS_BADGE: Record<string, string> = {
  active: 'cp-badge-active',
  inactive: 'cp-badge-inactive',
  out: 'cp-badge-out',
};

// ---------- Pharmacy-scoped medicine lists ----------

export function pharmacyMedicines(pharmacyId: string) {
  return DB.medicines.filter((m) => m.pharmacyId === pharmacyId);
}

export function lowStockMedicines(pharmacyId: string) {
  return DB.medicines.filter(
    (m) => m.pharmacyId === pharmacyId && m.stock > 0 && isLowStock(m),
  );
}

export function outOfStockMedicines(pharmacyId: string) {
  return DB.medicines.filter(
    (m) => m.pharmacyId === pharmacyId && m.stock === 0,
  );
}

// ---------- Product description fallback ----------

export function productDescription(m: { description?: string; name: string; category: string }): string {
  if (m.description) return m.description;
  return `${m.name} — a trusted ${m.category.toLowerCase()} product from your neighborhood apothecary.`;
}

// ---------- Notification event templates ----------

export const NOTIF_EVENTS: { id: string; label: string; when: string; text: string }[] = [
  {
    id: 'orderPlaced',
    label: 'Order confirmation',
    when: 'Sent the moment a customer places an order.',
    text: '🧾 Thanks {customer}! Order #{order} has been received by {pharmacy}.',
  },
  {
    id: 'orderConfirmed',
    label: 'Order processing',
    when: 'Sent when the order moves to Confirmed.',
    text: '👩‍⚕️ {pharmacy} is now preparing Order #{order}.',
  },
  {
    id: 'orderReady',
    label: 'Ready / shipped',
    when: 'Sent when the order is ready for pickup or shipped.',
    text: '📦 Order #{order} is ready at {pharmacy}. See you soon!',
  },
  {
    id: 'orderCompleted',
    label: 'Delivered / completed',
    when: 'Sent when the order is completed.',
    text: '✅ Order #{order} is complete. Thank you for shopping with {pharmacy}!',
  },
  {
    id: 'orderCancelled',
    label: 'Order cancelled',
    when: 'Sent when an order is cancelled.',
    text: '❌ Order #{order} was cancelled. Contact {pharmacy} if this was a mistake.',
  },
  {
    id: 'returnUpdate',
    label: 'Return / refund update',
    when: 'Sent when a return request changes status.',
    text: '↩️ Your return for Order #{order} is now {status}.',
  },
];

// ---------- Notification template helpers ----------

export function notifTemplates(phId: string): Record<string, { enabled: boolean; text: string }> {
  if (!DB.notifTemplates[phId]) {
    DB.notifTemplates[phId] = {};
    NOTIF_EVENTS.forEach((e) => {
      DB.notifTemplates[phId][e.id] = { enabled: true, text: e.text };
    });
  }
  return DB.notifTemplates[phId];
}

export function renderTemplate(text: string, ctx: Record<string, string>): string {
  return String(text).replace(/\{(\w+)\}/g, (_, k) =>
    ctx[k] !== undefined ? ctx[k] : `{${k}}`,
  );
}

// ---------- Return helpers ----------

export const RETURN_LABEL: Record<string, string> = {
  requested: 'Requested',
  approved: 'Approved',
  refunded: 'Refunded',
  rejected: 'Rejected',
};

export const RETURN_BADGE: Record<string, string> = {
  requested: 'cp-badge-pending',
  approved: 'cp-badge-confirmed',
  refunded: 'cp-badge-completed',
  rejected: 'cp-badge-cancelled',
};

export function pharmacyReturns(phId: string): ReturnRequest[] {
  return DB.returns.filter((r) => r.pharmacyId === phId);
}

export function orderReturn(orderId: string): ReturnRequest | undefined {
  return DB.returns.find((r) => r.orderId === orderId);
}

// ---------- Notification log helpers ----------

export function logNotification(
  phId: string,
  eventId: string,
  customerId: string | undefined,
  text: string,
  kind: string,
) {
  DB.notificationLog.unshift({
    id: 'log' + (counters.log++),
    pharmacyId: phId,
    event: eventId,
    customerId,
    text,
    kind,
    at: new Date(),
  });
}

export function sendTemplatedNotification(
  phId: string,
  eventId: string,
  ctx: Record<string, string>,
) {
  const tpl = notifTemplates(phId)[eventId];
  if (!tpl || !tpl.enabled) return;
  const ph = pharmacy(phId);
  const full = { pharmacy: ph ? ph.name : 'the pharmacy', ...ctx };
  const text = renderTemplate(tpl.text, full);
  if (ctx.customerId) pushNotification(ctx.customerId, 'order', text);
  logNotification(phId, eventId, ctx.customerId, text, 'automated');
}

export function notifyOrderEvent(
  o: { id: string; pharmacyId: string; customerId: string; status: string },
  eventId: string | undefined,
  extra?: Record<string, string>,
) {
  if (!eventId) return;
  const c = customer(o.customerId);
  sendTemplatedNotification(
    o.pharmacyId,
    eventId,
    Object.assign(
      {
        customerId: o.customerId,
        customer: c ? c.name.split(' ')[0] : 'there',
        order: o.id.replace('o', ''),
        status: STATUS_LABEL[o.status] ?? o.status,
      },
      extra ?? {},
    ),
  );
}

// ---------- Payment methods ----------

export const PAYMENT_METHODS = [
  { id: 'card',     label: 'Card',              icon: '💳' },
  { id: 'gcash',    label: 'GCash',             icon: '📱' },
  { id: 'paymaya',  label: 'PayMaya',           icon: '📱' },
  { id: 'paypal',   label: 'PayPal',            icon: '🌐' },
  { id: 'cod',      label: 'Cash on Delivery',  icon: '💵' },
];

export function enabledPaymentMethods() {
  return PAYMENT_METHODS.filter((pm) => DB.settings.payments[pm.id]);
}

// ---------- Order payment display ----------

export function orderPaymentLabel(o: { paymentLabel?: string }): string {
  return o.paymentLabel ?? 'Card (test mode)';
}

// ---------- Customer utility ----------

export function pharmacyCustomerIds(phId: string): string[] {
  return [...new Set(
    DB.orders.filter((o) => o.pharmacyId === phId).map((o) => o.customerId),
  )].filter((id) => !!customer(id));
}

// ---------- Purge medicine references from carts (called on delete) ----------

export function purgeMedicineReferences(
  medId: string,
  carts: Record<string, { items: { medId: string; qty: number; price: number }[] }>,
): Record<string, { items: { medId: string; qty: number; price: number }[] }> {
  // Wishlist
  DB.customers.forEach((c) => {
    if (c.wishlist) c.wishlist = c.wishlist.filter((w) => w !== medId);
  });
  // Return cleaned carts
  const next: typeof carts = {};
  for (const [key, cart] of Object.entries(carts)) {
    const items = cart.items.filter((i) => i.medId !== medId);
    if (items.length) next[key] = { items };
  }
  return next;
}

// ---------- Misc ----------

export function fmtCurrency(n: number): string {
  return money(n);
}

export function orderItemMed(it: { medId: string; price: number }) {
  return (
    medicine(it.medId) ?? {
      id: it.medId,
      name: 'Delisted item',
      category: 'Pain Relief',
      price: it.price,
      stock: 0,
      prescription: false,
      sold: 0,
      addedAt: 0,
    }
  );
}

export function orderAddressText(
  o: { customerId: string; addressId: string | null },
): string {
  const c = customer(o.customerId);
  const addr = c?.addresses.find((a) => a.id === o.addressId);
  return addr ? addr.text : 'address on file';
}

// ---------- Phase 4: audit trail ----------

export function logAudit(actor: string, action: string): void {
  DB.auditLog.unshift({ id: 'audit' + counters.audit++, at: new Date(), actor, action });
  if (DB.auditLog.length > 300) DB.auditLog.length = 300;
}

// ============================================================
//  nextCounter — public re-export of the prototype's ID util
//
//  Mirrors the prototype's nextCounter(list, prefix, fallback)
//  logic. Parses numeric suffixes from entity IDs to return
//  the next safe integer, preventing duplicate primary keys
//  when creating new orders, threads, medicines, reviews, etc.
// ============================================================

/**
 * Returns the next auto-increment integer for an ID-keyed list.
 *
 * @param list     Array of objects with an `id: string` field.
 * @param prefix   The non-numeric prefix to strip (e.g. 'o', 'm', 'rv').
 * @param fallback Value to use when the list is empty.
 *
 * @example
 *   nextCounter(DB.orders, 'o', 1001)   // → 1003 if highest id is 'o1002'
 *   nextCounter(DB.reviews, 'rv', 1)    // → 2    if highest id is 'rv1'
 */
export function nextCounter(
  list: { id: string }[],
  prefix: string,
  fallback: number,
): number {
  const nums = list
    .map((r) => parseInt(r.id.replace(prefix, ''), 10))
    .filter((n) => !isNaN(n));
  return nums.length ? Math.max(...nums) + 1 : fallback;
}

// ============================================================
//  pharmacyMapHtml — customer map canvas template generator
//
//  Mirrors the prototype's pharmacyMapHtml(ph, canvasId).
//  Returns an HTML string with the .pharmacy-map-view container
//  that initCustomerPharmacyMaps() picks up via querySelectorAll.
//  In the React app this is used as a data-URI fallback for
//  environments where dangerouslySetInnerHTML is preferred;
//  the PharmacyMapCustomer component is the idiomatic React way.
// ============================================================

/**
 * Generates the HTML markup string for a customer-facing
 * pharmacy mini-map canvas. The caller is responsible for
 * injecting the returned string into the DOM and then running
 * initCustomerMap() (or the React equivalent) on it.
 *
 * @param ph        Pharmacy object with at minimum `id`, `name`,
 *                  and optional `lat`/`lng` numeric properties.
 * @param canvasId  Optional explicit element id for the canvas div.
 */
export function pharmacyMapHtml(
  ph: { id: string; name: string; lat?: number; lng?: number },
  canvasId?: string,
): string {
  const id  = canvasId ?? `phmap-${ph.id}`;
  const lat = typeof ph.lat === 'number' ? ph.lat : 0;
  const lng = typeof ph.lng === 'number' ? ph.lng : 0;
  return (
    `<div class="pharmacy-map-view" ` +
    `id="${id}" ` +
    `data-lat="${lat}" ` +
    `data-lng="${lng}" ` +
    `data-name="${ph.name.replace(/"/g, '&quot;')}" ` +
    `style="width:100%;height:180px;border-radius:14px;overflow:hidden;">` +
    `</div>`
  );
}
