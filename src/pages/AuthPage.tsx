// ============================================================
//  CarePoint — Auth page
//  Login · Customer register · Pharmacy/staff register
//  Includes demo quick-fill buttons matching the prototype
// ============================================================
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db as firestoreDb } from '../firebase';
import { DB } from '../data/db';
import { useApp } from '../context/AppContext';

type Mode = 'login' | 'register' | 'registerPharmacy';

function friendlyError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  if (code.includes('user-not-found') || code.includes('wrong-password') || code.includes('invalid-credential'))
    return 'Email or password is incorrect.';
  if (code.includes('email-already-in-use')) return 'An account with this email already exists.';
  if (code.includes('weak-password')) return 'Password must be at least 6 characters.';
  if (code.includes('invalid-email')) return "That doesn't look like a valid email address.";
  if (code.includes('too-many-requests')) return 'Too many attempts. Please wait a moment.';
  if (code.includes('network-request-failed')) return 'Network error. Check your connection.';
  return 'Something went wrong. Please try again.';
}

const AuthPage: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch, toast } = useApp();

  // Derive initial mode from context (e.g. landing page "List your pharmacy" sets registerPharmacy)
  const [mode, setMode] = useState<Mode>(
    state.authMode === 'registerPharmacy' ? 'registerPharmacy'
    : state.authMode === 'register'       ? 'register'
    : 'login',
  );

  // ── Login fields ─────────────────────────────────────────
  const [loginEmail, setLoginEmail]       = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // ── Customer register ────────────────────────────────────
  const [regName,     setRegName]     = useState('');
  const [regEmail,    setRegEmail]    = useState('');
  const [regPassword, setRegPassword] = useState('');

  // ── Pharmacy register ────────────────────────────────────
  const [phName,     setPhName]     = useState('');
  const [phEmail,    setPhEmail]    = useState('');
  const [phPassword, setPhPassword] = useState('');
  const [pharmName,  setPharmName]  = useState('');
  const [pharmLoc,   setPharmLoc]   = useState('');
  const [pharmHours, setPharmHours] = useState('');

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  // If already signed in, redirect
  if (!state.authLoading && state.firebaseUser) {
    const dest = state.activeRole === 'admin' ? '/admin'
               : state.activeRole === 'staff' ? '/branch'
               : '/';
    navigate(dest, { replace: true });
    return null;
  }

  // ── Local (demo) login — tries in-memory DB first ────────
  function localLogin(email: string, pass: string): boolean {
    const lc = email.toLowerCase();
    let user: { id: string; name: string; status?: string } | undefined;
    let role: 'customer' | 'staff' | 'admin' | null = null;

    user = DB.customers.find((u) => u.email.toLowerCase() === lc && u.password === pass);
    if (user) role = 'customer';
    if (!user) {
      user = DB.staff.find((u) => u.email.toLowerCase() === lc && u.password === pass);
      if (user) role = 'staff';
    }
    if (!user) {
      user = DB.admins.find((u) => u.email.toLowerCase() === lc && u.password === pass);
      if (user) role = 'admin';
    }
    if (!user || !role) return false;
    if (role === 'staff' && (user as any).status === 'pending') {
      setError('Your pharmacy is awaiting admin approval.'); return true;
    }
    if (role === 'staff' && (user as any).status === 'rejected') {
      setError('Registration was rejected. Contact support.'); return true;
    }
    if (role !== 'admin' && (user as any).status === 'disabled') {
      setError('Account disabled. Contact support.'); return true;
    }
    dispatch({ type: 'AUTH_RESOLVED', user: null, role, localId: user.id });
    toast(`Welcome, ${user.name.split(' ')[0]}!`, 'success');
    navigate(role === 'admin' ? '/admin' : role === 'staff' ? '/branch' : '/', { replace: true });
    return true;
  }

  // ── Login submit ─────────────────────────────────────────
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const email = loginEmail.trim();
    const pass  = loginPassword;
    if (!email || !pass) { setError('Enter email and password.'); return; }

    // Try local DB first (demo accounts work offline)
    if (localLogin(email, pass)) return;

    // Fall back to Firebase
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  // ── Password reset ────────────────────────────────────────
  async function handlePasswordReset() {
    setError('');
    const email = loginEmail.trim();
    if (!email) { setError('Enter your account email first, then tap "Forgot password?".'); return; }
    try {
      await sendPasswordResetEmail(auth, email);
      toast('Password reset email sent — check your inbox.', 'success');
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  // ── Customer register ────────────────────────────────────
  async function handleRegisterCustomer(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!regName.trim()) { setError('Enter your full name.'); return; }
    if (!regEmail.trim()) { setError('Enter your email.'); return; }
    if (!regPassword) { setError('Enter a password.'); return; }
    if (DB.customers.some((c) => c.email.toLowerCase() === regEmail.trim().toLowerCase())) {
      setError('Email already registered.'); return;
    }

    setLoading(true);
    // Create local record
    const id = `c${DB.customers.length + 1}_${Date.now()}`;
    DB.customers.push({
      id, name: regName.trim(), email: regEmail.trim(),
      password: regPassword, status: 'active', addresses: [], wishlist: [],
    });
    dispatch({ type: 'AUTH_RESOLVED', user: null, role: 'customer', localId: id });
    toast(`Welcome to CarePoint, ${regName.trim().split(' ')[0]}!`, 'success');
    navigate('/', { replace: true });
    setLoading(false);

    // Also try Firebase in background
    try {
      const cred = await createUserWithEmailAndPassword(auth, regEmail.trim(), regPassword);
      await updateProfile(cred.user, { displayName: regName.trim() });
      await setDoc(doc(firestoreDb, 'users', cred.user.uid), {
        displayName: regName.trim(), email: regEmail.trim(),
        role: 'customer', localId: id, createdAt: new Date().toISOString(),
      });
    } catch { /* offline is fine — local record exists */ }
  }

  // ── Pharmacy register ────────────────────────────────────
  function handleRegisterPharmacy(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!phName.trim() || !phEmail.trim() || !phPassword || !pharmName.trim() || !pharmLoc.trim() || !pharmHours.trim()) {
      setError('Fill in all fields.'); return;
    }
    if (DB.staff.some((s) => s.email.toLowerCase() === phEmail.trim().toLowerCase())) {
      setError('Email already registered.'); return;
    }
    const pid = `p_${Date.now()}`;
    const sid = `s_${Date.now()}`;
    DB.pharmacies.push({ id: pid, name: pharmName.trim(), location: pharmLoc.trim(), hours: pharmHours.trim(), status: 'pending' });
    DB.staff.push({ id: sid, name: phName.trim(), email: phEmail.trim(), password: phPassword, pharmacyId: pid, status: 'pending' });
    toast('Registration submitted! Awaiting admin approval.', 'success');
    setMode('login');
    setError('');
  }

  // ── Demo quick-fill ──────────────────────────────────────
  function fillLogin(role: 'customer' | 'staff' | 'admin') {
    const em = { customer: 'juan@example.com', staff: 'alyssa@wellnesscorner.ph', admin: 'admin@carepoint.ph' };
    const pw = { customer: 'demo123', staff: 'demo123', admin: 'admin123' };
    setLoginEmail(em[role]); setLoginPassword(pw[role]);
    toast(`⚡ Filled ${role} login.`, 'success');
  }
  function fillCustomerReg() {
    setRegName('Test Customer'); setRegEmail(`test${Date.now()}@example.com`); setRegPassword('demo123');
    toast('⚡ Registration fields filled.', 'success');
  }
  function fillPharmacyReg() {
    setPhName('Demo Pharmacist'); setPhEmail(`pharm${Date.now()}@test.ph`); setPhPassword('demo123');
    setPharmName('Demo Pharmacy'); setPharmLoc('123 Test St., Downtown'); setPharmHours('8:00 AM – 8:00 PM daily');
    toast('⚡ Pharmacy registration filled.', 'success');
  }

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="cp-page">
      <div style={{ overflowY: "auto" }}>
        {mode === 'registerPharmacy' ? (

          /* ── Pharmacy registration ── */
          <div className="cp-auth-pharmacy-wrap">
            <button className="cp-btn-link" style={{ marginBottom:12 }} onClick={() => navigate('/')}>
              ← Keep browsing without an account
            </button>
            <div className="cp-card">
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:6 }}>
                <div className="cp-brand-mark" style={{ width:40, height:40, fontSize:20 }}>🍃</div>
                <h2 style={{ fontFamily:'var(--cp-font-display)', fontSize:20, margin:0 }}>CarePoint</h2>
              </div>
              <p style={{ fontSize:13, color:'var(--cp-walnut-faint)', margin:'0 0 18px' }}>
                Tell us about your pharmacy to apply.
              </p>

              {error && (
                <div style={{ background:'var(--cp-danger-tint)', border:'1px solid var(--cp-danger)',
                  borderRadius:10, padding:'10px 14px', fontSize:13, color:'var(--cp-danger)', marginBottom:14 }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleRegisterPharmacy}>
                <div className="cp-field"><label>Your Name</label>
                  <input type="text" value={phName} onChange={(e) => setPhName(e.target.value)} placeholder="Full name" /></div>
                <div className="cp-field"><label>Email</label>
                  <input type="email" value={phEmail} onChange={(e) => setPhEmail(e.target.value)} placeholder="you@pharmacy.ph" /></div>
                <div className="cp-field"><label>Password</label>
                  <input type="password" value={phPassword} onChange={(e) => setPhPassword(e.target.value)} placeholder="Create a password" /></div>

                <div className="cp-divider" />

                <div className="cp-field"><label>Pharmacy Name</label>
                  <input type="text" value={pharmName} onChange={(e) => setPharmName(e.target.value)} placeholder="Your pharmacy's name" /></div>
                <div className="cp-field"><label>Location</label>
                  <input type="text" value={pharmLoc} onChange={(e) => setPharmLoc(e.target.value)} placeholder="Street, district" /></div>
                <div className="cp-field"><label>Operating Hours</label>
                  <input type="text" value={pharmHours} onChange={(e) => setPharmHours(e.target.value)} placeholder="e.g. 8:00 AM – 8:00 PM daily" /></div>

                <div className="cp-apo-note" style={{ marginBottom:14 }}>
                  New pharmacies are reviewed by an admin before they open.
                </div>

                <button type="submit" className="cp-btn cp-btn-primary cp-btn-block" disabled={loading}>
                  {loading ? 'Submitting…' : 'Submit Registration'}
                </button>

                <div className="cp-demo-strip">
                  <span className="cp-demo-label">⚡ Quick fill</span>
                  <button type="button" className="cp-btn-demo" onClick={fillPharmacyReg}>Fill demo data</button>
                </div>
              </form>

              <p className="cp-hint" style={{ textAlign:'center', marginTop:14 }}>
                <button className="cp-btn-link" onClick={() => setMode('register')}>← Back</button>
              </p>
            </div>
          </div>

        ) : (

          /* ── Login / Customer register ── */
          <div className="cp-auth-wrap">
            <p style={{ margin:'0 0 10px' }}>
              <button className="cp-btn-link" onClick={() => navigate('/')}>← Keep browsing without an account</button>
            </p>

            <div className="cp-card">
              {/* Logo */}
              <div className="cp-auth-logo">
                <div className="cp-brand-mark" style={{ width:52, height:52, fontSize:24, margin:'0 auto 10px', borderRadius:'50% 14% 50% 50%' }}>🍃</div>
                <h2>CarePoint</h2>
                <p>Log in or create an account.</p>
              </div>

              {/* Tabs */}
              <div className="cp-auth-tabs" style={{ marginBottom:18 }}>
                <button className={`cp-auth-tab${mode==='login' ? ' active' : ''}`}
                  onClick={() => { setMode('login'); setError(''); }}>Log In</button>
                <button className={`cp-auth-tab${mode==='register' ? ' active' : ''}`}
                  onClick={() => { setMode('register'); setError(''); }}>Register</button>
              </div>

              {/* Error */}
              {error && (
                <div style={{ background:'var(--cp-danger-tint)', border:'1px solid var(--cp-danger)',
                  borderRadius:10, padding:'10px 14px', fontSize:13, color:'var(--cp-danger)', marginBottom:14 }}>
                  {error}
                </div>
              )}

              {/* ── Login form ── */}
              {mode === 'login' && (
                <form onSubmit={handleLogin}>
                  <div className="cp-field"><label>Email</label>
                    <input id="loginEmail" type="email" value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="you@example.com" autoComplete="email" /></div>
                  <div className="cp-field"><label>Password</label>
                    <input id="loginPassword" type="password" value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••" autoComplete="current-password" /></div>
                  <button type="submit" className="cp-btn cp-btn-primary cp-btn-block" disabled={loading}>
                    {loading ? 'Logging in…' : 'Log In'}
                  </button>
                  <p className="cp-hint" style={{ textAlign:'center', marginTop:12 }}>
                    <button type="button" className="cp-btn-link" onClick={handlePasswordReset}>
                      Forgot password?
                    </button>
                  </p>
                  <div className="cp-demo-strip">
                    <span className="cp-demo-label">⚡ Quick fill</span>
                    <button type="button" className="cp-btn-demo"     onClick={() => fillLogin('customer')}>Customer</button>
                    <button type="button" className="cp-btn-demo-alt" onClick={() => fillLogin('staff')}>Staff</button>
                    <button type="button" className="cp-btn-demo"     onClick={() => fillLogin('admin')}>Admin</button>
                    <span style={{ fontSize:10, color:'var(--cp-walnut-faint)', marginLeft:4 }}>(demo)</span>
                  </div>
                  <p className="cp-hint" style={{ textAlign:'center', marginTop:12 }}>
                    Demo: juan@example.com / demo123
                  </p>
                </form>
              )}

              {/* ── Register form ── */}
              {mode === 'register' && (
                <form onSubmit={handleRegisterCustomer}>
                  <div className="cp-field"><label>Full Name</label>
                    <input type="text" value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="Juan Dela Cruz" autoComplete="name" /></div>
                  <div className="cp-field"><label>Email</label>
                    <input type="email" value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="you@example.com" autoComplete="email" /></div>
                  <div className="cp-field"><label>Password</label>
                    <input type="password" value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Create a password" autoComplete="new-password" /></div>
                  <button type="submit" className="cp-btn cp-btn-primary cp-btn-block" disabled={loading}>
                    {loading ? 'Creating…' : 'Create Account'}
                  </button>
                  <div className="cp-demo-strip">
                    <span className="cp-demo-label">⚡ Quick fill</span>
                    <button type="button" className="cp-btn-demo" onClick={fillCustomerReg}>Fill demo data</button>
                  </div>
                  <p className="cp-hint" style={{ textAlign:'center', marginTop:12 }}>
                    Own a pharmacy?{' '}
                    <button className="cp-btn-link" onClick={() => setMode('registerPharmacy')}>
                      Register it here
                    </button>.
                  </p>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthPage;
