// ============================================================
//  CarePoint — Public Catalog
//  Full shelf with search, category chips, pharmacy/sort filters
// ============================================================
import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DB } from '../data/db';
import {
  publicMedicines, medRatingAvg, medReviews, CATEGORIES,
  money, stockState, stockText, isWishlisted, medBrand, brandList,
} from '../data/helpers';
import { useApp } from '../context/AppContext';

const CAT_EMOJI: Record<string, string> = {
  'Pain Relief': '🍃', 'Cold & Flu': '💧', 'Allergy': '🌸',
  'Vitamins': '💊', 'First Aid': '➕', 'Digestive': '🌱',
  'Skin Care': '🫙', 'Prescription': '📜',
};

function StarRow({ avg, count }: { avg: number; count?: number }) {
  const full = Math.round(avg);
  return (
    <span className="cp-stars">
      {[1,2,3,4,5].map((i) => (
        <span key={i} className={`cp-star ${i <= full ? 'cp-star-filled' : 'cp-star-empty'}`}>★</span>
      ))}
      {count !== undefined && count > 0 && <span className="cp-star-count">({count})</span>}
    </span>
  );
}

function MedPicture({ name, size = 72 }: { name: string; size?: number }) {
  const EMOJI_MAP: Record<string,string> = {
    Paracetamol:'💊',Ibuprofen:'💊',Cetirizine:'💊',Amoxicillin:'💊',
    'Cough Syrup':'🍯','Oral Rehydration':'🧂','Vitamin C':'🍊',
    Multivitamins:'🥗',Antiseptic:'🧴',Hydrocortisone:'🧴',
    Salbutamol:'💨',Echinacea:'🌿',Ginger:'🍯',
  };
  const GRAD_MAP: Record<string,[string,string]> = {
    Paracetamol:['#E8D5B7','#D4BFA0'],Ibuprofen:['#E8D5B7','#D4BFA0'],
    Cetirizine:['#D4E0D8','#B8C9BE'],Amoxicillin:['#F5E3D4','#E8CDB8'],
    'Cough Syrup':['#F0D4B0','#E0BC8A'],'Oral Rehydration':['#D4E8E0','#B8D4C8'],
    'Vitamin C':['#F5E0B0','#E8CC8A'],Multivitamins:['#D4E8D0','#B8D4B0'],
    Antiseptic:['#D0E0E8','#B0C8D4'],Hydrocortisone:['#E8DDE0','#D4C4C8'],
    Salbutamol:['#D0E0F0','#B0C8E0'],Echinacea:['#D4E8D8','#B0C8B8'],
    Ginger:['#E8D8B8','#D4C4A0'],
  };
  let emoji='💊', g1='#D4D4D4', g2='#B8B8B8';
  for (const [k,v] of Object.entries(EMOJI_MAP)) { if (name.includes(k)) { emoji=v; break; } }
  for (const [k,v] of Object.entries(GRAD_MAP))  { if (name.includes(k)) { [g1,g2]=v; break; } }
  const short = name.split(' ').slice(0,2).join(' ');
  return (
    <div className="cp-med-picture"
      style={{ width:size, height:size, background:`linear-gradient(140deg,${g1},${g2})` }}>
      <span className="cp-med-emoji" style={{ fontSize: size > 60 ? 34 : 26 }}>{emoji}</span>
      <span className="cp-med-label">{short}</span>
    </div>
  );
}

function filteredMeds(search: {
  query:string; category:string; pharmacy:string; brand:string; sort:string; priceMin:string; priceMax:string;
}) {
  const q   = search.query.trim().toLowerCase();
  const min = parseFloat(search.priceMin);
  const max = parseFloat(search.priceMax);
  let list = publicMedicines().filter((m) => {
    if (search.category !== 'All' && m.category !== search.category) return false;
    if (search.pharmacy  !== 'All' && m.pharmacyId !== search.pharmacy) return false;
    if (search.brand !== 'All' && medBrand(m) !== search.brand) return false;
    if (!isNaN(min) && m.price < min) return false;
    if (!isNaN(max) && m.price > max) return false;
    if (!q) return true;
    const ph = DB.pharmacies.find((p) => p.id === m.pharmacyId);
    return m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q)
      || medBrand(m).toLowerCase().includes(q) || (ph?.name.toLowerCase().includes(q) ?? false);
  });
  if (search.sort === 'priceLow')      list = [...list].sort((a,b)=>a.price-b.price);
  else if (search.sort === 'priceHigh') list = [...list].sort((a,b)=>b.price-a.price);
  else if (search.sort === 'name')      list = [...list].sort((a,b)=>a.name.localeCompare(b.name));
  else if (search.sort === 'popularity')list = [...list].sort((a,b)=>(b.sold||0)-(a.sold||0));
  else list = [...list].sort((a,b)=>b.addedAt-a.addedAt);
  return list;
}

