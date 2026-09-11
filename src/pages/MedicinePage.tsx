// ============================================================
//  CarePoint — Medicine detail page
//  Gallery · description · specs · ratings · add-to-cart / Rx
// ============================================================
import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DB, counters } from '../data/db';
import {
  medicine, pharmacy, medReviews, medRatingAvg,
  money, stockState, stockText, isWishlisted, productDescription,
  fmtDate, customerName, medBrand,
} from '../data/helpers';
import { useApp } from '../context/AppContext';

// ── Shared helpers (duplicated from HomePage to avoid shared import issues) ──

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
function getMedEmoji(name: string) {
  for (const [k,v] of Object.entries(EMOJI_MAP)) { if (name.includes(k)) return v; }
  return '💊';
}
function getMedGrad(name: string): [string,string] {
  for (const [k,v] of Object.entries(GRAD_MAP)) { if (name.includes(k)) return v; }
  return ['#D4D4D4','#B8B8B8'];
}

function StarRow({ avg, count, size=14 }: { avg:number; count?:number; size?:number }) {
  const full = Math.round(avg);
  return (
    <span className="cp-stars">
      {[1,2,3,4,5].map((i) => (
        <span key={i} className={`cp-star ${i<=full?'cp-star-filled':'cp-star-empty'}`}
          style={{ fontSize:size }}>★</span>
      ))}
      {count !== undefined && count > 0 && <span className="cp-star-count">({count})</span>}
    </span>
  );
}

// ── Star picker for submitting a review ──────────────────────
function StarPicker({ value, onChange }: { value:number; onChange:(n:number)=>void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="cp-star-input" role="radiogroup" aria-label="Rating">
      {[1,2,3,4,5].map((i) => (
        <span key={i}
          style={{ fontSize:26, cursor:'pointer', color:(hover||value)>=i ? 'var(--cp-yarrow)' : 'var(--cp-stone-dark)', transition:'transform .1s ease', display:'inline-block' }}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(i)}
          role="radio" aria-checked={value===i}
          aria-label={`${i} star${i===1?'':'s'}`}>
          ★
        </span>
      ))}
    </div>
  );
}

