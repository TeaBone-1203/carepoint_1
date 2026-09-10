// ============================================================
//  CarePoint — in-memory data store (TypeScript)
//  Mirrors the original script.js DB exactly.
// ============================================================

import type {
  Pharmacy,
  Medicine,
  Customer,
  StaffMember,
  Admin,
  Order,
  MessageThread,
  Flag,
  Review,
  Notification,
  ReturnRequest,
  PlatformSettings,
  NotifTemplate,
  StaticPage,
  Faq,
  Promotion,
  HomepageBanner,
  AuditEntry,
} from './types';

// ---------- Seed data ----------

export const DB: {
  pharmacies: Pharmacy[];
  medicines: Medicine[];
  customers: Customer[];
  staff: StaffMember[];
  admins: Admin[];
  orders: Order[];
  threads: MessageThread[];
  flags: Flag[];
  reviews: Review[];
  notifications: Notification[];
  returns: ReturnRequest[];
  notificationLog: {
    id: string;
    pharmacyId: string;
    event: string;
    customerId: string | undefined;
    text: string;
    kind: string;
    at: Date;
  }[];
  notifTemplates: Record<string, Record<string, NotifTemplate>>;
  settings: PlatformSettings;
  pages: Record<string, StaticPage>;
  faqs: Faq[];
  promotions: Promotion[];
  homepageBanner: HomepageBanner;
  auditLog: AuditEntry[];
} = {
  pharmacies: [
    {
      id: 'p1',
      name: 'Wellness Corner Pharmacy',
      location: '12 Mabini St., Downtown District',
      hours: '8:00 AM – 9:00 PM daily',
      status: 'approved',
    },
    {
      id: 'p_pending',
      name: 'Greenleaf Apothecary',
      location: '45 Sampaguita Ave., Riverside',
      hours: '9:00 AM – 8:00 PM Mon–Sat',
      status: 'pending',
    },
  ],

  medicines: [
    {
      id: 'm1', pharmacyId: 'p1', name: 'Paracetamol 500mg (20 tabs)',
      category: 'Pain Relief', price: 85, stock: 120, prescription: false, sold: 34, addedAt: 10,
      brand: 'CarePoint Generics',
      description: 'Fast-acting relief for headaches, fever, and everyday aches — gentle on the stomach when taken as directed.',
      specs: { Form: 'Tablet', Strength: '500 mg', 'Pack Size': '20 tablets', Manufacturer: 'CarePoint Generics', Storage: 'Store below 30°C, away from moisture' },
    },
    {
      id: 'm2', pharmacyId: 'p1', name: 'Ibuprofen 200mg (20 tabs)',
      category: 'Pain Relief', price: 120, stock: 60, prescription: false, sold: 19, addedAt: 9,
      brand: 'CarePoint Generics',
      description: 'An anti-inflammatory pain reliever that eases pain, swelling, and fever — good for muscle aches and minor injuries.',
      specs: { Form: 'Tablet', Strength: '200 mg', 'Pack Size': '20 tablets', Manufacturer: 'CarePoint Generics', Storage: 'Store below 30°C, away from moisture' },
    },
    {
      id: 'm3', pharmacyId: 'p1', name: 'Cetirizine 10mg (10 tabs)',
      category: 'Allergy', price: 95, stock: 40, prescription: false, sold: 12, addedAt: 8,
      brand: 'CarePoint Generics',
      description: 'A once-daily antihistamine for sneezing, itchy eyes, and a runny nose brought on by allergies.',
      specs: { Form: 'Tablet', Strength: '10 mg', 'Pack Size': '10 tablets', Manufacturer: 'CarePoint Generics', Storage: 'Store below 25°C' },
    },
    {
      id: 'm4', pharmacyId: 'p1', name: 'Cough Syrup — Adult 120ml',
      category: 'Cold & Flu', price: 135, stock: 30, prescription: false, sold: 21, addedAt: 7,
      brand: 'Wellness Labs',
      description: 'Soothes dry and productive coughs so you can rest easier through a cold.',
      specs: { Form: 'Syrup', Volume: '120 ml', Dosage: '10 ml every 6–8 hours', Manufacturer: 'Wellness Labs PH', Storage: 'Discard 6 months after opening' },
    },
    {
      id: 'm5', pharmacyId: 'p1', name: 'Oral Rehydration Salts (10 sachets)',
      category: 'Digestive', price: 40, stock: 100, prescription: false, sold: 8, addedAt: 6,
      brand: 'CarePoint Generics',
      description: 'Replaces fluids and electrolytes lost from diarrhea, vomiting, or heat exhaustion.',
      specs: { Form: 'Powder sachet', 'Pack Size': '10 sachets', Preparation: 'Dissolve 1 sachet in 200 ml clean water', Manufacturer: 'CarePoint Generics' },
    },
    {
      id: 'm6', pharmacyId: 'p1', name: 'Amoxicillin 500mg (21 caps)',
      category: 'Prescription', price: 180, stock: 50, prescription: true, sold: 5, addedAt: 5,
      brand: 'CarePoint Pharma',
      description: 'A broad-spectrum antibiotic used to treat a range of bacterial infections. Prescription required.',
      specs: { Form: 'Capsule', Strength: '500 mg', 'Pack Size': '21 capsules', 'Requires Prescription': 'Yes', Manufacturer: 'CarePoint Pharma' },
    },
    {
      id: 'm7', pharmacyId: 'p1', name: 'Vitamin C 500mg (60 tabs)',
      category: 'Vitamins', price: 150, stock: 200, prescription: false, sold: 41, addedAt: 4,
      brand: 'Sunrise',
      description: 'Supports everyday immune health and skin with a daily dose of Vitamin C.',
      specs: { Form: 'Tablet', Strength: '500 mg', 'Pack Size': '60 tablets', Manufacturer: 'Sunrise Nutraceuticals' },
    },
    {
      id: 'm8', pharmacyId: 'p1', name: 'Multivitamins (60 tabs)',
      category: 'Vitamins', price: 220, stock: 80, prescription: false, sold: 27, addedAt: 3,
      brand: 'Sunrise',
      description: 'A complete daily multivitamin covering essential vitamins and minerals for everyday energy.',
      specs: { Form: 'Tablet', 'Pack Size': '60 tablets', Dosage: '1 tablet daily with food', Manufacturer: 'Sunrise Nutraceuticals' },
    },
    {
      id: 'm9', pharmacyId: 'p1', name: 'Antiseptic Solution 250ml',
      category: 'First Aid', price: 75, stock: 55, prescription: false, sold: 6, addedAt: 2,
      brand: 'CarePoint Generics',
      description: 'A gentle antiseptic solution for cleaning minor cuts, scrapes, and grazes.',
      specs: { Form: 'Liquid', Volume: '250 ml', 'Active Ingredient': 'Povidone-iodine 10%', Manufacturer: 'CarePoint Generics' },
    },
    {
      id: 'm10', pharmacyId: 'p1', name: 'Hydrocortisone Cream 1% 20g',
      category: 'Skin Care', price: 180, stock: 6, prescription: false, sold: 3, addedAt: 1,
      brand: 'CarePoint Generics',
      description: 'A mild topical steroid cream that calms itching, redness, and irritation.',
      specs: { Form: 'Cream', Strength: '1%', Volume: '20 g', Application: 'Thin layer, 1–2 times daily', Manufacturer: 'CarePoint Generics' },
    },
    {
      id: 'm11', pharmacyId: 'p1', name: 'Salbutamol Inhaler 100mcg',
      category: 'Prescription', price: 320, stock: 40, prescription: true, sold: 2, addedAt: 0,
      brand: 'CarePoint Pharma',
      description: 'A fast-acting reliever inhaler for asthma and sudden breathing difficulty. Prescription required.',
      specs: { Form: 'Metered-dose inhaler', Strength: '100 mcg/puff', 'Requires Prescription': 'Yes', Manufacturer: 'CarePoint Pharma' },
    },
    {
      id: 'm_pending1', pharmacyId: 'p_pending', name: 'Echinacea Drops 30ml',
      category: 'Cold & Flu', price: 210, stock: 45, prescription: false, sold: 0, addedAt: 0,
      brand: 'Greenleaf Botanicals',
      description: 'An herbal tincture traditionally used to support the immune system at the first sign of a cold.',
      specs: { Form: 'Liquid drops', Volume: '30 ml', Manufacturer: 'Greenleaf Botanicals' },
    },
    {
      id: 'm_pending2', pharmacyId: 'p_pending', name: 'Ginger & Honey Lozenges',
      category: 'Cold & Flu', price: 95, stock: 60, prescription: false, sold: 0, addedAt: 0,
      brand: 'Greenleaf Botanicals',
      description: 'Soothing lozenges that ease a scratchy throat with real ginger and honey.',
      specs: { Form: 'Lozenge', 'Pack Size': '12 lozenges', Manufacturer: 'Greenleaf Botanicals' },
    },
  ],

  customers: [
    {
      id: 'c1',
      name: 'Juan Dela Cruz',
      email: 'juan@example.com',
      password: 'demo123',
      status: 'active',
      addresses: [{ id: 'addr1', label: 'Home', text: '123 Mabini St., Downtown District' }],
      wishlist: ['m7'],
    },
  ],

  staff: [
    {
      id: 's1', name: 'Alyssa Reyes', email: 'alyssa@wellnesscorner.ph',
      password: 'demo123', pharmacyId: 'p1', role: 'pharmacyAdmin', status: 'active',
    },
    {
      id: 's_team', name: 'Luis Tan', email: 'luis@wellnesscorner.ph',
      password: 'demo123', pharmacyId: 'p1', role: 'staff', status: 'active',
    },
    {
      id: 's_pending', name: 'Maria Santos', email: 'maria@greenleaf.ph',
      password: 'demo123', pharmacyId: 'p_pending', role: 'staff', status: 'pending',
    },
  ],

  admins: [{ id: 'a1', name: 'Admin User', email: 'admin@carepoint.ph', password: 'admin123' }],

  orders: [
    {
      id: 'o1001', customerId: 'c1', pharmacyId: 'p1',
      items: [{ medId: 'm10', qty: 1, price: 180 }],
      fulfillment: 'pickup', addressId: null, status: 'completed',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
    },
    {
      id: 'o1002', customerId: 'c1', pharmacyId: 'p1',
      items: [{ medId: 'm1', qty: 2, price: 85 }],
      fulfillment: 'pickup', addressId: null, status: 'completed',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4),
    },
  ],

  threads: [],
  flags: [
    {
      id: 'flg1', status: 'open', type: 'account', note: 'Reported by a shopper',
      at: new Date(Date.now() - 1000 * 60 * 60 * 6),
      reason: 'Customer reported an issue with this pharmacy.',
      targetType: 'pharmacy', targetId: 'p1',
    },
    {
      id: 'flg2', status: 'open', type: 'product', note: 'Possible listing concern',
      at: new Date(Date.now() - 1000 * 60 * 60 * 26),
      reason: 'Listing flagged for review by pharmacy staff.',
      targetType: 'medicine', targetId: 'm10',
    },
    {
      id: 'flg3', status: 'open', type: 'transaction', note: 'Disputed transaction',
      at: new Date(Date.now() - 1000 * 60 * 60 * 49),
      reason: 'Order-level dispute reported at checkout helpdesk.',
      targetType: 'order', targetId: 'o1001',
    },
  ] as any[],

  reviews: [
    {
      id: 'rv1', medId: 'm10', customerId: 'c1', orderId: 'o1001', rating: 5,
      at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5),
    },
  ],

  notifications: [
    {
      id: 'n1', customerId: 'c1', type: 'promo',
      text: '🌿 Welcome basket: 10% off Vitamins this week at Wellness Corner Pharmacy.',
      read: false,
      at: new Date(Date.now() - 1000 * 60 * 60 * 3),
    },
  ],

  returns: [],
  notificationLog: [],
  notifTemplates: {},

  settings: {
    platformName: 'CarePoint',
    supportEmail: 'support@carepoint.ph',
    currency: 'PHP',
    pickupEnabled: true,
    deliveryEnabled: true,
    deliveryFee: 49,
    freeDeliveryOver: 1500,
    payments: { card: true, gcash: true, paymaya: true, paypal: true, cod: true },
    lowStockThreshold: 10,
    returnWindowDays: 7,
  },

  // ---------- Phase 4: platform-admin Content Management System ----------
  pages: {
    about: { title: 'About Us', body: 'CarePoint connects neighborhood pharmacies with the customers who rely on them — real pharmacists, real medicine, delivered with care.' },
    contact: { title: 'Contact', body: "Have a question? Reach the CarePoint team at support@carepoint.ph and we'll get back to you within one business day." },
    privacy: { title: 'Privacy Policy', body: 'CarePoint collects only the information needed to fulfill your orders and never sells your data to third parties.' },
  },
  faqs: [
    { id: 'faq1', q: 'How do I know a pharmacy on CarePoint is legitimate?', a: 'Every pharmacy is reviewed and approved by our team before it can list products.' },
    { id: 'faq2', q: 'Can I get prescription medicine delivered?', a: 'Yes — upload a valid prescription at checkout and the pharmacy will verify it before dispatch.' },
  ],
  promotions: [
    { id: 'promo1', title: '🌿 Welcome basket', text: '10% off Vitamins this week at participating pharmacies.', active: true },
  ],
  homepageBanner: { headline: 'Your neighborhood apothecary, online.', subtext: 'Real pharmacies, real pharmacists, delivered with care.', ctaLabel: 'Browse remedies', active: true },
  auditLog: [],
};

// ---------- Counters ----------

function nextCounter(
  list: { id: string }[],
  prefix: string,
  fallback: number,
): number {
  const nums = list
    .map((r) => parseInt(r.id.replace(prefix, ''), 10))
    .filter((n) => !isNaN(n));
  return nums.length ? Math.max(...nums) + 1 : fallback;
}

export const counters = {
  order: nextCounter(DB.orders, 'o', 1001),
  thread: nextCounter(DB.threads, 't', 1),
  med: nextCounter(DB.medicines, 'm', 12),
  addr: 2,
  review: nextCounter(DB.reviews, 'rv', 1),
  notif: nextCounter(DB.notifications, 'n', 1),
  ret: nextCounter(DB.returns, 'r', 1),
  admin: nextCounter(DB.admins, 'a', 2),
  staff: nextCounter(DB.staff, 's', 2),
  log: 1,
  audit: nextCounter(DB.auditLog, 'audit', 1),
  promo: nextCounter(DB.promotions, 'promo', 1),
  faq: nextCounter(DB.faqs, 'faq', 1),
};
