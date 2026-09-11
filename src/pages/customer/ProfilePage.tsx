// ============================================================
//  CarePoint — Customer Profile page
// ============================================================
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DB, counters } from '../../data/db';
import { useApp } from '../../context/AppContext';

const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch, logout, toast } = useApp();

  const custId = state.session.customer;

  // Look up customer data before hooks (safe: just a DB read, no side effects)
  const cust = custId ? DB.customers.find((c) => c.id === custId) : undefined;

  // Hooks must be called unconditionally (before any early returns)
  const [name,  setName]  = useState(cust?.name ?? '');
  const [email, setEmail] = useState(cust?.email ?? '');
  const [addrLabel, setAddrLabel] = useState('');
  const [addrText,  setAddrText]  = useState('');

  if (!custId || !cust) { navigate('/auth', { replace:true }); return null; }
  const c = cust;

  function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) { toast('Name and email are required.','error'); return; }
    const lc = email.trim().toLowerCase();
    if (DB.customers.some((x) => x.id !== c.id && x.email.toLowerCase() === lc)) {
      toast('That email is already in use by another account.','error'); return;
    }
    if (DB.staff.some((x) => x.email.toLowerCase() === lc) || DB.admins.some((x) => x.email.toLowerCase() === lc)) {
      toast('That email is already in use by a staff/admin account.','error'); return;
    }
    c.name  = name.trim();
    c.email = email.trim();
    toast('Profile updated.','success');
    dispatch({ type:'SET_SEARCH', payload:{} });
  }

  function addAddress(e: React.FormEvent) {
    e.preventDefault();
    if (!addrLabel.trim() || !addrText.trim()) { toast('Fill in both fields.','error'); return; }
    c.addresses.push({ id:'addr'+counters.addr++, label:addrLabel.trim(), text:addrText.trim() });
    setAddrLabel(''); setAddrText('');
    toast('Address added.','success');
    dispatch({ type:'SET_SEARCH', payload:{} });
  }

  function removeAddress(id: string) {
    c.addresses = c.addresses.filter((a) => a.id !== id);
    toast('Address removed.','success');
    dispatch({ type:'SET_SEARCH', payload:{} });
  }

  return (
    <div className="cp-page">
      <div style={{ overflowY: "auto" }}>
        <div style={{ maxWidth:900, margin:'0 auto', padding:'28px 16px 80px' }}>
          <button className="cp-btn-link" onClick={() => navigate('/')}>← Home</button>
          <h2 style={{ fontFamily:'var(--cp-font-display)', fontSize:26, margin:'12px 0 20px' }}>Profile</h2>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:16 }}>

            {/* Account */}
            <div className="cp-card">
              <h3 style={{ margin:'0 0 14px', fontSize:15 }}>Account</h3>
              <form onSubmit={saveProfile}>
                <div className="cp-field"><label>Name</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} /></div>
                <div className="cp-field"><label>Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <button type="submit" className="cp-btn cp-btn-primary">Save</button>
              </form>
              <div className="cp-divider" />
              <button className="cp-btn cp-btn-outline cp-btn-sm" onClick={() => logout()}>Log out</button>
            </div>

            {/* Addresses */}
            <div className="cp-card">
              <h3 style={{ margin:'0 0 10px', fontSize:15 }}>Saved Addresses</h3>
              {c.addresses.length === 0
                ? <p className="cp-hint">No saved addresses.</p>
                : c.addresses.map((a) => (
                  <div key={a.id} className="cp-row-between" style={{ padding:'9px 0', borderBottom:'1px solid var(--cp-stone)' }}>
                    <div>
                      <strong style={{ fontSize:13.5 }}>{a.label}</strong>
                      <div className="cp-hint">{a.text}</div>
                    </div>
                    <button className="cp-btn cp-btn-outline cp-btn-sm" onClick={() => removeAddress(a.id)}>Remove</button>
                  </div>
                ))}
              <div className="cp-divider" />
              <form onSubmit={addAddress}>
                <div className="cp-field"><label>Label</label>
                  <input type="text" value={addrLabel} onChange={(e) => setAddrLabel(e.target.value)} placeholder="Home, Office…" /></div>
                <div className="cp-field"><label>Address</label>
                  <input type="text" value={addrText} onChange={(e) => setAddrText(e.target.value)} placeholder="Street, district" /></div>
                <button type="submit" className="cp-btn cp-btn-outline">Add Address</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
