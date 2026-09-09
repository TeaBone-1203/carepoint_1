// ============================================================
//  CarePoint — global app state + Firebase Auth integration
// ============================================================
import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db as firestoreDb } from '../firebase';
import { DB, counters } from '../data/db';
import {
  customer, staffMember, adminUser, pharmacy,
  notifyOrderEvent,
} from '../data/helpers';
import { supabaseEnabled, loadSnapshot, saveSnapshot } from '../data/persistence';
import type { UserRole } from '../data/types';

// ─── Cart ────────────────────────────────────────────────────
export interface CartItem { medId: string; qty: number; price: number; }
export interface Cart     { pharmacyId: string; items: CartItem[]; }

// ─── Per-staff UI state ──────────────────────────────────────
export interface StaffUIState {
  view:               string;
  orderId:            string | null;
  threadId:           string | null;
  orderFilter:        string;          // 'all' | 'toPrepare' | 'beingMade' | 'completed' | 'cancelled'
  productFilter:      string;          // 'all' | 'active' | 'inactive' | 'out' | 'rx'
  editMedId:          string | null;   // 'new' | medId | null
  productDraftImages: string[];
  returnFilter:       string;
  salesRange:         number;          // days: 7 | 30 | 365
  notifCompose:       { target: string };
}

// ─── Per-admin UI state ──────────────────────────────────────
export interface AdminUIState {
  view:            string;
  editCustomerId:  string | null;
  editAdminId:     string | null;
  addingAdmin:     boolean;
}

// ─── Per-customer UI state ───────────────────────────────────
export interface CustomerUIState {
  view:     string;
  medId:    string | null;
  orderId:  string | null;
  threadId: string | null;
}

// ─── Lightbox ────────────────────────────────────────────────
export interface LightboxState { src: string; zoomed: boolean; }

// ─── Full app state ──────────────────────────────────────────
export interface AppState {
  // Firebase
  firebaseUser: User | null;
  authLoading:  boolean;

  // Supabase persistence
  dbConnected:  boolean;

  // Role
  activeRole: UserRole;
  session:    { customer: string | null; staff: string | null; admin: string | null };

  // Per-role sub-navigation
  customer: CustomerUIState;
  staff:    StaffUIState;
  admin:    AdminUIState;

  // Public navigation
  publicView:  'landing' | 'catalog' | 'medicine' | 'auth';
  publicMedId: string | null;
  authMode:    'login' | 'register' | 'registerPharmacy';

  // Cart
  carts:   Record<string, Cart>;

  // Checkout
  checkout: {
    fulfillment:   'pickup' | 'delivery';
    addressId:     string | null;
    paymentMethod: string;
    processing:    boolean;
  };

  // Search / filter
  search: {
    query:    string;
    category: string;
    pharmacy: string;
    sort:     string;
    priceMin: string;
    priceMax: string;
  };

  // UI overlays
  notifPanelOpen: boolean;
  lightbox:       LightboxState | null;
  pendingImage:   { dataUrl: string; name: string } | null;
  gallery:        { index: number; playing: boolean };

  // Review drafts — keyed by "medId|orderId"
  reviewDraft: Record<string, { rating: number }>;
}

// ─── Initial values ──────────────────────────────────────────
const initialStaff: StaffUIState = {
  view: 'orders', orderId: null, threadId: null,
  orderFilter: 'all', productFilter: 'all', editMedId: null,
  productDraftImages: [], returnFilter: 'all', salesRange: 30,
  notifCompose: { target: 'all' },
};

const initialAdmin: AdminUIState = {
  view: 'approvals', editCustomerId: null, editAdminId: null, addingAdmin: false,
};

const initialCustomer: CustomerUIState = {
  view: 'home', medId: null, orderId: null, threadId: null,
};

const initialState: AppState = {
  firebaseUser: null,
  authLoading:  true,
  dbConnected:  false,
  activeRole:   null,
  session:      { customer: null, staff: null, admin: null },
  customer:     { ...initialCustomer },
  staff:        { ...initialStaff },
  admin:        { ...initialAdmin },
  publicView:   'landing',
  publicMedId:  null,
  authMode:     'login',
  carts:        {},
  checkout: { fulfillment: 'pickup', addressId: null, paymentMethod: 'card', processing: false },
  search:   { query: '', category: 'All', pharmacy: 'All', sort: 'newest', priceMin: '', priceMax: '' },
  notifPanelOpen: false,
  lightbox:       null,
  pendingImage:   null,
  gallery:        { index: 0, playing: false },
  reviewDraft:    {},
};

