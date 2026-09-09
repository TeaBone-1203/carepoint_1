import React, { Suspense, lazy, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

/* ---- CarePoint theme ---- */
import './theme/variables.css';
import './theme/global.css';

/* ---- Context ---- */
import { AppProvider, useApp } from './context/AppContext';

/* ---- Pages (lazy-loaded for code splitting) ---- */
const HomePage     = lazy(() => import('./pages/HomePage'));
const CatalogPage  = lazy(() => import('./pages/CatalogPage'));
const MedicinePage = lazy(() => import('./pages/MedicinePage'));
const AuthPage     = lazy(() => import('./pages/AuthPage'));
const BranchPortal = lazy(() => import('./pages/BranchPortal'));
const AdminPortal  = lazy(() => import('./pages/AdminPortal'));
const CartPage     = lazy(() => import('./pages/customer/CartPage'));
const CheckoutPage = lazy(() => import('./pages/customer/CheckoutPage'));
const OrdersPage   = lazy(() => import('./pages/customer/OrdersPage'));
const WishlistPage = lazy(() => import('./pages/customer/WishlistPage'));
const MessagesPage = lazy(() => import('./pages/customer/MessagesPage'));
const ProfilePage  = lazy(() => import('./pages/customer/ProfilePage'));

const Spinner: React.FC = () => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '100vh', background: 'var(--cp-parchment)',
  }}>
    <div style={{
      width: 52, height: 52, fontSize: 26,
      borderRadius: '50% 14% 50% 50%',
      background: 'var(--cp-terracotta)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', animation: 'cp-spin 1.2s linear infinite',
    }}>🍃</div>
  </div>
);

// Route-level guard — blocks direct URL access to role-protected pages.
// Session is set only after login (Firebase- or demo/local) is resolved.
function RequireRole({ roles, children }: { roles: Array<'customer' | 'staff' | 'admin'>; children: ReactNode }) {
  const { state } = useApp();
  if (state.authLoading) return <Spinner />;
  const allowed =
    (roles.includes('admin')    && !!state.session.admin) ||
    (roles.includes('staff')    && !!state.session.staff) ||
    (roles.includes('customer') && !!state.session.customer);
  if (!allowed) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

const AppRoutes: React.FC = () => {
  const { state } = useApp();
  if (state.authLoading) return <Spinner />;
  return (
    <Routes>
      <Route path="/"             element={<HomePage />} />
      <Route path="/catalog"      element={<CatalogPage />} />
      <Route path="/medicine/:id" element={<MedicinePage />} />
      <Route path="/auth"         element={<AuthPage />} />
      <Route path="/cart"         element={<RequireRole roles={['customer']}><CartPage /></RequireRole>} />
      <Route path="/checkout"     element={<RequireRole roles={['customer']}><CheckoutPage /></RequireRole>} />
      <Route path="/orders"       element={<RequireRole roles={['customer']}><OrdersPage /></RequireRole>} />
      <Route path="/wishlist"     element={<RequireRole roles={['customer']}><WishlistPage /></RequireRole>} />
      <Route path="/messages"     element={<RequireRole roles={['customer']}><MessagesPage /></RequireRole>} />
      <Route path="/profile"      element={<RequireRole roles={['customer']}><ProfilePage /></RequireRole>} />
      <Route path="/branch"       element={<RequireRole roles={['staff']}><BranchPortal /></RequireRole>} />
      <Route path="/admin"        element={<RequireRole roles={['admin']}><AdminPortal /></RequireRole>} />
      <Route path="*"             element={<Navigate to="/" replace />} />
    </Routes>
  );
};

const App: React.FC = () => (
  <AppProvider>
    <BrowserRouter>
      <Suspense fallback={<Spinner />}>
        <AppRoutes />
      </Suspense>
    </BrowserRouter>
  </AppProvider>
);

export default App;
