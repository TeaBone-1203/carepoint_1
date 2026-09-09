// ============================================================
//  CarePoint — shared TypeScript types
// ============================================================

export type PharmacyStatus = 'approved' | 'pending' | 'suspended' | 'rejected';

export interface Pharmacy {
  id: string;
  name: string;
  location: string;
  hours: string;
  status: PharmacyStatus;
}

export type MedicineCategory =
  | 'Pain Relief'
  | 'Cold & Flu'
  | 'Allergy'
  | 'Vitamins'
  | 'First Aid'
  | 'Digestive'
  | 'Skin Care'
  | 'Prescription';

export interface Medicine {
  id: string;
  pharmacyId: string;
  name: string;
  category: MedicineCategory | string;
  price: number;
  stock: number;
  prescription: boolean;
  sold: number;
  addedAt: number;
  description?: string;
  specs?: Record<string, string>;
  images?: string[];
  status?: 'active' | 'inactive';
  lowStockThreshold?: number;
}

export interface Address {
  id: string;
  label: string;
  text: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  password: string;
  status: 'active' | 'inactive';
  addresses: Address[];
  wishlist: string[];
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  password: string;
  pharmacyId: string;
  status: 'active' | 'pending' | 'inactive' | 'rejected' | 'disabled';
}

export interface Admin {
  id: string;
  name: string;
  email: string;
  password: string;
}

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'ready'
  | 'completed'
  | 'cancelled';

export interface OrderItem {
  medId: string;
  qty: number;
  price: number;
}

export interface Order {
  id: string;
  customerId: string;
  pharmacyId: string;
  items: OrderItem[];
  fulfillment: 'pickup' | 'delivery';
  addressId: string | null;
  status: OrderStatus;
  createdAt: Date;
  paymentMethod?: string;
  paymentLabel?: string;
  prescriptionPhoto?: string;
}

export interface MessageThread {
  id: string;
  customerId: string;
  pharmacyId: string;
  type: 'prescription' | 'order';
  subject: string;
  status: 'open' | 'resolved';
  orderId?: string;
  medId?: string;
  unreadForCustomer: boolean;
  unreadForStaff: boolean;
  messages: ThreadMessage[];
}

export interface ThreadMessage {
  from: 'customer' | 'staff';
  text: string;
  image?: string;
  at: Date;
}

export interface Flag {
  id: string;
  status: 'open' | 'resolved';
  type: string;
  note: string;
  at: Date;
}

export interface Review {
  id: string;
  medId: string;
  customerId: string;
  orderId: string;
  rating: number;
  at: Date;
}

export interface Notification {
  id: string;
  customerId: string;
  type: string;
  text: string;
  read: boolean;
  at: Date;
}

export interface ReturnRequest {
  id: string;
  orderId: string;
  pharmacyId: string;
  customerId: string;
  status: 'requested' | 'approved' | 'refunded' | 'rejected';
  reason: string;
  refundAmount?: number;
  source?: 'customer' | 'staff';
  at: Date;
}

export interface PlatformSettings {
  platformName: string;
  supportEmail: string;
  currency: string;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  deliveryFee: number;
  freeDeliveryOver: number;
  payments: Record<string, boolean>;
  lowStockThreshold: number;
  returnWindowDays: number;
}

export interface NotifTemplate {
  enabled: boolean;
  text: string;
}

// ---------- Phase 4: CMS (Content Management) ----------
export interface StaticPage {
  title: string;
  body: string;
}

export interface Faq {
  id: string;
  q: string;
  a: string;
}

export interface Promotion {
  id: string;
  title: string;
  text: string;
  active: boolean;
}

export interface HomepageBanner {
  headline: string;
  subtext: string;
  ctaLabel: string;
  active: boolean;
}

export interface AuditEntry {
  id: string;
  at: Date;
  actor: string;
  action: string;
}

// Active user role
export type UserRole = 'customer' | 'staff' | 'admin' | null;