// ─── Actions ─────────────────────────────────────────────────
type Action =
  // Auth
  | { type: 'AUTH_RESOLVED'; user: User | null; role: UserRole; localId: string | null }
  | { type: 'LOGOUT' }
  // Persistence status
  | { type: 'SET_DB_STATUS'; connected: boolean }
  // Navigation
  | { type: 'SET_CUSTOMER_VIEW'; view: string }
  | { type: 'SET_STAFF_VIEW';    view: string }
  | { type: 'SET_ADMIN_VIEW';    view: string }
  | { type: 'SET_PUBLIC_VIEW';   view: AppState['publicView'] }
  | { type: 'SET_AUTH_MODE';     mode: AppState['authMode'] }
  | { type: 'SET_PUBLIC_MED';    medId: string | null }
  | { type: 'SET_CUSTOMER';      payload: Partial<CustomerUIState> }
  | { type: 'SET_STAFF';         payload: Partial<StaffUIState> }
  | { type: 'SET_ADMIN';         payload: Partial<AdminUIState> }
  // Search
  | { type: 'SET_SEARCH';        payload: Partial<AppState['search']> }
  // Cart
  | { type: 'ADD_TO_CART';       cartKey: string; medId: string; pharmacyId: string; price: number }
  | { type: 'REMOVE_FROM_CART';  cartKey: string; medId: string }
  | { type: 'UPDATE_CART_QTY';   cartKey: string; medId: string; qty: number }
  | { type: 'CLEAR_CART';        cartKey: string }
  | { type: 'REPLACE_CARTS';     carts: Record<string, Cart> }
  // Checkout
  | { type: 'SET_CHECKOUT';      payload: Partial<AppState['checkout']> }
  // Overlays
  | { type: 'TOGGLE_NOTIF_PANEL' }
  | { type: 'CLOSE_NOTIF_PANEL' }
  | { type: 'SET_LIGHTBOX';      lightbox: LightboxState | null }
  | { type: 'TOGGLE_LIGHTBOX_ZOOM' }
  | { type: 'SET_PENDING_IMAGE'; image: AppState['pendingImage'] }
  | { type: 'SET_GALLERY';       payload: Partial<AppState['gallery']> }
  // Reviews
  | { type: 'SET_REVIEW_RATING'; key: string; rating: number }
  | { type: 'CLEAR_REVIEW_DRAFT'; key: string };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {

    case 'AUTH_RESOLVED': {
      const { user, role, localId } = action;
      const session = { ...initialState.session };
      if (role && localId) session[role] = localId;
      // Route to right default view after login
      let staffView = state.staff.view;
      let adminView = state.admin.view;
      if (role === 'staff')  staffView = 'orders';
      if (role === 'admin')  adminView = 'approvals';
      return {
        ...state,
        firebaseUser: user,
        authLoading:  false,
        activeRole:   role,
        session,
        staff: { ...state.staff, view: staffView },
        admin: { ...state.admin, view: adminView },
      };
    }

    case 'LOGOUT':
      return { ...initialState, authLoading: false, firebaseUser: null, activeRole: null, dbConnected: state.dbConnected };

    case 'SET_DB_STATUS':
      return { ...state, dbConnected: action.connected };

    case 'SET_CUSTOMER_VIEW': return { ...state, customer: { ...state.customer, view: action.view } };
    case 'SET_STAFF_VIEW':    return { ...state, staff:    { ...state.staff,    view: action.view } };
    case 'SET_ADMIN_VIEW':    return { ...state, admin:    { ...state.admin,    view: action.view } };
    case 'SET_PUBLIC_VIEW':   return { ...state, publicView: action.view };
    case 'SET_AUTH_MODE':     return { ...state, authMode: action.mode, publicView: 'auth' };
    case 'SET_PUBLIC_MED':    return { ...state, publicMedId: action.medId, publicView: action.medId ? 'medicine' : state.publicView };
    case 'SET_CUSTOMER':      return { ...state, customer: { ...state.customer, ...action.payload } };
    case 'SET_STAFF':         return { ...state, staff:    { ...state.staff,    ...action.payload } };
    case 'SET_ADMIN':         return { ...state, admin:    { ...state.admin,    ...action.payload } };
    case 'SET_SEARCH':        return { ...state, search:   { ...state.search,   ...action.payload } };
    case 'SET_CHECKOUT':      return { ...state, checkout: { ...state.checkout, ...action.payload } };

    case 'ADD_TO_CART': {
      const existing = state.carts[action.cartKey] ?? { pharmacyId: action.pharmacyId, items: [] };
      // Different pharmacy → start fresh
      const base = existing.pharmacyId === action.pharmacyId ? existing : { pharmacyId: action.pharmacyId, items: [] };
      const idx = base.items.findIndex((i) => i.medId === action.medId);
      const items = idx >= 0
        ? base.items.map((i, n) => n === idx ? { ...i, qty: i.qty + 1 } : i)
        : [...base.items, { medId: action.medId, qty: 1, price: action.price }];
      return { ...state, carts: { ...state.carts, [action.cartKey]: { pharmacyId: action.pharmacyId, items } } };
    }

    case 'REMOVE_FROM_CART': {
      const cart = state.carts[action.cartKey];
      if (!cart) return state;
      const items = cart.items.filter((i) => i.medId !== action.medId);
      return { ...state, carts: { ...state.carts, [action.cartKey]: { ...cart, items } } };
    }

    case 'UPDATE_CART_QTY': {
      const cart = state.carts[action.cartKey];
      if (!cart) return state;
      const items = action.qty <= 0
        ? cart.items.filter((i) => i.medId !== action.medId)
        : cart.items.map((i) => i.medId === action.medId ? { ...i, qty: action.qty } : i);
      return { ...state, carts: { ...state.carts, [action.cartKey]: { ...cart, items } } };
    }

    case 'CLEAR_CART': {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [action.cartKey]: _removed, ...rest } = state.carts;
      return { ...state, carts: rest };
    }

    case 'REPLACE_CARTS':
      return { ...state, carts: action.carts };

    case 'TOGGLE_NOTIF_PANEL':
      return { ...state, notifPanelOpen: !state.notifPanelOpen };
    case 'CLOSE_NOTIF_PANEL':
      return { ...state, notifPanelOpen: false };

    case 'SET_LIGHTBOX':
      return { ...state, lightbox: action.lightbox };
    case 'TOGGLE_LIGHTBOX_ZOOM':
      return state.lightbox
        ? { ...state, lightbox: { ...state.lightbox, zoomed: !state.lightbox.zoomed } }
        : state;

    case 'SET_PENDING_IMAGE':
      return { ...state, pendingImage: action.image };
    case 'SET_GALLERY':
      return { ...state, gallery: { ...state.gallery, ...action.payload } };

    case 'SET_REVIEW_RATING':
      return { ...state, reviewDraft: { ...state.reviewDraft, [action.key]: { rating: action.rating } } };
    case 'CLEAR_REVIEW_DRAFT': {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [action.key]: _r, ...rest } = state.reviewDraft;
      return { ...state, reviewDraft: rest };
    }

    default:
      return state;
  }
}