const MedicinePage: React.FC = () => {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { state, dispatch, addToCart, cartKey, toast } = useApp();

  const m    = id ? medicine(id) : undefined;
  const med  = m as NonNullable<typeof m>;   // safe after the null-guard below
  const ph   = m ? pharmacy(m.pharmacyId) : undefined;
  const isCustomer = state.activeRole === 'customer' && !!state.session.customer;
  const custId     = state.session.customer;

  const [galleryIdx, setGalleryIdx] = useState(0);
  const [reviewRating, setReviewRating] = useState(5);
  // Use shared AppContext lightbox so zoom state is global
  const lightboxSrc    = state.lightbox?.src    ?? null;
  const lightboxZoomed = state.lightbox?.zoomed ?? false;

  function openLightbox(src: string) {
    dispatch({ type: 'SET_LIGHTBOX', lightbox: { src, zoomed: false } });
  }
  function closeLightbox() {
    dispatch({ type: 'SET_LIGHTBOX', lightbox: null });
  }

  if (!m) {
    return (
      <div className="cp-page">
        <div style={{ overflowY: "auto" }}>
          <div className="cp-empty">
            <div className="cp-empty-icon">🏺</div>
            <div className="cp-empty-title">Medicine not found</div>
            <button className="cp-btn cp-btn-primary" style={{ marginTop:14 }} onClick={() => navigate(-1)}>
              Go back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // m is guaranteed defined after this point
  const reviews = medReviews(med.id).slice().sort((a,b) => b.at.getTime()-a.at.getTime());
  const avg     = medRatingAvg(med.id);
  const ss      = stockState(med.stock);
  const wished  = custId ? isWishlisted(custId, med.id) : false;
  const [g1,g2] = getMedGrad(med.name);
  const emoji   = getMedEmoji(med.name);

  // Gallery slots: main picture + "Label / In Use / How to use" placeholders
  const gallerySlots = [
    { label:'Front',      emoji, g1, g2 },
    { label:'Label',      emoji:'🏷️', g1:'#EEE8E0', g2:'#DDD4C8' },
    { label:'In Use',     emoji:'👐', g1:'#E0EEE8', g2:'#C8DDD4' },
    { label:'How to Use', emoji:'📋', g1:'#E8E8EE', g2:'#C8C8DD' },
  ];

  // ── Add to cart ─────────────────────────────────────────────
  function handleAddToCart() {
    if (!isCustomer || !cartKey) { toast('Log in to order.','error'); navigate('/auth'); return; }
    if (med.prescription || med.stock === 0) return;
    const cart = state.carts[cartKey];
    if (cart && cart.pharmacyId !== med.pharmacyId && cart.items.length > 0) {
      if (!window.confirm('Your satchel has items from another pharmacy. Clear and start a new order?')) return;
    }
    addToCart(med.id, med.price, med.pharmacyId);
    toast(`${med.name} added to satchel.`, 'success');
  }

  // ── Prescription inquiry ────────────────────────────────────
  function newPrescriptionInquiry() {
    if (!isCustomer || !custId) { navigate('/auth'); return; }
    const tid = 't' + counters.thread++;
    DB.threads.push({
      id: tid, pharmacyId: med.pharmacyId, customerId: custId,
      type: 'prescription', medId: med.id,
      subject: `Question about ${med.name}`,
      status: 'open',
      unreadForCustomer: false, unreadForStaff: false, messages: [],
    });
    navigate('/messages');
  }

  // ── Wishlist toggle ─────────────────────────────────────────
  function toggleWishlist() {
    if (!custId) { navigate('/auth'); return; }
    const c = DB.customers.find((cx) => cx.id === custId);
    if (!c) return;
    if (!c.wishlist) c.wishlist = [];
    const i = c.wishlist.indexOf(med.id);
    if (i > -1) { c.wishlist.splice(i,1); toast('Removed from wishlist.','success'); }
    else         { c.wishlist.push(med.id);  toast('Saved to wishlist.','success'); }
    dispatch({ type:'SET_SEARCH', payload:{} });
  }

  // ── Rating eligibility ──────────────────────────────────────
  const eligibleOrder = custId ? DB.orders.find((o) =>
    o.customerId === custId &&
    o.status === 'completed' &&
    o.items.some((it) => it.medId === med.id) &&
    !DB.reviews.some((r) => r.customerId === custId && r.medId === med.id && r.orderId === o.id)
  ) : undefined;

  const hasOpenOrder = custId ? DB.orders.some((o) =>
    o.customerId === custId &&
    o.status !== 'cancelled' && o.status !== 'completed' &&
    o.items.some((it) => it.medId === med.id)
  ) : false;

  const alreadyRated = custId ? DB.reviews.some((r) =>
    r.customerId === custId && r.medId === med.id
  ) : false;

  function submitReview() {
    if (!custId || !eligibleOrder) return;
    const key = `${med.id}|${eligibleOrder.id}`;
    const rating = (state.reviewDraft[key]?.rating) ?? reviewRating;
    DB.reviews.push({
      id: 'rv' + counters.review++,
      medId: med.id, customerId: custId,
      orderId: eligibleOrder.id,
      rating: Math.min(5, Math.max(1, rating)),
      at: new Date(),
    });
    dispatch({ type:'CLEAR_REVIEW_DRAFT', key });
    toast('Thank you for your rating! 🌟', 'success');
    dispatch({ type:'SET_SEARCH', payload:{} });
  }

  return (
    <div className="cp-page">
      <div style={{ overflowY: "auto" }}>

        {/* Lightbox */}
        {lightboxSrc && (
          <div className="cp-lightbox-overlay" onClick={closeLightbox}>
            <button className="cp-lightbox-close" onClick={closeLightbox}>✕</button>
            <button
              className="cp-lightbox-zoom"
              onClick={(e) => { e.stopPropagation(); dispatch({ type: 'TOGGLE_LIGHTBOX_ZOOM' }); }}
              title={lightboxZoomed ? 'Zoom out' : 'Zoom in'}
            >
              {lightboxZoomed ? '🔍−' : '🔍+'}
            </button>
            <div className="cp-lightbox-inner" onClick={(e) => e.stopPropagation()}>
              <img
                className={lightboxZoomed ? 'zoomed' : 'fit'}
                src={lightboxSrc}
                alt="preview"
                onClick={() => dispatch({ type: 'TOGGLE_LIGHTBOX_ZOOM' })}
                style={{ cursor: lightboxZoomed ? 'zoom-out' : 'zoom-in' }}
              />
            </div>
          </div>
        )}

        {/* Sticky bar */}
        <header style={{ background:'rgba(250,247,242,0.9)', backdropFilter:'blur(10px)',
          borderBottom:'1px solid var(--cp-stone-dark)', position:'sticky', top:0, zIndex:50 }}>
          <div style={{ maxWidth:700, margin:'0 auto', padding:'12px 16px', display:'flex', alignItems:'center', gap:10 }}>
            <button className="cp-btn-link" onClick={() => navigate(-1)}>← Back</button>
            <div style={{ flex:1, fontFamily:'var(--cp-font-display)', fontSize:15, fontWeight:600,
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'var(--cp-walnut)' }}>
              {med.name}
            </div>
            {isCustomer && (
              <button className="cp-wish-btn" style={{ position:'static', boxShadow:'none' }}
                aria-pressed={wished} onClick={toggleWishlist}>
                {wished ? '❤️' : '🤍'}
              </button>
            )}
          </div>
        </header>

        <div style={{ maxWidth:700, margin:'0 auto', padding:'20px 16px 80px' }}>

          {/* ── Card 1: Product ── */}
          <div className="cp-card">
            {/* Category pill */}
            <div className="cp-cat-pill" style={{ marginBottom:10 }}>
              💊 {med.category}
            </div>
            <div className="cp-med-brand" style={{ marginBottom:8 }}>
              {medBrand(med)}
            </div>

            {/* Gallery */}
            <div style={{ textAlign:'center', marginBottom:16 }}>
              {/* Main image — click to open lightbox */}
              <div className="cp-med-picture cp-med-picture-lg"
                style={{ width:140, height:140, margin:'0 auto 12px',
                  background:`linear-gradient(140deg,${gallerySlots[galleryIdx].g1},${gallerySlots[galleryIdx].g2})`,
                  cursor:'zoom-in' }}
                onClick={() => {
                  // If the medicine has a real image URL at this index, prefer it
                  const realImg = med.images?.[galleryIdx];
                  if (realImg) { openLightbox(realImg); }
                }}>
                <span className="cp-med-emoji" style={{ fontSize:64 }}>{gallerySlots[galleryIdx].emoji}</span>
                <span className="cp-med-label">{gallerySlots[galleryIdx].label}</span>
              </div>
              {/* Thumbnails */}
              <div style={{ display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap' }}>
                {gallerySlots.map((slot, i) => (
                  <button key={i}
                    style={{ padding:0, border:`2px solid ${i===galleryIdx ? 'var(--cp-terracotta)' : 'transparent'}`,
                      borderRadius:10, background:'none', opacity:i===galleryIdx ? 1 : 0.55,
                      transition:'opacity .15s ease', cursor:'pointer' }}
                    onClick={() => setGalleryIdx(i)}>
                    <div style={{ width:46, height:46, borderRadius:9,
                      background:`linear-gradient(140deg,${slot.g1},${slot.g2})`,
                      display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>
                      {slot.emoji}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Name + rating */}
            <h1 className="cp-med-full-name">{med.name}</h1>
            <div style={{ marginBottom:10 }}><StarRow avg={avg} count={reviews.length} size={16} /></div>
            <p style={{ fontSize:13, color:'var(--cp-walnut-faint)', margin:'0 0 14px' }}>
              Sold by{' '}
              <strong style={{ color:'var(--cp-terracotta-dark)' }}>{ph?.name ?? 'Pharmacy'}</strong>
            </p>

            {/* Price + stock */}
            <div className="cp-row-between" style={{ marginBottom:16 }}>
              <span className="cp-med-full-price">{money(med.price)}</span>
              {med.prescription
                ? <span className="cp-badge cp-badge-pending">Rx required</span>
                : <div className="cp-stock-line">
                    <span className={`cp-dot cp-dot-${ss}`} />
                    {stockText(med.stock)}
                  </div>}
            </div>

            {/* CTA */}
            {med.prescription ? (
              <>
                <div className="cp-apo-note">📜 This needs a prescription. Message the pharmacist to ask.</div>
                {isCustomer && (
                  <button className="cp-btn cp-btn-outline" style={{ marginTop:8 }}
                    onClick={newPrescriptionInquiry}>
                    📜 Ask the pharmacist
                  </button>
                )}
              </>
            ) : isCustomer ? (
              <button className="cp-btn cp-btn-primary" style={{ width:'100%' }}
                disabled={med.stock===0} onClick={handleAddToCart}>
                {med.stock===0 ? 'Out of stock' : '🛒 Add to Satchel'}
              </button>
            ) : (
              <>
                <button className="cp-btn cp-btn-primary" style={{ width:'100%' }}
                  onClick={() => navigate('/auth')}>
                  🛒 Log in to order
                </button>
                <p className="cp-hint" style={{ marginTop:8, textAlign:'center' }}>
                  Browsing is free — an account is only needed to order or message the pharmacist.
                </p>
              </>
            )}
          </div>

          {/* ── Card 2: Description + Specs ── */}
          <div className="cp-card" style={{ marginTop:14 }}>
            <h3 style={{ margin:'0 0 8px', fontSize:15 }}>Description</h3>
            <p style={{ fontSize:14, color:'var(--cp-walnut-soft)', lineHeight:1.6, marginBottom:16 }}>
              {productDescription(med)}
            </p>
            {med.specs && Object.keys(med.specs).length > 0 && (
              <>
                <h3 style={{ margin:'0 0 8px', fontSize:15 }}>Specifications</h3>
                <div className="cp-specs">
                  {Object.entries(med.specs).map(([k,v]) => (
                    <div key={k} className="cp-spec-row">
                      <span className="cp-spec-key">{k}</span>
                      <span className="cp-spec-val">{v}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ── Card 3: Ratings ── */}
          <div className="cp-card" style={{ marginTop:14 }}>
            <h3 style={{ margin:'0 0 10px', fontSize:15 }}>Ratings</h3>

            {/* Review form — only for eligible customers */}
            {isCustomer && eligibleOrder && (
              <div className="cp-card" style={{ background:'var(--cp-parchment)', marginBottom:14 }}>
                <div style={{ fontSize:12.5, fontWeight:700, color:'var(--cp-walnut-soft)', marginBottom:8 }}>
                  Rate this product (Order #{eligibleOrder.id.replace('o','')})
                </div>
                <StarPicker
                  value={state.reviewDraft[`${med.id}|${eligibleOrder.id}`]?.rating ?? reviewRating}
                  onChange={(r) => {
                    setReviewRating(r);
                    dispatch({ type:'SET_REVIEW_RATING', key:`${med.id}|${eligibleOrder.id}`, rating:r });
                  }} />
                <button className="cp-btn cp-btn-primary cp-btn-sm" style={{ marginTop:10 }}
                  onClick={submitReview}>
                  Submit Rating
                </button>
              </div>
            )}

            {isCustomer && !eligibleOrder && (
              <div className="cp-apo-note" style={{ marginBottom:12 }}>
                {hasOpenOrder
                  ? 'You can rate this once your order is completed or you confirm you received it.'
                  : alreadyRated
                  ? 'Thanks — you have already rated this remedy. Order it again to rate it again.'
                  : 'Only customers who received this remedy can rate it.'}
              </div>
            )}

            {reviews.length === 0
              ? <p className="cp-hint">No ratings yet — only customers who received this remedy can rate it.</p>
              : reviews.map((r) => (
                <div key={r.id} style={{ padding:'12px 0', borderBottom:'1px solid var(--cp-stone)' }}>
                  <div className="cp-row-between">
                    <span style={{ fontWeight:700, fontSize:13 }}>
                      {customerName(r.customerId)}
                    </span>
                    <StarRow avg={r.rating} size={13} />
                  </div>
                  <div style={{ fontSize:11, color:'var(--cp-walnut-faint)', marginTop:3 }}>{fmtDate(r.at)}</div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MedicinePage;
