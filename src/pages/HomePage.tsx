// ============================================================
//  CarePoint — Home page
//  Guest: full landing page matching CAREPOINT_PHASE_3.html exactly
//  Customer: logged-in shop view
// ============================================================
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DB } from '../data/db';
import {
  publicMedicines, platformStats, medRatingAvg, medReviews,
  CATEGORIES, timeGreeting, money, stockState, stockText,
  isWishlisted, customerName, fmtDate,
  unreadForCustomer, unreadNotifCount, custNotifications,
} from '../data/helpers';
import { useApp } from '../context/AppContext';

// ── Helpers ──────────────────────────────────────────────────
const CAT_EMOJI: Record<string,string> = {
  'Pain Relief':'🍃','Cold & Flu':'💧','Allergy':'🌸',
  'Vitamins':'💊','First Aid':'➕','Digestive':'🌱',
  'Skin Care':'🫙','Prescription':'📜',
};

function StarRow({ avg, count, size=13 }: { avg:number; count?:number; size?:number }) {
  const full = Math.round(avg);
  return (
    <span className="cp-stars">
      {[1,2,3,4,5].map(i => (
        <span key={i} className={`cp-star ${i<=full?'cp-star-filled':'cp-star-empty'}`} style={{fontSize:size}}>★</span>
      ))}
      {count!==undefined && count>0 && <span className="cp-star-count">({count})</span>}
    </span>
  );
}

const EMOJI_MAP: Record<string,string> = {Paracetamol:'💊',Ibuprofen:'💊',Cetirizine:'💊',Amoxicillin:'💊','Cough Syrup':'🍯','Oral Rehydration':'🧂','Vitamin C':'🍊',Multivitamins:'🥗',Antiseptic:'🧴',Hydrocortisone:'🧴',Salbutamol:'💨',Echinacea:'🌿',Ginger:'🍯'};
const GRAD_MAP: Record<string,[string,string]> = {Paracetamol:['#E8D5B7','#D4BFA0'],Ibuprofen:['#E8D5B7','#D4BFA0'],Cetirizine:['#D4E0D8','#B8C9BE'],Amoxicillin:['#F5E3D4','#E8CDB8'],'Cough Syrup':['#F0D4B0','#E0BC8A'],'Oral Rehydration':['#D4E8E0','#B8D4C8'],'Vitamin C':['#F5E0B0','#E8CC8A'],Multivitamins:['#D4E8D0','#B8D4B0'],Antiseptic:['#D0E0E8','#B0C8D4'],Hydrocortisone:['#E8DDE0','#D4C4C8'],Salbutamol:['#D0E0F0','#B0C8E0'],Echinacea:['#D4E8D8','#B0C8B8'],Ginger:['#E8D8B8','#D4C4A0']};
function medVis(name:string){let e='💊',g1='#D4D4D4',g2='#B8B8B8';for(const[k,v]of Object.entries(EMOJI_MAP)){if(name.includes(k)){e=v;break;}}for(const[k,v]of Object.entries(GRAD_MAP)){if(name.includes(k)){[g1,g2]=v;break;}}return{e,g1,g2};}

function filteredMeds(search: { query:string; category:string; pharmacy:string; sort:string; priceMin:string; priceMax:string }) {
  const q=search.query.trim().toLowerCase(), min=parseFloat(search.priceMin), max=parseFloat(search.priceMax);
  let list=publicMedicines().filter(m=>{
    if(search.category!=='All'&&m.category!==search.category)return false;
    if(search.pharmacy!=='All'&&m.pharmacyId!==search.pharmacy)return false;
    if(!isNaN(min)&&m.price<min)return false;
    if(!isNaN(max)&&m.price>max)return false;
    if(!q)return true;
    const ph=DB.pharmacies.find(p=>p.id===m.pharmacyId);
    return m.name.toLowerCase().includes(q)||m.category.toLowerCase().includes(q)||(ph?.name.toLowerCase().includes(q)??false);
  });
  if(search.sort==='priceLow')list=[...list].sort((a,b)=>a.price-b.price);
  else if(search.sort==='priceHigh')list=[...list].sort((a,b)=>b.price-a.price);
  else if(search.sort==='name')list=[...list].sort((a,b)=>a.name.localeCompare(b.name));
  else if(search.sort==='popularity')list=[...list].sort((a,b)=>(b.sold||0)-(a.sold||0));
  else list=[...list].sort((a,b)=>b.addedAt-a.addedAt);
  return list;
}