// ─── Role resolution ─────────────────────────────────────────
async function resolveRole(user: User): Promise<{ role: NonNullable<UserRole>; localId: string }> {
  // 1 — Firestore
  try {
    const snap = await getDoc(doc(firestoreDb, 'users', user.uid));
    if (snap.exists()) {
      const data = snap.data() as { role?: string; localId?: string };
      const role = data.role as NonNullable<UserRole>;
      if (role && data.localId) return { role, localId: data.localId };
    }
  } catch { /* offline / rules block */ }

  // 2 — Local DB email match
  const email = user.email ?? '';
  const staffMatch = DB.staff.find((s) => s.email === email && s.status === 'active');
  if (staffMatch) return { role: 'staff', localId: staffMatch.id };
  const adminMatch = DB.admins.find((a) => a.email === email);
  if (adminMatch) return { role: 'admin', localId: adminMatch.id };
  const custMatch = DB.customers.find((c) => c.email === email);
  if (custMatch) return { role: 'customer', localId: custMatch.id };

  // 3 — New customer
  return { role: 'customer', localId: user.uid };
}

// ─── Context value ───────────────────────────────────────────
interface AppContextValue {
  state:           AppState;
  dispatch:        React.Dispatch<Action>;
  // Derived current-user shortcuts
  currentCustomer:  ReturnType<typeof customer>    | undefined;
  currentStaff:     ReturnType<typeof staffMember> | undefined;
  currentAdmin:     ReturnType<typeof adminUser>   | undefined;
  currentPharmacy:  ReturnType<typeof pharmacy>    | undefined;
  cartKey:   string | null;
  cartCount: number;
  // Actions
  logout:     () => Promise<void>;
  addToCart:  (medId: string, price: number, pharmacyId: string) => void;
  placeOrder: () => void;
  toast:      (msg: string, type?: 'success' | 'error') => void;
}

const AppContext = createContext<AppContextValue | null>(null);