const CatalogPage: React.FC = () => {
  const navigate     = useNavigate();
  const [params]     = useSearchParams();
  const { state, dispatch, addToCart, cartKey, toast } = useApp();

  // Pre-select category/pharmacy from URL params (from landing page chips / pharmacy cards)
  React.useEffect(() => {
    const cat = params.get('category');
    const ph  = params.get('pharmacy');
    if (cat) dispatch({ type:'SET_SEARCH', payload:{ category: cat } });
    if (ph)  dispatch({ type:'SET_SEARCH', payload:{ pharmacy: ph  } });
  }, [params, dispatch]);

  const isCustomer = state.activeRole === 'customer' && !!state.session.customer;
  const custId     = state.session.customer;
  const approved   = DB.pharmacies.filter((p) => p.status === 'approved');
  const meds       = filteredMeds(state.search);

  function openMed(id: string) { navigate(`/medicine/${id}`); }

  function guestPrompt() {
    toast('Create a free account or log in to order.', 'error');
    navigate('/auth');
  }

  function handleAddToCart(medId: string, price: number, pharmacyId: string) {
    if (!isCustomer || !cartKey) { guestPrompt(); return; }
    const med  = DB.medicines.find((m) => m.id === medId);
    if (!med || med.prescription || med.stock === 0) return;
    const cart = state.carts[cartKey];
    if (cart && cart.pharmacyId !== pharmacyId && cart.items.length > 0) {
      if (!window.confirm('Your satchel has items from another pharmacy. Clear and start a new order?')) return;
    }
    addToCart(medId, price, pharmacyId);
    toast(`${med.name} added.`, 'success');
  }

  function toggleWishlist(medId: string) {
    if (!custId) { guestPrompt(); return; }
    const c = DB.customers.find((cx) => cx.id === custId);
    if (!c) return;
    if (!c.wishlist) c.wishlist = [];
    const i = c.wishlist.indexOf(medId);
    if (i > -1) { c.wishlist.splice(i,1); toast('Removed from wishlist.','success'); }
    else         { c.wishlist.push(medId); toast('Saved to wishlist.','success'); }
    dispatch({ type:'SET_SEARCH', payload:{} }); // force re-render
  }

  const hasFilters =
    state.search.category !== 'All' || state.search.pharmacy !== 'All' ||
    state.search.brand !== 'All' || state.search.priceMin || state.search.priceMax || state.search.query;

  return (
    <div className="cp-page">
      <div style={{ overflowY: "auto" }}>
        {/* Sticky topbar */}
        <header style={{ background:'rgba(250,247,242,0.9)', backdropFilter:'blur(10px)',
          borderBottom:'1px solid var(--cp-stone-dark)', position:'sticky', top:0, zIndex:50 }}>
          <div style={{ maxWidth:1180, margin:'0 auto', padding:'12px 16px',
            display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
            <div className="cp-brand-wrap" style={{ cursor:'pointer' }} onClick={() => navigate('/')}>
              <div className="cp-brand-mark">🍃</div>
              <div>
                <div className="cp-brand-name">CarePoint</div>
                <span className="cp-brand-tag">The Neighborhood Apothecary</span>
              </div>
            </div>
            <div style={{ display:'flex', gap:8, marginLeft:'auto', flexWrap:'wrap', alignItems:'center' }}>
              {isCustomer ? (
                <>
                  <button className="cp-btn cp-btn-outline cp-btn-sm" onClick={() => navigate('/')}>← Home</button>
                  <button className="cp-btn cp-btn-outline cp-btn-sm" onClick={() => navigate('/cart')}>
                    🛒 Cart
                  </button>
                </>
              ) : (
                <>
                  <button className="cp-btn-link" onClick={() => navigate('/')}>← Home</button>
                  <button className="cp-btn cp-btn-outline cp-btn-sm" onClick={() => navigate('/auth')}>Log in</button>
                  <button className="cp-btn cp-btn-primary cp-btn-sm"
                    onClick={() => { dispatch({ type:'SET_AUTH_MODE', mode:'register' }); navigate('/auth'); }}>
                    Sign up
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        <div style={{ maxWidth:1180, margin:'0 auto', padding:'28px 16px 80px' }}>
          <h2 style={{ fontFamily:'var(--cp-font-display)', fontSize:26, margin:'0 0 4px' }}>
            The full shelf
          </h2>
          <p style={{ fontSize:13.5, color:'var(--cp-walnut-faint)', margin:'0 0 20px' }}>
            Browse everything in stock{!isCustomer && ' — log in when you are ready to order'}.
          </p>

          {/* ── Filter card ── */}
          <div className="cp-card" style={{ marginBottom:20 }}>
            <div className="cp-field" style={{ marginBottom:10 }}>
              <input type="text" placeholder="Search remedies, pharmacies…"
                value={state.search.query}
                onChange={(e) => dispatch({ type:'SET_SEARCH', payload:{ query:e.target.value } })} />
            </div>

            {/* Category chips */}
            <div style={{ display:'flex', gap:7, flexWrap:'wrap', marginBottom:10 }}>
              {['All', ...CATEGORIES].map((cat) => (
                <button key={cat}
                  className={`cp-chip${state.search.category === cat ? ' active' : ''}`}
                  onClick={() => dispatch({ type:'SET_SEARCH', payload:{ category:cat } })}>
                  {cat !== 'All' ? (CAT_EMOJI[cat] || '💊') + ' ' : ''}{cat}
                </button>
              ))}
            </div>

            {/* Dropdowns + price range */}
            <div className="cp-filter-row">
              <div className="cp-field" style={{ minWidth:180, marginBottom:0 }}>
                <label>Pharmacy</label>
                <select value={state.search.pharmacy}
                  onChange={(e) => dispatch({ type:'SET_SEARCH', payload:{ pharmacy:e.target.value } })}>
                  <option value="All">All</option>
                  {approved.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="cp-field" style={{ minWidth:150, marginBottom:0 }}>
                <label>Brand</label>
                <select value={state.search.brand}
                  onChange={(e) => dispatch({ type:'SET_SEARCH', payload:{ brand:e.target.value } })}>
                  <option value="All">All</option>
                  {brandList().map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="cp-field" style={{ minWidth:150, marginBottom:0 }}>
                <label>Sort</label>
                <select value={state.search.sort}
                  onChange={(e) => dispatch({ type:'SET_SEARCH', payload:{ sort:e.target.value } })}>
                  <option value="newest">Newest</option>
                  <option value="popularity">Popular</option>
                  <option value="priceLow">Price ↑</option>
                  <option value="priceHigh">Price ↓</option>
                  <option value="name">Name A–Z</option>
                </select>
              </div>
              <div className="cp-field" style={{ marginBottom:0 }}>
                <label>Price (₱)</label>
                <div className="cp-price-range">
                  <input type="number" min={0} placeholder="Min"
                    value={state.search.priceMin}
                    onChange={(e) => dispatch({ type:'SET_SEARCH', payload:{ priceMin:e.target.value } })} />
                  <span style={{ color:'var(--cp-walnut-faint)' }}>–</span>
                  <input type="number" min={0} placeholder="Max"
                    value={state.search.priceMax}
                    onChange={(e) => dispatch({ type:'SET_SEARCH', payload:{ priceMax:e.target.value } })} />
                </div>
              </div>
              {hasFilters && (
                <button className="cp-btn cp-btn-outline cp-btn-sm"
                  onClick={() => dispatch({ type:'SET_SEARCH', payload:{ query:'', category:'All', pharmacy:'All', brand:'All', priceMin:'', priceMax:'' } })}>
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Results count */}
          <div className="cp-row-between" style={{ marginBottom:14 }}>
            <h3 style={{ fontFamily:'var(--cp-font-display)', fontSize:16, margin:0, color:'var(--cp-walnut-soft)' }}>
              On the Shelf
            </h3>
            <span style={{ fontSize:12, color:'var(--cp-walnut-faint)' }}>
              {meds.length} result{meds.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Medicine grid */}
          {meds.length === 0
            ? <div className="cp-empty">
                <div className="cp-empty-icon">🏺</div>
                <div className="cp-empty-title">Nothing matches</div>
                <div className="cp-empty-sub">Try a different search or category.</div>
              </div>
            : <div className="cp-masonry" style={{ padding:0 }}>
                {meds.map((m) => {
                  const ph     = DB.pharmacies.find((p) => p.id === m.pharmacyId);
                  const avg    = medRatingAvg(m.id);
                  const cnt    = medReviews(m.id).length;
                  const ss     = stockState(m.stock);
                  const wished = custId ? isWishlisted(custId, m.id) : false;
                  return (
                    <div key={m.id} className="cp-med-card"
                      onClick={() => openMed(m.id)} role="button" tabIndex={0}
                      onKeyDown={(e) => e.key==='Enter' && openMed(m.id)}>

                      {/* Wishlist (customers only) */}
                      {isCustomer && (
                        <button className="cp-wish-btn" aria-pressed={wished}
                          title={wished ? 'Remove from wishlist' : 'Save'}
                          onClick={(e) => { e.stopPropagation(); toggleWishlist(m.id); }}>
                          {wished ? '❤️' : '🤍'}
                        </button>
                      )}

                      <div className="cp-med-card-top">
                        <MedPicture name={m.name} size={72} />
                        <div className="cp-med-card-info">
                          <div className="cp-cat-pill">{CAT_EMOJI[m.category]||'💊'} {m.category}</div>
                          <div className="cp-med-card-name">{m.name}</div>
                          <StarRow avg={avg} count={cnt} />
                        </div>
                      </div>

                      <div className="cp-med-brand">{medBrand(m)}</div>
                      <div style={{ fontSize:12, color:'var(--cp-walnut-faint)' }}>
                        🏥 {ph?.name ?? 'Pharmacy'}
                      </div>

                      {m.prescription
                        ? <div className="cp-stock-line">📜 Rx required</div>
                        : <div className="cp-stock-line">
                            <span className={`cp-dot cp-dot-${ss}`} />
                            {stockText(m.stock)}
                          </div>}

                      <div className="cp-med-card-actions">
                        <span className="cp-med-card-price">{money(m.price)}</span>
                        {isCustomer
                          ? m.prescription
                            ? <span className="cp-badge cp-badge-pending">Rx</span>
                            : <button className="cp-btn cp-btn-primary cp-btn-sm"
                                disabled={m.stock===0}
                                onClick={(e) => { e.stopPropagation(); handleAddToCart(m.id, m.price, m.pharmacyId); }}>
                                {m.stock===0 ? 'Out' : 'Add'}
                              </button>
                          : <button className="cp-btn cp-btn-primary cp-btn-sm"
                              onClick={(e) => { e.stopPropagation(); guestPrompt(); }}>
                              Log in to order
                            </button>}
                      </div>
                    </div>
                  );
                })}
              </div>}

          {!isCustomer && (
            <div style={{ textAlign:'center', marginTop:32, padding:'30px 20px',
              background:'var(--cp-sage-tint)', borderRadius:'var(--cp-radius-lg)' }}>
              <p style={{ margin:'0 0 14px', fontSize:14.5, color:'var(--cp-walnut-soft)' }}>
                Ready to order? Create a free account to add items to your satchel.
              </p>
              <button className="cp-btn cp-btn-primary"
                onClick={() => { dispatch({ type:'SET_AUTH_MODE', mode:'register' }); navigate('/auth'); }}>
                Create account
              </button>
              <span style={{ margin:'0 10px', color:'var(--cp-walnut-faint)' }}>or</span>
              <button className="cp-btn cp-btn-outline" onClick={() => navigate('/auth')}>Log in</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CatalogPage;