// ── Notification panel ───────────────────────────────────────
function NotifPanel({ custId, onClose }: { custId:string; onClose:()=>void }) {
  const list = custNotifications(custId);
  return (
    <div className="cp-notif-panel" onClick={e => e.stopPropagation()}>
      <div className="cp-notif-head">
        <strong style={{fontFamily:'var(--cp-font-display)',fontSize:14}}>Notifications</strong>
        {list.length>0 && <button className="cp-btn-link" style={{fontSize:11}} onClick={()=>{DB.notifications.filter(n=>n.customerId===custId).forEach(n=>{n.read=true;});onClose();}}>Mark all read</button>}
      </div>
      {list.length===0
        ? <div style={{padding:'28px 14px',textAlign:'center',fontSize:12.5,color:'var(--cp-walnut-faint)'}}>All caught up — no notifications.</div>
        : list.map(n=>(
          <div key={n.id} className={`cp-notif-item${n.read?'':' unread'}`}>
            {!n.read&&<span className="cp-unread-dot"/>}
            {n.text}
            <div className="cp-notif-time">{fmtDate(n.at)}</div>
          </div>
        ))}
    </div>
  );
}

// ── Medicine card (public / guest) ───────────────────────────
function PublicMedCard({ m, onOpen }: { m: ReturnType<typeof publicMedicines>[0]; onOpen:()=>void }) {
  const {e,g1,g2}=medVis(m.name);
  const ph=DB.pharmacies.find(p=>p.id===m.pharmacyId);
  const avg=medRatingAvg(m.id), cnt=medReviews(m.id).length;
  const ss=stockState(m.stock);
  return (
    <div className="cp-med-card" onClick={onOpen} role="button" tabIndex={0} onKeyDown={ev=>ev.key==='Enter'&&onOpen()}>
      <div className="cp-med-card-top">
        <div className="cp-med-picture" style={{width:72,height:72,background:`linear-gradient(140deg,${g1},${g2})`}}>
          <span className="cp-med-emoji">{e}</span>
          <span className="cp-med-label">{m.name.split(' ').slice(0,2).join(' ')}</span>
        </div>
        <div className="cp-med-card-info">
          <div className="cp-cat-pill">{CAT_EMOJI[m.category]||'💊'} {m.category}</div>
          <div className="cp-med-card-name">{m.name}</div>
          <StarRow avg={avg} count={cnt} />
        </div>
      </div>
      <div style={{fontSize:12,color:'var(--cp-walnut-faint)'}}>🏥 {ph?.name??'Pharmacy'}</div>
      {m.prescription
        ? <div className="cp-stock-line">📜 Rx required</div>
        : <div className="cp-stock-line"><span className={`cp-dot cp-dot-${ss}`}/>{stockText(m.stock)}</div>}
      <div className="cp-med-card-actions">
        <span className="cp-med-card-price">{money(m.price)}</span>
        <button className="cp-btn cp-btn-primary cp-btn-sm" onClick={ev=>{ev.stopPropagation();onOpen();}}>Log in to order</button>
      </div>
    </div>
  );
}

