// ============================================================
//  CarePoint — Checkout page
// ============================================================
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DB } from '../../data/db';
import {
  medicine, pharmacy, customer, money, deliveryFeeFor,
  enabledPaymentMethods, pharmacyName,
} from '../../data/helpers';
import { useApp } from '../../context/AppContext';

const CheckoutPage: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch, cartKey, placeOrder, toast } = useApp();

  // Hooks must be called unconditionally (before any early returns)
  const [cardName,    setCardName]    = useState('');
  const [cardNumber,  setCardNumber]  = useState('');
  const [cardExpiry,  setCardExpiry]  = useState('');
  const [cardCvv,     setCardCvv]     = useState('');
  const [eWallet,     setEWallet]     = useState('');
  const [ppEmail,     setPpEmail]     = useState('');

  const custId = state.session.customer;
  if (!custId) { navigate('/auth', { replace: true }); return null; }

  const cart = cartKey ? state.carts[cartKey] : undefined;
  if (!cart || cart.items.length === 0) { navigate('/cart', { replace: true }); return null; }

  const cust      = customer(custId);
  const ph        = pharmacy(cart.pharmacyId);
  const subtotal  = cart.items.reduce((s, it) => s + it.price * it.qty, 0);
  const cfg       = DB.settings;
  const methods   = enabledPaymentMethods();
  const currentMethod = state.checkout.paymentMethod || (methods[0]?.id ?? 'card');
  const delivFee  = state.checkout.fulfillment === 'delivery' ? deliveryFeeFor(subtotal) : 0;
  const total     = subtotal + delivFee;

  function setFulfillment(v: 'pickup'|'delivery') {
    dispatch({ type:'SET_CHECKOUT', payload:{ fulfillment:v } });
  }
  function setAddress(id: string) {
    dispatch({ type:'SET_CHECKOUT', payload:{ addressId: id || null } });
  }
  function setMethod(id: string) {
    dispatch({ type:'SET_CHECKOUT', payload:{ paymentMethod:id } });
  }

  function handlePlaceOrder() {
    if (state.checkout.processing) return;
    if (state.checkout.fulfillment === 'delivery' && !state.checkout.addressId) {
      toast('Select a delivery address.', 'error'); return;
    }
    if (currentMethod === 'card') {
      if (!cardName || !cardNumber || !cardExpiry || !cardCvv) {
        toast('Complete card details (test mode).', 'error'); return;
      }
    } else if (currentMethod === 'gcash' || currentMethod === 'paymaya') {
      if (!eWallet || eWallet.replace(/\D/g,'').length < 10) {
        toast('Enter a valid mobile number.', 'error'); return;
      }
    } else if (currentMethod === 'paypal') {
      if (!ppEmail || !ppEmail.includes('@')) {
        toast('Enter a valid PayPal email.', 'error'); return;
      }
    }
    placeOrder();
    // Navigation to /orders is handled by placeOrder → dispatch({ type:'SET_CUSTOMER', payload:{ view:'orders' }})
    // which triggers the useEffect in HomePage.tsx. Do NOT navigate here — the order hasn't been created yet.
  }

  return (
    <div className="cp-page">
      <div style={{ overflowY: "auto" }}>
        <div style={{ maxWidth:900, margin:'0 auto', padding:'28px 16px 80px' }}>
          <button className="cp-btn-link" onClick={() => navigate('/cart')}>← Back to satchel</button>
          <h2 style={{ fontFamily:'var(--cp-font-display)', fontSize:26, margin:'12px 0 4px' }}>Checkout</h2>
          <p style={{ fontSize:13, color:'var(--cp-walnut-faint)', margin:'0 0 20px' }}>
            From {pharmacyName(cart.pharmacyId)}
          </p>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:16 }}>

            {/* Left: fulfillment + payment */}
            <div className="cp-card">
              <h3 style={{ margin:'0 0 12px', fontSize:15 }}>Fulfillment</h3>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12 }}>
                {cfg.pickupEnabled && (
                  <button className={`cp-chip${state.checkout.fulfillment==='pickup' ? ' active' : ''}`}
                    onClick={() => setFulfillment('pickup')}>🏥 Pickup</button>
                )}
                {cfg.deliveryEnabled && (
                  <button className={`cp-chip${state.checkout.fulfillment==='delivery' ? ' active' : ''}`}
                    onClick={() => setFulfillment('delivery')}>
                    🚚 Delivery ({deliveryFeeFor(subtotal)===0 ? 'free' : '+'+money(deliveryFeeFor(subtotal))})
                  </button>
                )}
              </div>
              {cfg.deliveryEnabled && cfg.freeDeliveryOver > 0 && (
                <p className="cp-hint">Free delivery on orders over {money(cfg.freeDeliveryOver)}.</p>
              )}
              {state.checkout.fulfillment === 'pickup' ? (
                <p className="cp-hint">Pick up at {ph?.location ?? 'the pharmacy'}{ph ? ` — ${ph.hours}` : ''}.</p>
              ) : (
                <div className="cp-field" style={{ marginTop:12 }}>
                  <label>Delivery Address</label>
                  <select value={state.checkout.addressId ?? ''} onChange={(e) => setAddress(e.target.value)}>
                    <option value="">Select address…</option>
                    {cust?.addresses.map((a) => (
                      <option key={a.id} value={a.id}>{a.label} — {a.text}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="cp-divider" />

              <h3 style={{ margin:'0 0 10px', fontSize:15 }}>Payment</h3>
              <div className="cp-pay-chip-row">
                {methods.map((pm) => (
                  <button key={pm.id}
                    className={`cp-chip${currentMethod===pm.id ? ' active' : ''}`}
                    onClick={() => setMethod(pm.id)}>
                    {pm.icon} {pm.label}
                  </button>
                ))}
              </div>

              {/* Payment fields */}
              {currentMethod === 'card' && (
                <>
                  <div className="cp-field"><label>Card name</label>
                    <input type="text" value={cardName} onChange={(e) => setCardName(e.target.value)} placeholder="Juan Dela Cruz" /></div>
                  <div className="cp-field"><label>Card number</label>
                    <input type="text" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} placeholder="4242 4242 4242 4242" /></div>
                  <div style={{ display:'flex', gap:10 }}>
                    <div className="cp-field" style={{ flex:1 }}><label>Expiry</label>
                      <input type="text" value={cardExpiry} onChange={(e) => setCardExpiry(e.target.value)} placeholder="MM/YY" /></div>
                    <div className="cp-field" style={{ flex:1 }}><label>CVV</label>
                      <input type="text" value={cardCvv} onChange={(e) => setCardCvv(e.target.value)} placeholder="123" /></div>
                  </div>
                  <p className="cp-hint">Simulated card payment via Stripe sandbox — no real transaction.</p>
                </>
              )}
              {(currentMethod === 'gcash' || currentMethod === 'paymaya') && (
                <>
                  <div className="cp-field">
                    <label>{currentMethod === 'gcash' ? 'GCash' : 'PayMaya'}-registered mobile</label>
                    <input type="text" value={eWallet} onChange={(e) => setEWallet(e.target.value)} placeholder="09XX XXX XXXX" />
                  </div>
                  <p className="cp-hint">You'll get a one-time PIN in the app to confirm (simulated).</p>
                </>
              )}
              {currentMethod === 'paypal' && (
                <>
                  <div className="cp-field"><label>PayPal email</label>
                    <input type="email" value={ppEmail} onChange={(e) => setPpEmail(e.target.value)} placeholder="you@example.com" /></div>
                  <p className="cp-hint">You'll be redirected to PayPal to confirm (simulated).</p>
                </>
              )}
              {currentMethod === 'cod' && (
                <div className="cp-apo-note">Have the exact amount ready — payment is collected on pickup or delivery.</div>
              )}
            </div>

            {/* Right: order summary */}
            <div className="cp-card" style={{ alignSelf:'start' }}>
              <h3 style={{ margin:'0 0 10px', fontSize:15 }}>Summary</h3>
              {cart.items.map((it) => {
                const m = medicine(it.medId);
                return (
                  <div key={it.medId} className="cp-row-between" style={{ marginBottom:6, fontSize:13.5 }}>
                    <span>{m?.name ?? 'Item'} × {it.qty}</span>
                    <span>{money(it.price * it.qty)}</span>
                  </div>
                );
              })}
              <div className="cp-divider" />
              <div className="cp-row-between"><span>Subtotal</span><span>{money(subtotal)}</span></div>
              <div className="cp-row-between"><span>Delivery</span><span>{money(delivFee)}</span></div>
              <div className="cp-divider" />
              <div className="cp-row-between">
                <strong>Total</strong><strong style={{ fontSize:17 }}>{money(total)}</strong>
              </div>
              <button className="cp-btn cp-btn-gold cp-btn-block" style={{ marginTop:16 }}
                disabled={state.checkout.processing}
                onClick={handlePlaceOrder}>
                {state.checkout.processing
                  ? <><span className="cp-spinner" /> Processing…</>
                  : 'Place Order'}
              </button>
              <button className="cp-btn cp-btn-outline cp-btn-block" style={{ marginTop:8 }}
                disabled={state.checkout.processing}
                onClick={() => navigate('/cart')}>
                Back
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckoutPage;
