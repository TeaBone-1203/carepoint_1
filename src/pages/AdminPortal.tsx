// ============================================================
//  CarePoint — Admin Portal
//  Tabs: Registry · Accounts · Herbal Index · All Orders · Flags · Tally · Settings
// ============================================================
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DB, counters } from '../data/db';
import {
  medicine, pharmacy, customer, staffMember, adminUser,
  orderTotal, fmtDate, money, STATUS_LABEL,
  customerName, pharmacyName, CURRENCIES, logAudit,
} from '../data/helpers';
import { useApp } from '../context/AppContext';

// ── Registry (pending pharmacy approvals) ────────────────────
function Registry({ actor, dispatch, toast }: { actor: string; dispatch: any; toast: any }) {
  const pending = DB.staff.filter(s => s.status === 'pending');

  function approve(staffId: string) {
    const s = staffMember(staffId);
    if (!s) return;
    if (!window.confirm('Approve this pharmacy?')) return;
    s.status = 'active';
    const ph = pharmacy(s.pharmacyId);
    if (ph) ph.status = 'approved';
    logAudit(actor, 'Approved pharmacy ' + (ph ? ph.name : s.name));
    toast((ph ? ph.name : 'Pharmacy') + ' approved and now live!', 'success');
    dispatch({ type: 'SET_SEARCH', payload: {} });
  }

  function reject(staffId: string) {
    const s = staffMember(staffId);
    if (!s) return;
    if (!window.confirm('Reject this registration?')) return;
    s.status = 'rejected';
    const ph = pharmacy(s.pharmacyId);
    if (ph) ph.status = 'rejected' as any;
    logAudit(actor, 'Rejected pharmacy ' + (ph ? ph.name : s.name));
    toast('Registration rejected.', 'success');
    dispatch({ type: 'SET_SEARCH', payload: {} });
  }

  if (pending.length === 0) {
    return (
      <div>
        <h2 style={{ fontFamily: 'var(--cp-font-display)', fontSize: 24, margin: '0 0 20px' }}>Registry</h2>
        <div className="cp-empty">
          <div className="cp-empty-icon">✅</div>
          <div className="cp-empty-title">All caught up</div>
          <div className="cp-empty-sub">No pending registrations.</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ fontFamily: 'var(--cp-font-display)', fontSize: 24, margin: '0 0 4px' }}>Registry</h2>
      <p style={{ fontSize: 13, color: 'var(--cp-walnut-faint)', margin: '0 0 16px' }}>New pharmacies waiting for approval.</p>
      <div className="cp-card">
        {pending.map(s => {
          const ph = pharmacy(s.pharmacyId);
          return (
            <div key={s.id} className="cp-row-between" style={{ padding: '15px 0', borderBottom: '1px solid var(--cp-stone)' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--cp-terracotta)', marginTop: 2, fontSize: 20 }}>🏥</span>
                <div>
                  <strong style={{ fontFamily: 'var(--cp-font-display)', fontSize: 15 }}>{ph ? ph.name : 'Unknown'}</strong><br />
                  <span className="cp-hint">{ph ? `${ph.location} · ${ph.hours}` : ''}</span><br />
                  <span className="cp-hint">Registered by {s.name} ({s.email})</span>
                  <span className="cp-badge cp-badge-pending" style={{ marginLeft: 8 }}>pending</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="cp-btn cp-btn-sage cp-btn-sm" onClick={() => approve(s.id)}>Approve</button>
                <button className="cp-btn cp-btn-danger cp-btn-sm" onClick={() => reject(s.id)}>Reject</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Accounts ─────────────────────────────────────────────────
function Accounts({ adminId, actor, dispatch, toast }: { adminId: string; actor: string; dispatch: any; toast: any }) {
  const [editCustId, setEditCustId] = useState<string | null>(null);
  const [editAdminId, setEditAdminId] = useState<string | null>(null);
  const [addingAdmin, setAddingAdmin] = useState(false);

  function toggleAccount(type: string, id: string) {
    const rec = type === 'customer' ? customer(id) : staffMember(id);
    if (!rec) return;
    if (type === 'staff' && rec.status === 'pending') { toast('Cannot toggle pending — approve or reject first.', 'error'); return; }
    rec.status = rec.status === 'active' ? 'disabled' as any : 'active';
    if (type === 'staff') { const ph = pharmacy((rec as any).pharmacyId); if (ph) ph.status = rec.status === 'active' ? 'approved' : 'rejected' as any; }
    logAudit(actor, (rec.status === 'active' ? 'Enabled ' : 'Disabled ') + (type === 'customer' ? 'customer' : 'pharmacy') + ' account ' + rec.name);
    toast('Account ' + (rec.status === 'active' ? 'activated' : 'disabled') + '.', 'success');
    dispatch({ type: 'SET_SEARCH', payload: {} });
  }

  function removeAccount(type: string, id: string) {
    if (!window.confirm('Permanently remove this account?')) return;
    let removedName = '';
    if (type === 'customer') {
      const c = customer(id); if (c) removedName = c.name;
      DB.customers = DB.customers.filter(c => c.id !== id);
      DB.orders = DB.orders.filter(o => o.customerId !== id);
    } else {
      const s = staffMember(id);
      if (s) {
        const ph = pharmacy(s.pharmacyId);
        if (ph) { removedName = ph.name; DB.pharmacies = DB.pharmacies.filter(p => p.id !== ph.id); DB.medicines = DB.medicines.filter(m => m.pharmacyId !== ph.id); }
        DB.staff = DB.staff.filter(x => x.id !== id);
      }
    }
    logAudit(actor, 'Removed ' + (type === 'customer' ? 'customer' : 'pharmacy') + ' account ' + removedName);
    toast('Account removed.', 'success');
    dispatch({ type: 'SET_SEARCH', payload: {} });
  }

  function saveCustomer(id: string) {
    const c = customer(id); if (!c) return;
    const n = (document.getElementById('admCustName') as HTMLInputElement)?.value?.trim();
    const e = (document.getElementById('admCustEmail') as HTMLInputElement)?.value?.trim();
    const s = (document.getElementById('admCustStatus') as HTMLSelectElement)?.value;
    if (!n || !e) { toast('Name and email required.', 'error'); return; }
    c.name = n; c.email = e; c.status = s as any;
    logAudit(actor, 'Updated customer account ' + n);
    toast('Customer updated.', 'success'); setEditCustId(null); dispatch({ type: 'SET_SEARCH', payload: {} });
  }

  function addAdmin() {
    const n = (document.getElementById('newAdminName') as HTMLInputElement)?.value?.trim();
    const e = (document.getElementById('newAdminEmail') as HTMLInputElement)?.value?.trim();
    const p = (document.getElementById('newAdminPass') as HTMLInputElement)?.value?.trim();
    if (!n || !e || !p) { toast('Fill in all fields.', 'error'); return; }
    DB.admins.push({ id: 'a' + counters.admin++, name: n, email: e, password: p });
    logAudit(actor, 'Added site administrator ' + n);
    setAddingAdmin(false); toast('Admin created.', 'success'); dispatch({ type: 'SET_SEARCH', payload: {} });
  }

  function saveAdmin(id: string) {
    const a = adminUser(id); if (!a) return;
    const n = (document.getElementById('admName') as HTMLInputElement)?.value?.trim();
    const e = (document.getElementById('admEmail') as HTMLInputElement)?.value?.trim();
    const p = (document.getElementById('admPass') as HTMLInputElement)?.value?.trim();
    if (!n || !e) return;
    a.name = n; a.email = e; if (p) (a as any).password = p;
    logAudit(actor, 'Updated site administrator ' + n);
    toast('Admin updated.', 'success'); setEditAdminId(null); dispatch({ type: 'SET_SEARCH', payload: {} });
  }

  function removeAdmin(id: string) {
    if (id === adminId) { toast('You cannot delete your own account.', 'error'); return; }
    if (DB.admins.length <= 1) { toast('At least one admin account must exist.', 'error'); return; }
    if (!window.confirm('Remove this admin?')) return;
    const a = adminUser(id);
    DB.admins = DB.admins.filter(a => a.id !== id);
    logAudit(actor, 'Deleted site administrator ' + (a ? a.name : id));
    toast('Admin removed.', 'success'); dispatch({ type: 'SET_SEARCH', payload: {} });
  }

  return (
    <div>
      <h2 style={{ fontFamily: 'var(--cp-font-display)', fontSize: 24, margin: '0 0 20px' }}>Accounts</h2>

      {/* Customers */}
      <div className="cp-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Customers</h3>
        <div className="cp-table-wrap">
          <table className="cp-table">
            <thead><tr><th>Name</th><th>Email</th><th className="text-right">Orders</th><th className="text-center">Status</th><th className="col-actions"></th></tr></thead>
            <tbody>
              {DB.customers.map(c => {
                const orders = DB.orders.filter(o => o.customerId === c.id).length;
                if (editCustId === c.id) {
                  return (
                    <tr key={c.id}><td colSpan={5}>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div className="cp-field" style={{ flex: 1, minWidth: 140, marginBottom: 0 }}><label>Name</label><input id="admCustName" type="text" defaultValue={c.name} /></div>
                        <div className="cp-field" style={{ flex: 1, minWidth: 170, marginBottom: 0 }}><label>Email</label><input id="admCustEmail" type="email" defaultValue={c.email} /></div>
                        <div className="cp-field" style={{ minWidth: 130, marginBottom: 0 }}><label>Status</label>
                          <select id="admCustStatus" defaultValue={c.status}><option value="active">Active</option><option value="disabled">Suspended</option></select>
                        </div>
                        <button className="cp-btn cp-btn-primary cp-btn-sm" onClick={() => saveCustomer(c.id)}>Save</button>
                        <button className="cp-btn cp-btn-outline cp-btn-sm" onClick={() => setEditCustId(null)}>Cancel</button>
                      </div>
                    </td></tr>
                  );
                }
                return (
                  <tr key={c.id}>
                    <td>{c.name}</td><td>{c.email}</td>
                    <td className="text-right">{orders}</td>
                    <td className="text-center"><span className={`cp-badge cp-badge-${c.status === 'active' ? 'active' : 'inactive'}`}>{c.status === 'active' ? 'active' : 'suspended'}</span></td>
                    <td className="col-actions" style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button className="cp-btn cp-btn-outline cp-btn-sm" onClick={() => setEditCustId(c.id)}>Edit</button>
                      <button className="cp-btn cp-btn-outline cp-btn-sm" onClick={() => toggleAccount('customer', c.id)}>{c.status === 'active' ? 'Suspend' : 'Reinstate'}</button>
                      <button className="cp-btn cp-btn-danger cp-btn-sm" onClick={() => removeAccount('customer', c.id)}>Remove</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Administrators */}
      <div className="cp-card" style={{ marginBottom: 16 }}>
        <div className="cp-row-between" style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>➕ Administrators</h3>
          <button className="cp-btn cp-btn-primary cp-btn-sm" onClick={() => setAddingAdmin(true)}>Add admin</button>
        </div>
        {addingAdmin && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
            <div className="cp-field" style={{ flex: 1, minWidth: 140, marginBottom: 0 }}><label>Name</label><input id="newAdminName" type="text" placeholder="Full name" /></div>
            <div className="cp-field" style={{ flex: 1, minWidth: 170, marginBottom: 0 }}><label>Email</label><input id="newAdminEmail" type="email" placeholder="admin@carepoint.ph" /></div>
            <div className="cp-field" style={{ flex: 1, minWidth: 130, marginBottom: 0 }}><label>Password</label><input id="newAdminPass" type="text" placeholder="Temporary" /></div>
            <button className="cp-btn cp-btn-primary cp-btn-sm" onClick={addAdmin}>Create</button>
            <button className="cp-btn cp-btn-outline cp-btn-sm" onClick={() => setAddingAdmin(false)}>Cancel</button>
          </div>
        )}
        <div className="cp-table-wrap">
          <table className="cp-table">
            <thead><tr><th>Name</th><th>Email</th><th className="text-center">Role</th><th className="col-actions"></th></tr></thead>
            <tbody>
              {DB.admins.map(a => {
                if (editAdminId === a.id) {
                  return (
                    <tr key={a.id}><td colSpan={4}>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div className="cp-field" style={{ flex: 1, minWidth: 140, marginBottom: 0 }}><label>Name</label><input id="admName" type="text" defaultValue={a.name} /></div>
                        <div className="cp-field" style={{ flex: 1, minWidth: 170, marginBottom: 0 }}><label>Email</label><input id="admEmail" type="email" defaultValue={a.email} /></div>
                        <div className="cp-field" style={{ flex: 1, minWidth: 130, marginBottom: 0 }}><label>Password</label><input id="admPass" type="text" defaultValue={(a as any).password ?? ''} /></div>
                        <button className="cp-btn cp-btn-primary cp-btn-sm" onClick={() => saveAdmin(a.id)}>Save</button>
                        <button className="cp-btn cp-btn-outline cp-btn-sm" onClick={() => setEditAdminId(null)}>Cancel</button>
                      </div>
                    </td></tr>
                  );
                }
                return (
                  <tr key={a.id}>
                    <td>{a.name}{a.id === adminId ? <span className="cp-hint" style={{ marginLeft: 6 }}>(you)</span> : ''}</td>
                    <td>{a.email}</td>
                    <td className="text-center"><span className="cp-badge cp-badge-approved">Administrator</span></td>
                    <td className="col-actions" style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button className="cp-btn cp-btn-outline cp-btn-sm" onClick={() => setEditAdminId(a.id)}>Edit</button>
                      <button className="cp-btn cp-btn-danger cp-btn-sm" disabled={a.id === adminId} onClick={() => removeAdmin(a.id)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Staff & Pharmacies */}
      <div className="cp-card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Staff &amp; Pharmacies</h3>
        <div className="cp-table-wrap">
          <table className="cp-table">
            <thead><tr><th>Staff</th><th>Pharmacy</th><th className="text-center">Staff status</th><th className="text-center">Pharmacy status</th><th className="col-actions"></th></tr></thead>
            <tbody>
              {DB.staff.map(s => {
                const ph = pharmacy(s.pharmacyId);
                return (
                  <tr key={s.id}>
                    <td>{s.name}<br /><span className="cp-hint">{s.email}</span></td>
                    <td>{ph ? ph.name : <span className="cp-hint">(orphaned)</span>}</td>
                    <td className="text-center"><span className={`cp-badge cp-badge-${s.status === 'active' ? 'active' : s.status === 'pending' ? 'pending' : 'inactive'}`}>{s.status}</span></td>
                    <td className="text-center"><span className={`cp-badge cp-badge-${ph?.status === 'approved' ? 'approved' : ph?.status === 'rejected' ? 'cancelled' : 'pending'}`}>{ph?.status ?? '—'}</span></td>
                    <td className="col-actions" style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      {s.status !== 'pending' && <button className="cp-btn cp-btn-outline cp-btn-sm" onClick={() => toggleAccount('staff', s.id)}>{s.status === 'active' ? 'Disable' : 'Activate'}</button>}
                      <button className="cp-btn cp-btn-danger cp-btn-sm" onClick={() => removeAccount('staff', s.id)}>Remove</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Herbal Index (platform-wide catalog) ─────────────────────
function HerbalIndex({ actor, dispatch, toast }: { actor: string; dispatch: any; toast: any }) {
  function toggleRx(id: string) {
    const m = medicine(id); if (!m) return;
    m.prescription = !m.prescription;
    if (m.prescription) m.category = 'Prescription';
    logAudit(actor, 'Marked ' + m.name + ' as ' + (m.prescription ? 'prescription (Rx)' : 'over-the-counter (OTC)'));
    toast('Updated to ' + (m.prescription ? 'Rx' : 'OTC') + '.', 'success');
    dispatch({ type: 'SET_SEARCH', payload: {} });
  }
  function removeFromCatalog(id: string) {
    const m = medicine(id);
    if (!window.confirm('Remove this listing from the platform?')) return;
    DB.medicines = DB.medicines.filter(x => x.id !== id);
    logAudit(actor, 'Removed listing ' + (m ? m.name : id) + ' from the platform catalog');
    toast('Removed from catalog.', 'success');
    dispatch({ type: 'SET_SEARCH', payload: {} });
  }
  return (
    <div>
      <h2 style={{ fontFamily: 'var(--cp-font-display)', fontSize: 24, margin: '0 0 4px' }}>Herbal Index</h2>
      <p style={{ fontSize: 13, color: 'var(--cp-walnut-faint)', margin: '0 0 16px' }}>Platform-wide catalog — manage prescriptions and remove items.</p>
      <div className="cp-card">
        <div className="cp-table-wrap">
          <table className="cp-table">
            <thead><tr><th>Name</th><th>Pharmacy</th><th>Category</th><th className="text-right">Price</th><th className="text-center">Type</th><th className="col-actions"></th></tr></thead>
            <tbody>
              {DB.medicines.map(m => {
                const ph = pharmacy(m.pharmacyId);
                return (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    <td>{ph ? ph.name : <span className="cp-hint">(orphaned)</span>}</td>
                    <td>💊 {m.category}</td>
                    <td className="text-right">{money(m.price)}</td>
                    <td className="text-center"><span className={`cp-badge cp-badge-${m.prescription ? 'pending' : 'active'}`}>{m.prescription ? 'Rx' : 'OTC'}</span></td>
                    <td className="col-actions" style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button className="cp-btn cp-btn-outline cp-btn-sm" onClick={() => toggleRx(m.id)}>{m.prescription ? '→ OTC' : '→ Rx'}</button>
                      <button className="cp-btn cp-btn-danger cp-btn-sm" onClick={() => removeFromCatalog(m.id)}>Remove</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── All Orders ────────────────────────────────────────────────
function AllOrders() {
  return (
    <div>
      <h2 style={{ fontFamily: 'var(--cp-font-display)', fontSize: 24, margin: '0 0 16px' }}>All Orders</h2>
      <div className="cp-card">
        <div className="cp-table-wrap">
          <table className="cp-table">
            <thead><tr><th>Order</th><th>Customer</th><th>Pharmacy</th><th className="text-right">Total</th><th>Payment</th><th className="text-center">Status</th><th>Placed</th></tr></thead>
            <tbody>
              {DB.orders.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map(o => (
                <tr key={o.id}>
                  <td>#{o.id.replace('o', '')}</td>
                  <td>{customerName(o.customerId)}</td>
                  <td>{pharmacyName(o.pharmacyId)}</td>
                  <td className="text-right">{money(orderTotal(o))}</td>
                  <td style={{ fontSize: 12.5 }}>{o.paymentLabel ?? 'Card'}</td>
                  <td className="text-center"><span className={`cp-badge cp-badge-${o.status}`}>{STATUS_LABEL[o.status]}</span></td>
                  <td style={{ fontSize: 12 }}>{fmtDate(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Flags ─────────────────────────────────────────────────────
function Flags({ dispatch, toast }: { dispatch: any; toast: any }) {
  if (DB.flags.length === 0) {
    return (
      <div>
        <h2 style={{ fontFamily: 'var(--cp-font-display)', fontSize: 24, margin: '0 0 20px' }}>Flags</h2>
        <div className="cp-empty"><div className="cp-empty-icon">🚩</div><div className="cp-empty-title">No flags</div></div>
      </div>
    );
  }
  return (
    <div>
      <h2 style={{ fontFamily: 'var(--cp-font-display)', fontSize: 24, margin: '0 0 16px' }}>Flags</h2>
      <div className="cp-card">
        {DB.flags.map(f => {
          const target = (f as any).targetType === 'customer' ? customer((f as any).targetId) : staffMember((f as any).targetId);
          return (
            <div key={f.id} className="cp-row-between" style={{ padding: '14px 0', borderBottom: '1px solid var(--cp-stone)' }}>
              <div>
                <strong>{target?.name ?? 'Unknown'}</strong> <span className="cp-hint">({(f as any).targetType})</span><br />
                <span className="cp-hint">{(f as any).reason ?? f.note}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className={`cp-badge cp-badge-${f.status === 'open' ? 'pending' : 'completed'}`}>{f.status}</span>
                {f.status === 'open' && (
                  <button className="cp-btn cp-btn-sage cp-btn-sm" onClick={() => {
                    f.status = 'resolved';
                    toast('Flag resolved.', 'success');
                    dispatch({ type: 'SET_SEARCH', payload: {} });
                  }}>Resolve</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Tally (Reports) ───────────────────────────────────────────
function Tally() {
  const active = DB.pharmacies.filter(p => p.status === 'approved').length;
  const activeCust = DB.customers.filter(c => c.status === 'active').length;
  const total = DB.orders.length;
  const byStatus = [...['pending','confirmed','ready','completed','cancelled']].map(s => ({
    s, n: DB.orders.filter(o => o.status === s).length,
  }));
  const maxN = Math.max(1, ...byStatus.map(b => b.n));
  return (
    <div>
      <h2 style={{ fontFamily: 'var(--cp-font-display)', fontSize: 24, margin: '0 0 16px' }}>Tally</h2>
      <div className="cp-stat-grid" style={{ marginBottom: 16 }}>
        <div className="cp-ledger-card"><div className="stat-num">{total}</div><div className="stat-label">Total orders</div></div>
        <div className="cp-ledger-card"><div className="stat-num">{active}</div><div className="stat-label">Active pharmacies</div></div>
        <div className="cp-ledger-card"><div className="stat-num">{activeCust}</div><div className="stat-label">Active customers</div></div>
        <div className="cp-ledger-card"><div className="stat-num">{DB.reviews.length}</div><div className="stat-label">Total ratings</div></div>
      </div>
      <div className="cp-card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Orders by status</h3>
        {byStatus.map(b => (
          <div key={b.s} style={{ marginBottom: 10 }}>
            <div className="cp-row-between" style={{ fontSize: 12.5, marginBottom: 4 }}>
              <span style={{ textTransform: 'capitalize' }}>{b.s}</span>
              <span>{b.n}</span>
            </div>
            <div style={{ background: 'var(--cp-stone)', borderRadius: 6, height: 8, overflow: 'hidden' }}>
              <div style={{ width: `${(b.n / maxN) * 100}%`, background: 'var(--cp-terracotta)', height: '100%' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Settings ──────────────────────────────────────────────────
function Settings({ actor, dispatch, toast }: { actor: string; dispatch: any; toast: any }) {
  const s = DB.settings;
  const PAYMENT_METHODS = [
    { id: 'card', label: 'Card', icon: '💳' },
    { id: 'gcash', label: 'GCash', icon: '📱' },
    { id: 'paymaya', label: 'PayMaya', icon: '📱' },
    { id: 'paypal', label: 'PayPal', icon: '🌐' },
    { id: 'cod', label: 'Cash on Delivery', icon: '💵' },
  ];

  function save() {
    s.platformName = (document.getElementById('setPlatformName') as HTMLInputElement)?.value?.trim() || s.platformName;
    s.supportEmail = (document.getElementById('setSupportEmail') as HTMLInputElement)?.value?.trim() || s.supportEmail;
    s.currency = (document.getElementById('setCurrency') as HTMLSelectElement)?.value || s.currency;
    const ls = parseInt((document.getElementById('setLowStock') as HTMLInputElement)?.value, 10);
    if (!isNaN(ls) && ls >= 0) s.lowStockThreshold = ls;
    const rw = parseInt((document.getElementById('setReturnWindow') as HTMLInputElement)?.value, 10);
    if (!isNaN(rw) && rw >= 0) s.returnWindowDays = rw;
    s.pickupEnabled   = (document.getElementById('setPickup') as HTMLInputElement)?.checked ?? s.pickupEnabled;
    s.deliveryEnabled = (document.getElementById('setDelivery') as HTMLInputElement)?.checked ?? s.deliveryEnabled;
    const df = parseFloat((document.getElementById('setDeliveryFee') as HTMLInputElement)?.value);
    if (!isNaN(df) && df >= 0) s.deliveryFee = df;
    const fo = parseFloat((document.getElementById('setFreeOver') as HTMLInputElement)?.value);
    if (!isNaN(fo) && fo >= 0) s.freeDeliveryOver = fo;
    PAYMENT_METHODS.forEach(pm => {
      const el = document.getElementById(`setPay_${pm.id}`) as HTMLInputElement;
      if (el) s.payments[pm.id] = el.checked;
    });
    logAudit(actor, 'Updated platform settings');
    toast('Settings saved.', 'success');
    dispatch({ type: 'SET_SEARCH', payload: {} });
  }

  return (
    <div>
      <h2 style={{ fontFamily: 'var(--cp-font-display)', fontSize: 24, margin: '0 0 4px' }}>Settings &amp; Configuration</h2>
      <p style={{ fontSize: 13, color: 'var(--cp-walnut-faint)', margin: '0 0 20px' }}>Platform-wide rules every pharmacy and shopper follows.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16, marginBottom: 16 }}>
        {/* General */}
        <div className="cp-card">
          <h3 style={{ marginTop: 0, fontSize: 15 }}>🏥 General</h3>
          <div className="cp-field"><label>Platform name</label><input id="setPlatformName" type="text" defaultValue={s.platformName} /></div>
          <div className="cp-field"><label>Support email</label><input id="setSupportEmail" type="email" defaultValue={s.supportEmail} /></div>
          <div className="cp-field"><label>Currency</label>
            <select id="setCurrency" defaultValue={s.currency}>
              {Object.entries(CURRENCIES).map(([code, c]) => <option key={code} value={code}>{c.label}</option>)}
            </select>
          </div>
          <div className="cp-field"><label>Default low-stock alert level</label><input id="setLowStock" type="number" defaultValue={s.lowStockThreshold} /></div>
          <div className="cp-field"><label>Return window (days)</label><input id="setReturnWindow" type="number" defaultValue={s.returnWindowDays} /></div>
        </div>
        {/* Shipping & Payment */}
        <div className="cp-card">
          <h3 style={{ marginTop: 0, fontSize: 15 }}>🚚 Shipping &amp; Fulfillment</h3>
          <div className="cp-checkbox-row"><input id="setPickup" type="checkbox" defaultChecked={s.pickupEnabled} /><label htmlFor="setPickup">Allow in-store pickup</label></div>
          <div className="cp-checkbox-row"><input id="setDelivery" type="checkbox" defaultChecked={s.deliveryEnabled} /><label htmlFor="setDelivery">Allow home delivery</label></div>
          <div className="cp-field"><label>Delivery fee (₱)</label><input id="setDeliveryFee" type="number" defaultValue={s.deliveryFee} /></div>
          <div className="cp-field"><label>Free delivery over (0 = never)</label><input id="setFreeOver" type="number" defaultValue={s.freeDeliveryOver} /></div>
          <div className="cp-divider" />
          <h3 style={{ fontSize: 15 }}>💳 Payment options</h3>
          {PAYMENT_METHODS.map(pm => (
            <div key={pm.id} className="cp-checkbox-row">
              <input id={`setPay_${pm.id}`} type="checkbox" defaultChecked={s.payments[pm.id] ?? false} />
              <label htmlFor={`setPay_${pm.id}`}>{pm.icon} {pm.label}</label>
            </div>
          ))}
          <p className="cp-hint">Disabled methods disappear from checkout immediately.</p>
        </div>
      </div>
      <div className="cp-card">
        <button className="cp-btn cp-btn-primary" onClick={save}>Save settings</button>
      </div>
    </div>
  );
}

// ── Content (CMS) ────────────────────────────────────────────
function Content({ adminName, dispatch, toast }: { adminName: string; dispatch: any; toast: any }) {
  const b = DB.homepageBanner;
  const actor = 'Admin · ' + adminName;
  const [editingBanner, setEditingBanner] = useState(false);
  const [addingPromo, setAddingPromo]   = useState(false);
  const [editPromoId, setEditPromoId]   = useState<string | null>(null);
  const [addingFaq, setAddingFaq]       = useState(false);
  const [editFaqId, setEditFaqId]       = useState<string | null>(null);
  const [editPageKey, setEditPageKey]   = useState<string | null>(null);

  function saveBanner() {
    const headline = (document.getElementById('bannerHeadline') as HTMLInputElement)?.value?.trim();
    const subtext  = (document.getElementById('bannerSubtext')  as HTMLInputElement)?.value?.trim();
    const ctaLabel = (document.getElementById('bannerCta')      as HTMLInputElement)?.value?.trim();
    const active   = (document.getElementById('bannerActive')   as HTMLInputElement)?.checked ?? false;
    if (!headline || !subtext || !ctaLabel) { toast('Fill in all banner fields.', 'error'); return; }
    b.headline = headline; b.subtext = subtext; b.ctaLabel = ctaLabel; b.active = active;
    setEditingBanner(false);
    logAudit(actor, 'Updated the homepage banner');
    toast('Homepage banner updated.', 'success');
    dispatch({ type: 'SET_SEARCH', payload: {} });
  }

  function addPromo() {
    const title = (document.getElementById('newPromoTitle') as HTMLInputElement)?.value?.trim();
    const text  = (document.getElementById('newPromoText')  as HTMLInputElement)?.value?.trim();
    if (!title || !text) { toast('Fill in both fields.', 'error'); return; }
    DB.promotions.push({ id: 'promo' + counters.promo++, title, text, active: true });
    setAddingPromo(false);
    logAudit(actor, 'Added promotion: ' + title);
    toast('Promotion added.', 'success');
    dispatch({ type: 'SET_SEARCH', payload: {} });
  }

  function savePromo(id: string) {
    const p = DB.promotions.find(x => x.id === id); if (!p) return;
    const title = (document.getElementById('editPromoTitle') as HTMLInputElement)?.value?.trim();
    const text  = (document.getElementById('editPromoText')  as HTMLInputElement)?.value?.trim();
    if (!title || !text) { toast('Fill in both fields.', 'error'); return; }
    p.title = title; p.text = text;
    setEditPromoId(null);
    logAudit(actor, 'Updated promotion: ' + title);
    toast('Promotion updated.', 'success');
    dispatch({ type: 'SET_SEARCH', payload: {} });
  }

  function togglePromo(id: string) {
    const p = DB.promotions.find(x => x.id === id); if (!p) return;
    p.active = !p.active;
    logAudit(actor, (p.active ? 'Activated' : 'Deactivated') + ' promotion: ' + p.title);
    toast('Promotion ' + (p.active ? 'activated' : 'deactivated') + '.', 'success');
    dispatch({ type: 'SET_SEARCH', payload: {} });
  }

  function removePromo(id: string) {
    if (!window.confirm('Remove this promotion?')) return;
    const p = DB.promotions.find(x => x.id === id);
    DB.promotions = DB.promotions.filter(x => x.id !== id);
    logAudit(actor, 'Removed promotion: ' + (p ? p.title : id));
    toast('Promotion removed.', 'success');
    dispatch({ type: 'SET_SEARCH', payload: {} });
  }

  function addFaq() {
    const q = (document.getElementById('newFaqQ') as HTMLInputElement)?.value?.trim();
    const a = (document.getElementById('newFaqA') as HTMLInputElement)?.value?.trim();
    if (!q || !a) { toast('Fill in both the question and answer.', 'error'); return; }
    DB.faqs.push({ id: 'faq' + counters.faq++, q, a });
    setAddingFaq(false);
    logAudit(actor, 'Added FAQ: ' + q);
    toast('FAQ added.', 'success');
    dispatch({ type: 'SET_SEARCH', payload: {} });
  }

  function saveFaq(id: string) {
    const f = DB.faqs.find(x => x.id === id); if (!f) return;
    const q = (document.getElementById('editFaqQ') as HTMLInputElement)?.value?.trim();
    const a = (document.getElementById('editFaqA') as HTMLInputElement)?.value?.trim();
    if (!q || !a) { toast('Fill in both the question and answer.', 'error'); return; }
    f.q = q; f.a = a;
    setEditFaqId(null);
    logAudit(actor, 'Updated FAQ: ' + q);
    toast('FAQ updated.', 'success');
    dispatch({ type: 'SET_SEARCH', payload: {} });
  }

  function removeFaq(id: string) {
    if (!window.confirm('Remove this FAQ entry?')) return;
    const f = DB.faqs.find(x => x.id === id);
    DB.faqs = DB.faqs.filter(x => x.id !== id);
    logAudit(actor, 'Removed an FAQ entry' + (f ? ': ' + f.q : ''));
    toast('FAQ removed.', 'success');
    dispatch({ type: 'SET_SEARCH', payload: {} });
  }

  function savePage(key: string) {
    const p = DB.pages[key]; if (!p) return;
    const title = (document.getElementById('pageTitle_' + key) as HTMLInputElement)?.value?.trim();
    const body  = (document.getElementById('pageBody_' + key)  as HTMLTextAreaElement)?.value?.trim();
    if (!title || !body) { toast('Title and content are required.', 'error'); return; }
    p.title = title; p.body = body;
    setEditPageKey(null);
    logAudit(actor, 'Updated the "' + title + '" page');
    toast('Page updated.', 'success');
    dispatch({ type: 'SET_SEARCH', payload: {} });
  }

  return (
    <div>
      <h2 style={{ fontFamily: 'var(--cp-font-display)', fontSize: 24, margin: '0 0 4px' }}>Content</h2>
      <p style={{ fontSize: 13, color: 'var(--cp-walnut-faint)', margin: '0 0 20px' }}>Manage the homepage banner, promotions, and static pages shown to every visitor.</p>

      {/* Homepage banner */}
      <div className="cp-card" style={{ marginBottom: 16 }}>
        <div className="cp-row-between" style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>⭐ Homepage banner</h3>
          {!editingBanner && <button className="cp-btn cp-btn-outline cp-btn-sm" onClick={() => setEditingBanner(true)}>Edit</button>}
        </div>
        <div className="cp-divider" />
        {editingBanner ? (
          <div>
            <div className="cp-field"><label>Headline</label><input id="bannerHeadline" type="text" defaultValue={b.headline} /></div>
            <div className="cp-field"><label>Subtext</label><input id="bannerSubtext" type="text" defaultValue={b.subtext} /></div>
            <div className="cp-field"><label>Button label</label><input id="bannerCta" type="text" defaultValue={b.ctaLabel} /></div>
            <div className="cp-checkbox-row"><input id="bannerActive" type="checkbox" defaultChecked={b.active} /><label htmlFor="bannerActive">Show banner on homepage</label></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="cp-btn cp-btn-primary cp-btn-sm" onClick={saveBanner}>Save</button>
              <button className="cp-btn cp-btn-outline cp-btn-sm" onClick={() => setEditingBanner(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div>
            <p style={{ margin: '0 0 4px', fontFamily: 'var(--cp-font-display)', fontSize: 17 }}>{b.headline}</p>
            <p className="cp-hint" style={{ margin: '0 0 6px' }}>{b.subtext}</p>
            <span className={`cp-badge ${b.active ? 'cp-badge-active' : 'cp-badge-disabled'}`}>{b.active ? 'Live on homepage' : 'Hidden'}</span>
          </div>
        )}
      </div>

      {/* Promotions */}
      <div className="cp-card" style={{ marginBottom: 16 }}>
        <div className="cp-row-between" style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>🔔 Promotions</h3>
          {!addingPromo && <button className="cp-btn cp-btn-primary cp-btn-sm" onClick={() => setAddingPromo(true)}>Add promotion</button>}
        </div>
        <div className="cp-divider" />
        {addingPromo && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
            <div className="cp-field" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}><label>Title</label><input id="newPromoTitle" type="text" placeholder="e.g. 🌿 Weekend sale" /></div>
            <div className="cp-field" style={{ flex: 2, minWidth: 220, marginBottom: 0 }}><label>Text</label><input id="newPromoText" type="text" placeholder="Short promo message" /></div>
            <button className="cp-btn cp-btn-primary cp-btn-sm" onClick={addPromo}>Add</button>
            <button className="cp-btn cp-btn-outline cp-btn-sm" onClick={() => setAddingPromo(false)}>Cancel</button>
          </div>
        )}
        {DB.promotions.length ? DB.promotions.map(p => {
          if (editPromoId === p.id) {
            return (
              <div key={p.id} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', padding: '10px 0', borderBottom: '1px solid var(--cp-stone)' }}>
                <div className="cp-field" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}><label>Title</label><input id="editPromoTitle" type="text" defaultValue={p.title} /></div>
                <div className="cp-field" style={{ flex: 2, minWidth: 220, marginBottom: 0 }}><label>Text</label><input id="editPromoText" type="text" defaultValue={p.text} /></div>
                <button className="cp-btn cp-btn-primary cp-btn-sm" onClick={() => savePromo(p.id)}>Save</button>
                <button className="cp-btn cp-btn-outline cp-btn-sm" onClick={() => setEditPromoId(null)}>Cancel</button>
              </div>
            );
          }
          return (
            <div key={p.id} className="cp-row-between" style={{ padding: '10px 0', borderBottom: '1px solid var(--cp-stone)' }}>
              <div>
                <strong>{p.title}</strong> <span className={`cp-badge ${p.active ? 'cp-badge-active' : 'cp-badge-disabled'}`}>{p.active ? 'active' : 'hidden'}</span>
                <div className="cp-hint">{p.text}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="cp-btn cp-btn-outline cp-btn-sm" onClick={() => setEditPromoId(p.id)}>Edit</button>
                <button className="cp-btn cp-btn-outline cp-btn-sm" onClick={() => togglePromo(p.id)}>{p.active ? 'Hide' : 'Show'}</button>
                <button className="cp-btn cp-btn-danger cp-btn-sm" onClick={() => removePromo(p.id)}>Remove</button>
              </div>
            </div>
          );
        }) : <p className="cp-hint">No promotions yet.</p>}
      </div>

      {/* Static pages */}
      <div className="cp-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>📄 Static pages</h3>
        {Object.entries(DB.pages).map(([key, p]) => (
          <div key={key} style={{ padding: '12px 0', borderBottom: '1px solid var(--cp-stone)' }}>
            {editPageKey === key ? (
              <div>
                <div className="cp-field"><label>Title</label><input id={`pageTitle_${key}`} type="text" defaultValue={p.title} /></div>
                <div className="cp-field"><label>Content</label><textarea id={`pageBody_${key}`} rows={4} defaultValue={p.body} style={{ width: '100%', padding: 10, border: '1px solid var(--cp-stone-dark)', borderRadius: 8 }} /></div>
                <button className="cp-btn cp-btn-primary cp-btn-sm" onClick={() => savePage(key)}>Save</button>{' '}
                <button className="cp-btn cp-btn-outline cp-btn-sm" onClick={() => setEditPageKey(null)}>Cancel</button>
              </div>
            ) : (
              <div className="cp-row-between">
                <div>
                  <strong style={{ fontFamily: 'var(--cp-font-display)' }}>{p.title}</strong>
                  <p className="cp-hint" style={{ margin: '6px 0 0' }}>{p.body}</p>
                </div>
                <button className="cp-btn cp-btn-outline cp-btn-sm" onClick={() => setEditPageKey(key)}>Edit</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* FAQs */}
      <div className="cp-card">
        <div className="cp-row-between" style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>✉️ FAQs</h3>
          {!addingFaq && <button className="cp-btn cp-btn-primary cp-btn-sm" onClick={() => setAddingFaq(true)}>Add FAQ</button>}
        </div>
        <div className="cp-divider" />
        {addingFaq && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
            <div className="cp-field" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}><label>Question</label><input id="newFaqQ" type="text" placeholder="Question" /></div>
            <div className="cp-field" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}><label>Answer</label><input id="newFaqA" type="text" placeholder="Answer" /></div>
            <button className="cp-btn cp-btn-primary cp-btn-sm" onClick={addFaq}>Add</button>
            <button className="cp-btn cp-btn-outline cp-btn-sm" onClick={() => setAddingFaq(false)}>Cancel</button>
          </div>
        )}
        {DB.faqs.length ? DB.faqs.map(f => {
          if (editFaqId === f.id) {
            return (
              <div key={f.id} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', padding: '10px 0', borderBottom: '1px solid var(--cp-stone)' }}>
                <div className="cp-field" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}><label>Question</label><input id="editFaqQ" type="text" defaultValue={f.q} /></div>
                <div className="cp-field" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}><label>Answer</label><input id="editFaqA" type="text" defaultValue={f.a} /></div>
                <button className="cp-btn cp-btn-primary cp-btn-sm" onClick={() => saveFaq(f.id)}>Save</button>
                <button className="cp-btn cp-btn-outline cp-btn-sm" onClick={() => setEditFaqId(null)}>Cancel</button>
              </div>
            );
          }
          return (
            <div key={f.id} className="cp-row-between" style={{ padding: '10px 0', borderBottom: '1px solid var(--cp-stone)' }}>
              <div><strong>{f.q}</strong><div className="cp-hint">{f.a}</div></div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="cp-btn cp-btn-outline cp-btn-sm" onClick={() => setEditFaqId(f.id)}>Edit</button>
                <button className="cp-btn cp-btn-danger cp-btn-sm" onClick={() => removeFaq(f.id)}>Remove</button>
              </div>
            </div>
          );
        }) : <p className="cp-hint">No FAQs yet.</p>}
      </div>
    </div>
  );
}

// ── Audit Trail ──────────────────────────────────────────────
function AuditTrail() {
  const [q, setQ] = useState('');
  const rows = DB.auditLog.filter(e =>
    !q.trim() ||
    e.action.toLowerCase().includes(q.toLowerCase()) ||
    e.actor.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <div>
      <h2 style={{ fontFamily: 'var(--cp-font-display)', fontSize: 24, margin: '0 0 4px' }}>Audit Trail</h2>
      <p style={{ fontSize: 13, color: 'var(--cp-walnut-faint)', margin: '0 0 16px' }}>A running record of administrative and account-management activity across the platform.</p>
      <div className="cp-field" style={{ maxWidth: 320 }}>
        <label>Filter</label>
        <input type="text" placeholder="Search actor or action…" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div className="cp-card">
        {rows.length ? (
          <div className="cp-table-wrap">
            <table className="cp-table">
              <thead><tr><th>Time</th><th className="text-left">Actor</th><th className="text-left">Action</th></tr></thead>
              <tbody>
                {rows.map(e => (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(e.at)}</td>
                    <td>{e.actor}</td>
                    <td>{e.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="cp-empty">
            <div className="cp-empty-icon">🕰️</div>
            <div className="cp-empty-title">No activity yet</div>
            <div className="cp-empty-sub">Actions taken across the platform will appear here.</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main AdminPortal ──────────────────────────────────────────
const AdminPortal: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch, logout, toast } = useApp();

  const adminId = state.session.admin;
  if (!adminId) { navigate('/auth', { replace: true }); return null; }

  const admin = adminId ? DB.admins.find(a => a.id === adminId) : undefined;
  const adminName = admin?.name ?? 'Unknown';
  const actor = 'Admin · ' + adminName;
  const view = state.admin.view;

  const pendingApprovals = DB.staff.filter(s => s.status === 'pending').length;
  const openFlags        = DB.flags.filter(f => f.status === 'open').length;

  const tabs: [string, string][] = [
    ['approvals', `Registry${pendingApprovals ? ` (${pendingApprovals})` : ''}`],
    ['accounts',  'Accounts'],
    ['catalog',   'Herbal Index'],
    ['orders',    'All Orders'],
    ['flags',     `Flags${openFlags ? ` (${openFlags})` : ''}`],
    ['reports',   'Tally'],
    ['content',   'Content'],
    ['audit',     'Audit Trail'],
    ['settings',  'Settings'],
  ];

  return (
    <div className="cp-page">
      <div style={{ overflowY: "auto" }}>
        {/* Topbar */}
        <header style={{ background: 'rgba(250,247,242,0.9)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--cp-stone-dark)', position: 'sticky', top: 0, zIndex: 50 }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div className="cp-brand-wrap">
              <div className="cp-brand-mark">🍃</div>
              <div>
                <div className="cp-brand-name">CarePoint</div>
                <span className="cp-brand-tag">Super Admin</span>
              </div>
            </div>
            <div className="cp-user-chip" style={{ marginLeft: 'auto' }}>
              <span className="name">{admin?.name ?? 'Admin'}</span>
              <button className="cp-btn-link" onClick={() => logout()}>Log out</button>
            </div>
          </div>
        </header>

        {/* Subnav */}
        <nav className="cp-subnav">
          <div className="cp-subnav-inner">
            {tabs.map(([v, label]) => (
              <button key={v}
                className={`cp-subnav-tab${view === v ? ' active' : ''}`}
                dangerouslySetInnerHTML={{ __html: label }}
                onClick={() => dispatch({ type: 'SET_ADMIN_VIEW', view: v })} />
            ))}
          </div>
        </nav>

        {/* Content */}
        <div className="cp-admin-bg" style={{ minHeight: '100%' }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 16px 80px' }}>
            {view === 'approvals' && <Registry actor={actor} dispatch={dispatch} toast={toast} />}
            {view === 'accounts'  && <Accounts adminId={adminId} actor={actor} dispatch={dispatch} toast={toast} />}
            {view === 'catalog'   && <HerbalIndex actor={actor} dispatch={dispatch} toast={toast} />}
            {view === 'orders'    && <AllOrders />}
            {view === 'flags'     && <Flags dispatch={dispatch} toast={toast} />}
            {view === 'reports'   && <Tally />}
            {view === 'content'   && <Content adminName={adminName} dispatch={dispatch} toast={toast} />}
            {view === 'audit'     && <AuditTrail />}
            {view === 'settings'  && <Settings actor={actor} dispatch={dispatch} toast={toast} />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPortal;