// ── Medicine card (logged-in customer) ──────────────────────
function CustomerMedCard({ m, custId, onOpen, onAdd, onWish }: {
  m: ReturnType<typeof publicMedicines>[0]; custId:string;
  onOpen:()=>void; onAdd:(medId:string,price:number,phId:string)=>void; onWish:(medId:string)=>void;
}) {
  const {e,g1,g2}=medVis(m.name);
  const ph=DB.pharmacies.find(p=>p.id===m.pharmacyId);
  const avg=medRatingAvg(m.id), cnt=medReviews(m.id).length;
  const ss=stockState(m.stock), wished=isWishlisted(custId,m.id);
  return (
    <div className="cp-med-card" onClick={onOpen} role="button" tabIndex={0} onKeyDown={ev=>ev.key==='Enter'&&onOpen()}>
      <button className="cp-wish-btn" aria-pressed={wished} title={wished?'Remove from wishlist':'Save'} onClick={ev=>{ev.stopPropagation();onWish(m.id);}}>
        {wished?'❤️':'🤍'}
      </button>
      <div className="cp-med-card-top">
        <div className="cp-med-picture" style={{width:72,height:72,background:`linear-gradient(140deg,${g1},${g2})`}}>
          <span className="cp-med-emoji">{e}</span>
          <span className="cp-med-label">{m.name.split(' ').slice(0,2).join(' ')}</span>
        </div>
        <div className="cp-med-card-info">
          <div className="cp-cat-pill">{CAT_EMOJI[m.category]||'💊'} {m.category}</div>
          <div className="cp-med-card-name">{m.name}</div>
          <StarRow avg={avg} count={cnt} />
        </div>
      </div>
      <div style={{fontSize:12,color:'var(--cp-walnut-faint)'}}>🏥 {ph?.name??'Pharmacy'}</div>
      {m.prescription
        ? <div className="cp-stock-line">📜 Rx required</div>
        : <div className="cp-stock-line"><span className={`cp-dot cp-dot-${ss}`}/>{stockText(m.stock)}</div>}
      <div className="cp-med-card-actions">
        <span className="cp-med-card-price">{money(m.price)}</span>
        {m.prescription
          ? <span className="cp-badge cp-badge-pending">Rx</span>
          : <button className="cp-btn cp-btn-primary cp-btn-sm" disabled={m.stock===0}
              onClick={ev=>{ev.stopPropagation();onAdd(m.id,m.price,m.pharmacyId);}}>
              {m.stock===0?'Out':'Add'}
            </button>}
      </div>
    </div>
  );
}

// ── Customer subnav ──────────────────────────────────────────
function CustomerSubnav({ view, custId, cartCount, onTab }: { view:string; custId:string; cartCount:number; onTab:(v:string)=>void }) {
  const wishCount = DB.customers.find(c=>c.id===custId)?.wishlist?.length??0;
  const unreadMsg = unreadForCustomer(custId);
  const tabs: [string,string][] = [
    ['home','Shop'],
    ['wishlist',`Wishlist${wishCount?` <span class="cp-badge-count">${wishCount}</span>`:''}` ],
    ['cart',`Satchel${cartCount?` <span class="cp-badge-count">${cartCount}</span>`:''}` ],
    ['orders','My Orders'],
    ['messages',`Messages${unreadMsg?` <span class="cp-badge-count">${unreadMsg}</span>`:''}` ],
    ['profile','Profile'],
  ];
  return (
    <nav className="cp-subnav">
      <div className="cp-subnav-inner">
        {tabs.map(([v,label])=>(
          <button key={v} className={`cp-subnav-tab${view===v?' active':''}`}
            dangerouslySetInnerHTML={{__html:label}}
            onClick={()=>onTab(v)} />
        ))}
      </div>
    </nav>
  );
}

