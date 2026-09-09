// ============================================================
//  CarePoint — Cart (Satchel) page
// ============================================================
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { medicine, pharmacyName, money } from '../../data/helpers';
import { useApp } from '../../context/AppContext';

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
function getMedVis(name: string) {
  let emoji = '💊', g1 = '#D4D4D4', g2 = '#B8B8B8';
  for (const [k,v] of Object.entries(EMOJI_MAP)) { if (name.includes(k)) { emoji=v; break; } }
  for (const [k,v] of Object.entries(GRAD_MAP))  { if (name.includes(k)) { [g1,g2]=v; break; } }
  return { emoji, g1, g2 };
}

const CartPage: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch, cartKey } = useApp();

  const custId = state.session.customer;
  if (!custId) { navigate('/auth', { replace: true }); return null; }

  const cart = cartKey ? state.carts[cartKey] : undefined;

  if (!cart || cart.items.length === 0) {
    return (
      <div className="cp-page">
        <div style={{ overflowY: "auto" }}>
          <div style={{ maxWidth:700, margin:'0 auto', padding:'28px 16px' }}>
            <button className="cp-btn-link" onClick={() => navigate('/')}>← Back to home</button>
            <h2 style={{ fontFamily:'var(--cp-font-display)', fontSize:26, margin:'12px 0 4px' }}>Satchel</h2>
            <div className="cp-empty">
              <div className="cp-empty-icon">🏺</div>
              <div className="cp-empty-title">Empty</div>
              <div className="cp-empty-sub">Nothing in your satchel yet.</div>
              <button className="cp-btn cp-btn-primary" style={{ marginTop:16 }} onClick={() => navigate('/')}>Browse</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  let subtotal = 0;
  const rows = cart.items.map((it) => {
    const m = medicine(it.medId) ?? { id: it.medId, name: 'Delisted item', price: it.price, stock: 0, prescription: false, sold: 0, addedAt: 0 };
    const line = it.price * it.qty;
    subtotal += line;
    const { emoji, g1, g2 } = getMedVis(m.name);
    return { it, m, line, emoji, g1, g2 };
  });

  function changeQty(medId: string, delta: number) {
    if (!cartKey || !cart) return;
    const item = cart.items.find((i) => i.medId === medId);
    if (!item) return;
    const med = medicine(medId);
    const newQty = item.qty + delta;
    if (newQty <= 0) {
      dispatch({ type:'REMOVE_FROM_CART', cartKey, medId });
    } else if (med && newQty > med.stock) {
      // cap at stock
    } else {
      dispatch({ type:'UPDATE_CART_QTY', cartKey, medId, qty: newQty });
    }
  }

  return (
    <div className="cp-page">
      <div style={{ overflowY: "auto" }}>
        <div style={{ maxWidth:900, margin:'0 auto', padding:'28px 16px 80px' }}>
          <button className="cp-btn-link" onClick={() => navigate('/')}>← Continue shopping</button>
          <h2 style={{ fontFamily:'var(--cp-font-display)', fontSize:26, margin:'12px 0 4px' }}>Satchel</h2>
          <p style={{ fontSize:13, color:'var(--cp-walnut-faint)', margin:'0 0 20px' }}>
            From {pharmacyName(cart.pharmacyId)}
          </p>

          <div className="cp-card">
            <div style={{ fontSize:12, fontWeight:700, color:'var(--cp-sage-dark)', marginBottom:12 }}>
              🏥 {pharmacyName(cart.pharmacyId)}
            </div>
            <div className="cp-table-wrap">
              <table className="cp-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="text-right">Price</th>
                    <th className="text-center">Qty</th>
                    <th className="text-right">Subtotal</th>
                    <th className="col-actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ it, m, line, emoji, g1, g2 }) => (
                    <tr key={it.medId}>
                      <td>
                        <div className="cp-cell-thumb">
                          <div className="cp-med-picture" style={{ width:46, height:46, background:`linear-gradient(140deg,${g1},${g2})`, flexShrink:0 }}>
                            <span style={{ fontSize:22 }}>{emoji}</span>
                          </div>
                          <span className="cell-text" style={{ fontSize:13.5 }}>{m.name}</span>
                        </div>
                      </td>
                      <td className="text-right">{money(it.price)}</td>
                      <td className="text-center">
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                          <button className="cp-btn cp-btn-outline cp-btn-sm" onClick={() => changeQty(it.medId,-1)}>−</button>
                          <span style={{ minWidth:20, textAlign:'center' }}>{it.qty}</span>
                          <button className="cp-btn cp-btn-outline cp-btn-sm" onClick={() => changeQty(it.medId,1)}>+</button>
                        </div>
                      </td>
                      <td className="text-right">{money(line)}</td>
                      <td className="col-actions">
                        <button className="cp-btn cp-btn-outline cp-btn-sm"
                          onClick={() => cartKey && dispatch({ type:'REMOVE_FROM_CART', cartKey, medId:it.medId })}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="cp-card" style={{ maxWidth:320, marginTop:14 }}>
            <div className="cp-row-between"><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
            <div className="cp-hint">Delivery fee calculated at checkout.</div>
            <button className="cp-btn cp-btn-primary cp-btn-block" style={{ marginTop:14 }}
              onClick={() => navigate('/checkout')}>
              Checkout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CartPage;