// ─── Toast (global singleton, outside React tree) ────────────
function showToast(msg: string, type?: 'success' | 'error') {
  let container = document.getElementById('cp-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'cp-toast-container';
    container.className = 'cp-toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = 'cp-toast' + (type ? ` ${type}` : '');
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ─── Provider ────────────────────────────────────────────────
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Firebase auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const { role, localId } = await resolveRole(user);
        dispatch({ type: 'AUTH_RESOLVED', user, role, localId });
      } else {
        dispatch({ type: 'AUTH_RESOLVED', user: null, role: null, localId: null });
      }
    });
    return unsub;
  }, []);

  // Supabase persistence — load on boot, seed server when empty, auto-save
  useEffect(() => {
    if (!supabaseEnabled) return;
    let cancelled = false;
    void (async () => {
      const loaded = await loadSnapshot();
      if (cancelled) return;
      dispatch({ type: 'SET_DB_STATUS', connected: true });
      if (!loaded) await saveSnapshot();   // prime the server from seed data
    })();
    const t = window.setInterval(() => { void saveSnapshot(); }, 15000);
    const onVisible = () => { if (document.visibilityState === 'visible') void saveSnapshot(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Derived
  const custId  = state.session.customer ?? undefined;
  const staffId = state.session.staff    ?? undefined;
  const adminId = state.session.admin    ?? undefined;

  const currentCustomerVal = custId  ? customer(custId)     : undefined;
  const currentStaffVal    = staffId ? staffMember(staffId) : undefined;
  const currentAdminVal    = adminId ? adminUser(adminId)   : undefined;
  const currentPharmacyVal = currentStaffVal ? pharmacy(currentStaffVal.pharmacyId) : undefined;

  const cartKey = state.firebaseUser?.uid ?? custId ?? null;
  const cartCount = cartKey
    ? (state.carts[cartKey]?.items.reduce((s, i) => s + i.qty, 0) ?? 0)
    : 0;

  const logout = useCallback(async () => {
    await firebaseSignOut(auth);
    dispatch({ type: 'LOGOUT' });
  }, []);

  const addToCart = useCallback(
    (medId: string, price: number, pharmacyId: string) => {
      if (!cartKey) return;
      dispatch({ type: 'ADD_TO_CART', cartKey, medId, pharmacyId, price });
    },
    [cartKey],
  );

  // placeOrder — mirrors the prototype's finalizeOrder logic
  const placeOrder = useCallback(() => {
    if (state.checkout.processing) return;
    if (!cartKey) return;
    const cart = state.carts[cartKey];
    if (!cart || !cart.items.length) { showToast('Satchel is empty.', 'error'); return; }
    if (state.checkout.fulfillment === 'delivery' && !state.checkout.addressId) {
      showToast('Select a delivery address.', 'error'); return;
    }

    dispatch({ type: 'SET_CHECKOUT', payload: { processing: true } });

    setTimeout(() => {
      const id = 'o' + counters.order++;
      const items = cart.items.map((it) => ({ medId: it.medId, qty: it.qty, price: it.price }));
      items.forEach((it) => {
        const med = DB.medicines.find((m) => m.id === it.medId);
        if (med) { med.stock = Math.max(0, med.stock - it.qty); med.sold = (med.sold || 0) + it.qty; }
      });
      DB.orders.push({
        id, customerId: custId!, pharmacyId: cart.pharmacyId, items,
        fulfillment: state.checkout.fulfillment,
        addressId:   state.checkout.addressId,
        status:      'pending',
        createdAt:   new Date(),
        paymentMethod: state.checkout.paymentMethod,
        paymentLabel:  state.checkout.paymentMethod === 'cod' ? 'Cash on Delivery' : undefined,
      });
      notifyOrderEvent({ id, pharmacyId: cart.pharmacyId, customerId: custId!, status: 'pending' }, 'orderPlaced');
      dispatch({ type: 'CLEAR_CART', cartKey });
      dispatch({ type: 'SET_CHECKOUT', payload: { processing: false, addressId: null } });
      dispatch({ type: 'SET_CUSTOMER', payload: { view: 'orders' } });
      void saveSnapshot();
      showToast(`Order #${id.replace('o', '')} placed!`, 'success');
    }, 1100);
  }, [state, cartKey, custId]);

  const value: AppContextValue = {
    state, dispatch,
    currentCustomer:  currentCustomerVal,
    currentStaff:     currentStaffVal,
    currentAdmin:     currentAdminVal,
    currentPharmacy:  currentPharmacyVal,
    cartKey, cartCount,
    logout, addToCart, placeOrder,
    toast: showToast,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