// ── Main component ───────────────────────────────────────────
const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch, cartKey, cartCount, addToCart, logout, toast } = useApp();

  const isCustomer = state.activeRole==='customer' && !!state.session.customer;
  const custId     = state.session.customer;
  const greeting   = timeGreeting();
  const firstName  = custId ? DB.customers.find(c=>c.id===custId)?.name?.split(' ')[0] : null;

  // Redirect staff/admin to their portals
  useEffect(() => {
    if (state.activeRole==='staff')  navigate('/branch', { replace:true });
    if (state.activeRole==='admin')  navigate('/admin',  { replace:true });
  }, [state.activeRole, navigate]);

  // Redirect customer sub-views to their own routes
  const view = state.customer.view;
  useEffect(() => {
    if (!isCustomer) return;
    if (view==='cart')      navigate('/cart');
    if (view==='checkout')  navigate('/checkout');
    if (view==='orders' || view==='orderDetail') navigate('/orders');
    if (view==='messages' || view==='thread')    navigate('/messages');
    if (view==='wishlist')  navigate('/wishlist');
    if (view==='profile')   navigate('/profile');
    if (view==='medicine' && state.customer.medId) navigate(`/medicine/${state.customer.medId}`);
  }, [view, isCustomer, navigate, state.customer.medId]);

  // Close notif panel on outside click
  const notifPanelOpen = state.notifPanelOpen;
  useEffect(() => {
    if (!notifPanelOpen) return;
    const h = () => dispatch({ type:'CLOSE_NOTIF_PANEL' });
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, [notifPanelOpen, dispatch]);

  // Derived
  const stats    = platformStats();
  const featured = publicMedicines().slice().sort((a,b)=>(medRatingAvg(b.id)-medRatingAvg(a.id))||((b.sold||0)-(a.sold||0))).slice(0,6);
  const approvedPharmas = DB.pharmacies.filter(p=>p.status==='approved');
  const topReviews = DB.reviews.slice().sort((a,b)=>b.at.getTime()-a.at.getTime()).slice(0,3);
  const meds = filteredMeds(state.search);
  const unreadMsg   = custId ? unreadForCustomer(custId) : 0;
  const unreadNotif = custId ? unreadNotifCount(custId) : 0;
  const cust = custId ? DB.customers.find(c=>c.id===custId) : null;

  function toggleWishlist(medId: string) {
    if (!custId) return;
    const c = DB.customers.find(cx=>cx.id===custId); if (!c) return;
    if (!c.wishlist) c.wishlist=[];
    const i=c.wishlist.indexOf(medId);
    if (i>-1){c.wishlist.splice(i,1);toast('Removed from wishlist.','success');}
    else      {c.wishlist.push(medId);toast('Saved to wishlist.','success');}
    dispatch({type:'SET_SEARCH',payload:{}});
  }

  function handleAddToCart(medId:string,price:number,pharmacyId:string) {
    if (!cartKey) { navigate('/auth'); return; }
    const med=DB.medicines.find(m=>m.id===medId);
    if (!med||med.prescription||med.stock===0) return;
    const cart=state.carts[cartKey];
    if (cart&&cart.pharmacyId!==pharmacyId&&cart.items.length>0) {
      if (!window.confirm('Your satchel has items from another pharmacy. Clear and start a new order?')) return;
    }
    addToCart(medId,price,pharmacyId);
    toast(`${med.name} added.`,'success');
  }

  function handleSubnavTab(v:string) {
    if (v==='home') { dispatch({type:'SET_CUSTOMER_VIEW',view:'home'}); return; }
    const routes: Record<string,string> = {cart:'/cart',wishlist:'/wishlist',orders:'/orders',messages:'/messages',profile:'/profile'};
    if (routes[v]) navigate(routes[v]);
  }

  // ── TOPBAR ────────────────────────────────────────────────
  const topbar = (
    <header className="cp-topbar">
      <div className="cp-topbar-inner">
        {/* Brand */}
        <div className="cp-brand" onClick={()=>navigate('/')}>
          <div className="cp-brand-mark">🍃</div>
          <div>
            <div className="cp-brand-name">CarePoint</div>
            <span className="cp-brand-tag">The Neighborhood Apothecary</span>
          </div>
        </div>

        {/* Right side */}
        {isCustomer && custId ? (
          <div className="cp-user-chip" style={{marginLeft:'auto'}}>
            <span className="name">{cust?.name??''}</span>
            {/* Cart */}
            <button className="cp-icon-btn cp-icon-btn-cart" onClick={()=>navigate('/cart')} aria-label="Cart">
              🛒
              {cartCount>0&&<span className="cp-icon-badge">{cartCount}</span>}
            </button>
            {/* Notifications */}
            <div className="cp-notif-wrap">
              <button className="cp-icon-btn cp-icon-btn-notif" aria-label="Notifications"
                onClick={()=>{
                  if (!notifPanelOpen&&custId) DB.notifications.filter(n=>n.customerId===custId).forEach(n=>{n.read=true;});
                  dispatch({type:'TOGGLE_NOTIF_PANEL'});
                }}>
                🔔
                {unreadNotif>0&&<span className="cp-notif-dot"/>}
              </button>
              {notifPanelOpen&&custId&&<NotifPanel custId={custId} onClose={()=>dispatch({type:'CLOSE_NOTIF_PANEL'})}/>}
            </div>
            {/* Messages */}
            <button className="cp-icon-btn cp-icon-btn-msg" onClick={()=>navigate('/messages')} aria-label="Messages">
              ✉️
              {unreadMsg>0&&<span className="cp-notif-dot"/>}
            </button>
            <button className="cp-btn-link" onClick={()=>logout()}>Log out</button>
          </div>
        ) : (
          <div className="cp-guest-nav">
            <button className="cp-navlink active" onClick={()=>navigate('/')}>Home</button>
            <button className="cp-navlink" onClick={()=>navigate('/catalog')}>Browse</button>
            <button className="cp-navlink" onClick={()=>navigate('/auth')}>Log in</button>
            <button className="cp-btn cp-btn-primary cp-btn-sm" onClick={()=>{dispatch({type:'SET_AUTH_MODE',mode:'register'});navigate('/auth');}}>Sign up</button>
          </div>
        )}
      </div>
    </header>
  );

  // ── CUSTOMER HOME ─────────────────────────────────────────
  if (isCustomer && custId) {
    return (
      <div className="cp-page">
        {topbar}
        <CustomerSubnav view={view==='home'?'home':view} custId={custId} cartCount={cartCount} onTab={handleSubnavTab} />
        <main style={{maxWidth:1180,margin:'0 auto',padding:'34px 20px 70px'}}>
          {/* Greeting */}
          <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:8}}>
            <span style={{fontSize:40}}>{greeting.icon==='sprout'?'🌱':greeting.icon==='flower'?'🌸':'🍃'}</span>
            <div>
              <h2 style={{fontFamily:'var(--cp-font-display)',fontSize:26,margin:'0 0 2px',color:'var(--cp-walnut)'}}>
                {greeting.text}, {firstName}.
              </h2>
              <p style={{margin:0,fontSize:13.5,color:'var(--cp-walnut-faint)'}}>What are we looking for today?</p>
            </div>
          </div>

          {/* Search + filters */}
          <div className="cp-card">
            <div className="cp-field" style={{marginBottom:12}}>
              <input type="text" placeholder="Search remedies, pharmacies…"
                value={state.search.query}
                onChange={e=>dispatch({type:'SET_SEARCH',payload:{query:e.target.value}})} />
            </div>
            <div className="cp-chip-row" style={{marginBottom:12}}>
              {['All',...CATEGORIES].map(cat=>(
                <button key={cat} className={`cp-chip${state.search.category===cat?' active':''}`}
                  onClick={()=>dispatch({type:'SET_SEARCH',payload:{category:cat}})}>
                  {cat!=='All'?(CAT_EMOJI[cat]||'💊')+' ':''}{cat}
                </button>
              ))}
            </div>
            <div className="cp-filter-row">
              <div className="cp-field" style={{minWidth:180,marginBottom:0}}>
                <label>Pharmacy</label>
                <select value={state.search.pharmacy} onChange={e=>dispatch({type:'SET_SEARCH',payload:{pharmacy:e.target.value}})}>
                  <option value="All">All</option>
                  {approvedPharmas.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="cp-field" style={{minWidth:150,marginBottom:0}}>
                <label>Sort</label>
                <select value={state.search.sort} onChange={e=>dispatch({type:'SET_SEARCH',payload:{sort:e.target.value}})}>
                  <option value="newest">Newest</option>
                  <option value="popularity">Popular</option>
                  <option value="priceLow">Price ↑</option>
                  <option value="priceHigh">Price ↓</option>
                  <option value="name">Name A–Z</option>
                </select>
              </div>
              <div className="cp-field" style={{marginBottom:0}}>
                <label>Price (₱)</label>
                <div className="cp-price-range">
                  <input type="number" min={0} placeholder="Min" value={state.search.priceMin} onChange={e=>dispatch({type:'SET_SEARCH',payload:{priceMin:e.target.value}})} />
                  <span style={{color:'var(--cp-walnut-faint)'}}>–</span>
                  <input type="number" min={0} placeholder="Max" value={state.search.priceMax} onChange={e=>dispatch({type:'SET_SEARCH',payload:{priceMax:e.target.value}})} />
                </div>
              </div>
              {(state.search.category!=='All'||state.search.pharmacy!=='All'||state.search.priceMin||state.search.priceMax||state.search.query)&&(
                <button className="cp-btn cp-btn-ghost cp-btn-sm" onClick={()=>dispatch({type:'SET_SEARCH',payload:{query:'',category:'All',pharmacy:'All',priceMin:'',priceMax:''}})}>Clear</button>
              )}
            </div>
          </div>

          {/* Pharmacy mini-list */}
          <h3 style={{fontFamily:'var(--cp-font-display)',fontSize:16,margin:'22px 0 12px',color:'var(--cp-walnut-soft)'}}>Neighborhood Apothecaries</h3>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:12,marginBottom:24}}>
            {approvedPharmas.map(ph=>(
              <div key={ph.id} className="cp-card" style={{padding:'14px 16px'}}>
                <div className="cp-row-between">
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{color:'var(--cp-terracotta)'}}>🏥</span>
                    <strong style={{fontFamily:'var(--cp-font-display)',fontSize:14.5}}>{ph.name}</strong>
                  </div>
                  <span className="cp-badge cp-badge-active">🍃 Open</span>
                </div>
                <div className="cp-hint">{ph.location} · {ph.hours}</div>
                <div style={{marginTop:4,fontSize:12,color:'var(--cp-walnut-faint)'}}>
                  {DB.medicines.filter(m=>m.pharmacyId===ph.id&&!m.prescription).length} OTC items
                </div>
              </div>
            ))}
          </div>

          {/* Results */}
          <div className="cp-row-between" style={{marginBottom:12}}>
            <h3 style={{fontFamily:'var(--cp-font-display)',fontSize:16,margin:0,color:'var(--cp-walnut-soft)'}}>On the Shelf</h3>
            <span style={{fontSize:12,color:'var(--cp-walnut-faint)'}}>{meds.length} result{meds.length!==1?'s':''}</span>
          </div>
          {meds.length===0
            ? <div style={{textAlign:'center',padding:'54px 20px',color:'var(--cp-walnut-faint)'}}>
                <div style={{fontSize:48,marginBottom:12}}>🏺</div>
                <div style={{fontFamily:'var(--cp-font-display)',fontSize:17,color:'var(--cp-walnut)',marginBottom:4}}>Nothing matches</div>
                Try a different search or category.
              </div>
            : <div className="cp-masonry">
                {meds.map(m=>(
                  <CustomerMedCard key={m.id} m={m} custId={custId}
                    onOpen={()=>navigate(`/medicine/${m.id}`)}
                    onAdd={handleAddToCart}
                    onWish={toggleWishlist} />
                ))}
              </div>}
        </main>
        <footer className="cp-footer">CarePoint demo — "The Neighborhood Apothecary." Data resets on page reload.</footer>
      </div>
    );
  }

  // ── GUEST LANDING PAGE ────────────────────────────────────
  return (
    <div className="cp-page">
      {topbar}
      <main style={{maxWidth:1180,margin:'0 auto',padding:'0 20px 70px'}}>

        {/* ── Hero ── */}
        <div className="cp-landing-hero">
          <div className="cp-hero-grid">
            {/* Left column */}
            <div>
              <span className="cp-landing-eyebrow">🌿 The Neighborhood Apothecary</span>
              <h1 className="cp-landing-h1">
                Remedies from the pharmacy <em>down your street</em>.
              </h1>
              <p className="cp-landing-sub">
                Browse real stock from trusted neighborhood pharmacies, ask a pharmacist about your prescription, and pick up or get it delivered. No account needed to look around.
              </p>
              <div className="cp-hero-cta-row">
                <button className="cp-btn-hero" onClick={()=>navigate('/catalog')}>🍃 Browse remedies</button>
                <button className="cp-btn-hero-ghost" onClick={()=>{dispatch({type:'SET_AUTH_MODE',mode:'register'});navigate('/auth');}}>📜 Create an account</button>
              </div>
              <p className="cp-hero-note">Free to browse · Ratings written only by people who received their order</p>
              <div className="cp-landing-stats">
                <div className="cp-landing-stat"><div className="n">{stats.pharmacies}</div><div className="l">Open pharmacies</div></div>
                <div className="cp-landing-stat"><div className="n">{stats.meds}</div><div className="l">Remedies on the shelf</div></div>
                <div className="cp-landing-stat"><div className="n">{stats.avg?stats.avg.toFixed(1):'—'}</div><div className="l">Average rating</div></div>
              </div>
            </div>

            {/* Right column: art */}
            <div className="cp-hero-art">
              <div className="cp-hero-jar">🏺</div>
              <div className="cp-hero-chip cp-hero-chip-1">🛒 Ready for pickup in 20 min</div>
              <div className="cp-hero-chip cp-hero-chip-2">★★★★★ Rated by real customers</div>
              <div className="cp-hero-chip cp-hero-chip-3">📜 Ask a pharmacist anything</div>
            </div>
          </div>
        </div>

        {/* ── Categories ── */}
        <div className="cp-landing-section">
          <div className="cp-landing-head">
            <div className="cp-landing-kicker">Shelves</div>
            <h2>Find it by what ails you</h2>
            <p>Every category is stocked by pharmacies in your neighborhood.</p>
          </div>
          <div className="cp-cat-grid">
            {CATEGORIES.map(cat=>{
              const n=publicMedicines().filter(m=>m.category===cat).length;
              return (
                <button key={cat} className="cp-cat-tile"
                  onClick={()=>{dispatch({type:'SET_SEARCH',payload:{category:cat}});navigate('/catalog');}}>
                  <div className="ring">{CAT_EMOJI[cat]||'💊'}</div>
                  <div className="nm">{cat}</div>
                  <div className="ct">{n} item{n!==1?'s':''}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Featured ── */}
        <div className="cp-landing-section">
          <div className="cp-landing-head">
            <div className="cp-landing-kicker">Best loved</div>
            <h2>What the neighborhood reaches for</h2>
            <p>Top-rated remedies you can order the moment you sign in.</p>
          </div>
          <div className="cp-masonry">
            {featured.map(m=><PublicMedCard key={m.id} m={m} onOpen={()=>navigate(`/medicine/${m.id}`)} />)}
          </div>
          <div style={{textAlign:'center',marginTop:22}}>
            <button className="cp-btn-hero-ghost" onClick={()=>navigate('/catalog')}>See the full shelf →</button>
          </div>
        </div>

        {/* ── How it works ── */}
        <div className="cp-landing-section">
          <div className="cp-landing-head">
            <div className="cp-landing-kicker">How it works</div>
            <h2>Three steps, no queue</h2>
          </div>
          <div className="cp-steps-grid">
            {[
              {n:'1',h:'Browse the shelf',p:'Search live stock and prices from approved pharmacies near you — no account required.'},
              {n:'2',h:'Order or ask',p:'Fill your satchel for pickup or delivery, or send a prescription photo to the pharmacist.'},
              {n:'3',h:'Receive & rate',p:'Track your order from pending to ready. Once you receive it, rate the medicine for your neighbors.'},
            ].map(s=>(
              <div key={s.n} className="cp-step-card">
                <div className="cp-step-n">{s.n}</div>
                <h4>{s.h}</h4>
                <p>{s.p}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Pharmacies ── */}
        <div className="cp-landing-section">
          <div className="cp-landing-head">
            <div className="cp-landing-kicker">Neighborhood apothecaries</div>
            <h2>Real counters, real pharmacists</h2>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:16}}>
            {approvedPharmas.map(ph=>(
              <div key={ph.id} className="cp-card" style={{padding:'16px 18px'}}>
                <div className="cp-row-between">
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{color:'var(--cp-terracotta)'}}>🏥</span>
                    <strong style={{fontFamily:'var(--cp-font-display)',fontSize:15}}>{ph.name}</strong>
                  </div>
                  <span className="cp-badge cp-badge-active">🍃 Open</span>
                </div>
                <div className="cp-hint">{ph.location}</div>
                <div className="cp-hint">{ph.hours}</div>
                <div style={{marginTop:6,fontSize:12,color:'var(--cp-walnut-faint)'}}>
                  {DB.medicines.filter(m=>m.pharmacyId===ph.id&&!m.prescription).length} over-the-counter items
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Verified ratings ── */}
        {topReviews.length>0&&(
          <div className="cp-landing-section">
            <div className="cp-landing-head">
              <div className="cp-landing-kicker">Verified ratings</div>
              <h2>Only from people who received the order</h2>
              <p>Nobody can rate a remedy until their order is complete.</p>
            </div>
            <div className="cp-quote-grid">
              {topReviews.map(r=>{
                const m=DB.medicines.find(x=>x.id===r.medId);
                return (
                  <div key={r.id} className="cp-quote-card">
                    <StarRow avg={r.rating} size={15}/>
                    <div style={{marginTop:8,fontFamily:'var(--cp-font-display)',fontSize:15.5}}>{m?.name??'A remedy'}</div>
                    <div className="who">{customerName(r.customerId)} · {fmtDate(r.at)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── CTA section ── */}
        <div className="cp-landing-section">
          <div className="cp-landing-cta-section">
            <h2>Your pharmacy, a tap away</h2>
            <p>Create a free account to fill your satchel, message a pharmacist and track every order from pending to received.</p>
            <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap'}}>
              <button className="cp-btn-hero" style={{background:'var(--cp-yarrow)',color:'var(--cp-walnut)'}}
                onClick={()=>{dispatch({type:'SET_AUTH_MODE',mode:'register'});navigate('/auth');}}>
                Create your account
              </button>
              <button className="cp-btn-hero-ghost"
                style={{background:'rgba(255,252,248,0.15)',color:'#FFFCF8',borderColor:'rgba(255,252,248,0.4)'}}
                onClick={()=>{dispatch({type:'SET_AUTH_MODE',mode:'registerPharmacy'});navigate('/auth');}}>
                🏥 List your pharmacy
              </button>
            </div>
          </div>
        </div>
      </main>
      <footer className="cp-footer">CarePoint demo — "The Neighborhood Apothecary." Data resets on page reload.</footer>
    </div>
  );
};

export default HomePage;
