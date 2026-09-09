// ============================================================
//  CarePoint — My Orders + Order Detail
// ============================================================
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DB, counters } from '../../data/db';
import {
  order, medicine, pharmacy, pharmacyName,
  money, orderTotal, fmtDate, STATUS_LABEL, STATUS_FLOW,
  orderReturn, orderAddressText, RETURN_LABEL,
} from '../../data/helpers';
import { useApp } from '../../context/AppContext';

// ── Shared helpers ───────────────────────────────────────────
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
  let emoji='💊',g1='#D4D4D4',g2='#B8B8B8';
  for (const [k,v] of Object.entries(EMOJI_MAP)) { if (name.includes(k)){emoji=v;break;} }
  for (const [k,v] of Object.entries(GRAD_MAP))  { if (name.includes(k)){[g1,g2]=v;break;} }
  return {emoji,g1,g2};
}

function StarRow({avg,count=0,size=13}:{avg:number;count?:number;size?:number}) {
  const full=Math.round(avg);
  return (
    <span className="cp-stars">
      {[1,2,3,4,5].map(i=>(
        <span key={i} className={`cp-star ${i<=full?'cp-star-filled':'cp-star-empty'}`} style={{fontSize:size}}>★</span>
      ))}
      {count>0&&<span className="cp-star-count">({count})</span>}
    </span>
  );
}

function StarPicker({value,onChange}:{value:number;onChange:(n:number)=>void}) {
  const [hover,setHover]=useState(0);
  return (
    <div style={{display:'inline-flex',gap:4}}>
      {[1,2,3,4,5].map(i=>(
        <span key={i} style={{fontSize:24,cursor:'pointer',
          color:(hover||value)>=i?'var(--cp-yarrow)':'var(--cp-stone-dark)'}}
          onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(0)}
          onClick={()=>onChange(i)}>★</span>
      ))}
    </div>
  );
}

// ── Bloom timeline ───────────────────────────────────────────
function BloomTimeline({ o }: { o: ReturnType<typeof order> }) {
  if (!o) return null;
  if (o.status === 'cancelled') {
    return (
      <div className="cp-apo-note" style={{ background:'var(--cp-danger-tint)', borderColor:'#E0BDB4', transform:'rotate(0.4deg)', color:'var(--cp-danger)', fontWeight:600 }}>
        This order was cancelled.
      </div>
    );
  }
  const flowers = ['🌱','🌿','🌸','🌺'];
  const idx = Math.max(0, STATUS_FLOW.indexOf(o.status));
  const pct = (idx / (STATUS_FLOW.length - 1)) * 100;
  return (
    <div className="cp-bloom-line">
      <div className="cp-bloom-stem"><div className="cp-bloom-fill" style={{ width:`${pct}%` }} /></div>
      <div className="cp-bloom-steps">
        {STATUS_FLOW.map((s, i) => (
          <div key={s} className={`cp-bloom-step${i<idx?' done':''}${i===idx?' current':''}`}>
            <span className="flower-icon">{i<=idx ? flowers[Math.min(i,3)] : '🌱'}</span>
            <div className="cp-bloom-label">{STATUS_LABEL[s]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Order list ───────────────────────────────────────────────
function OrderList({ custId, onOpen }: { custId:string; onOpen:(id:string)=>void }) {
  const myOrders = DB.orders
    .filter((o) => o.customerId === custId)
    .sort((a,b) => b.createdAt.getTime() - a.createdAt.getTime());

  if (myOrders.length === 0) {
    return (
      <div className="cp-empty">
        <div className="cp-empty-icon">🧾</div>
        <div className="cp-empty-title">No orders yet</div>
      </div>
    );
  }
  return (
    <div className="cp-card">
      <div className="cp-table-wrap">
        <table className="cp-table">
          <thead>
            <tr>
              <th>Order</th><th>Pharmacy</th><th>Fulfillment</th>
              <th className="text-right">Total</th><th className="text-center">Status</th>
              <th>Placed</th><th className="col-actions"></th>
            </tr>
          </thead>
          <tbody>
            {myOrders.map((o) => (
              <tr key={o.id}>
                <td>#{o.id.replace('o','')}</td>
                <td>{pharmacyName(o.pharmacyId)}</td>
                <td style={{ textTransform:'capitalize' }}>{o.fulfillment}</td>
                <td className="text-right">{money(orderTotal(o))}</td>
                <td className="text-center">
                  <span className={`cp-badge cp-badge-${o.status}`}>{STATUS_LABEL[o.status]}</span>
                </td>
                <td style={{ fontSize:12.5 }}>{fmtDate(o.createdAt)}</td>
                <td className="col-actions">
                  <button className="cp-btn cp-btn-outline cp-btn-sm" onClick={() => onOpen(o.id)}>View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Order detail ─────────────────────────────────────────────
function OrderDetail({ orderId, custId, onBack }: { orderId:string; custId:string; onBack:()=>void }) {
  const navigate = useNavigate();
  const { dispatch, toast } = useApp();
  const [reviewRatings, setReviewRatings] = useState<Record<string,number>>({});

  const o = order(orderId)!;
  if (!(order(orderId))) return <div className="cp-empty"><div className="cp-empty-title">Order not found.</div></div>;

  const ph = pharmacy(o.pharmacyId);
  const ret = orderReturn(orderId);
  const relatedThread = DB.threads.find((t) => t.orderId === orderId);
  const canConfirm = o.customerId === custId && (o.status === 'ready' || o.status === 'confirmed');

  function confirmReceived() {
    if (!o) return;
    if (o.status === 'completed') { toast('Already completed.','error'); return; }
    o.status = 'completed';
    toast('Order received — you can rate these medicines now. 🌿', 'success');
    dispatch({ type:'SET_SEARCH', payload:{} });
  }

  function requestReturn() {
    if (!o) return;
    if (ret) { toast('A return is already on file.','error'); return; }
    const days = (Date.now() - o.createdAt.getTime()) / 864e5;
    if (days > DB.settings.returnWindowDays) {
      toast(`The ${DB.settings.returnWindowDays}-day return window has closed.`,'error'); return;
    }
    const reason = window.prompt('Why are you returning this order?');
    if (!reason?.trim()) return;
    DB.returns.push({
      id: 'r' + counters.ret++, orderId, customerId: o.customerId,
      pharmacyId: o.pharmacyId, reason: reason.trim(),
      status: 'requested', at: new Date(),
    } as any);
    toast('Return request sent to the pharmacy.', 'success');
    dispatch({ type:'SET_SEARCH', payload:{} });
  }

  function newMessage() {
    if (relatedThread) { navigate('/messages'); return; }
    const tid = 't' + counters.thread++;
    DB.threads.push({
      id: tid, pharmacyId: o.pharmacyId, customerId: o.customerId,
      type: 'order', orderId: o.id,
      subject: `Question about Order #${o.id.replace('o','')}`,
      status: 'open', unreadForCustomer: false, unreadForStaff: false, messages: [],
    } as any);
    navigate('/messages');
  }

  function submitReview(medId: string) {
    const rating = reviewRatings[medId] ?? 5;
    const eligible = DB.orders.find((ord) =>
      ord.customerId === custId && ord.status === 'completed' &&
      ord.items.some((it) => it.medId === medId) &&
      !DB.reviews.some((r) => r.customerId === custId && r.medId === medId && r.orderId === ord.id)
    );
    if (!eligible) { toast('Rate from a completed order.','error'); return; }
    DB.reviews.push({ id:'rv'+counters.review++, medId, customerId:custId, orderId:eligible.id, rating, at:new Date() });
    toast('Thank you for your rating! 🌟','success');
    dispatch({ type:'SET_SEARCH', payload:{} });
  }

  return (
    <div>
      <button className="cp-btn-link" onClick={onBack}>← Back to orders</button>
      <div className="cp-card" style={{ marginTop:14 }}>
        <div className="cp-row-between">
          <h2 style={{ fontFamily:'var(--cp-font-display)', fontSize:22, margin:0 }}>
            Order #{o.id.replace('o','')}
          </h2>
          <span className={`cp-badge cp-badge-${o.status}`}>{STATUS_LABEL[o.status]}</span>
        </div>
        <p style={{ fontSize:13, color:'var(--cp-walnut-faint)', margin:'4px 0 14px' }}>
          {pharmacyName(o.pharmacyId)} · Placed {fmtDate(o.createdAt)}
        </p>

        <BloomTimeline o={o} />
        <div className="cp-divider" />

        <table className="cp-table">
          <thead><tr><th>Item</th><th className="text-center">Qty</th><th className="text-right">Subtotal</th></tr></thead>
          <tbody>
            {o.items.map((it) => {
              const m = medicine(it.medId) ?? { id:it.medId, name:'Delisted item', price:it.price, stock:0 };
              const { emoji, g1, g2 } = getMedVis(m.name);
              return (
                <tr key={it.medId}>
                  <td>
                    <div className="cp-cell-thumb">
                      <div className="cp-med-picture" style={{ width:42, height:42, background:`linear-gradient(140deg,${g1},${g2})`, flexShrink:0 }}>
                        <span style={{ fontSize:20 }}>{emoji}</span>
                      </div>
                      <span>{m.name}</span>
                    </div>
                  </td>
                  <td className="text-center">{it.qty}</td>
                  <td className="text-right">{money(it.price*it.qty)}</td>
                </tr>
              );
            })}
            <tr>
              <td colSpan={2}><strong>Total</strong></td>
              <td className="text-right"><strong>{money(orderTotal(o))}</strong></td>
            </tr>
          </tbody>
        </table>

        <div className="cp-divider" />
        <p style={{ fontSize:14 }}><strong>Fulfillment:</strong> {o.fulfillment==='pickup' ? `Pickup at ${ph?.location ?? 'the pharmacy'}` : `Delivery to ${orderAddressText(o)}`}</p>
        <p style={{ fontSize:14 }}><strong>Payment:</strong> {o.paymentLabel ?? 'Card (test mode)'}</p>

        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:12 }}>
          <button className="cp-btn cp-btn-outline" onClick={newMessage}>📜 Message pharmacist</button>
          {canConfirm && (
            <button className="cp-btn cp-btn-sage" onClick={confirmReceived}>🍃 I received this order</button>
          )}
          {o.status === 'completed' && !ret && (
            <button className="cp-btn cp-btn-outline" onClick={requestReturn}>↩️ Request return / refund</button>
          )}
        </div>

        {ret && (
          <div className="cp-apo-note" style={{ marginTop:10 }}>
            <strong>Return {RETURN_LABEL[ret.status]}</strong> — {ret.reason}
            {(ret as any).refundAmount != null && ` · ${money((ret as any).refundAmount)} refunded`}
          </div>
        )}
        {canConfirm && (
          <p className="cp-hint" style={{ marginTop:6 }}>Confirming receipt completes the order and unlocks rating for these items.</p>
        )}
      </div>

      {/* Rating section */}
      <div className="cp-card" style={{ marginTop:14 }}>
        <h3 style={{ margin:'0 0 10px', fontSize:15 }}>Rate your medicines</h3>
        {o.status !== 'completed'
          ? <p className="cp-hint">You can rate these once the order is completed or you confirm you received them.</p>
          : o.items.map((it) => {
              const m = medicine(it.medId) ?? { id:it.medId, name:'Delisted item', price:it.price, stock:0 };
              const existing = DB.reviews.find((r) => r.medId===it.medId && r.customerId===custId && r.orderId===o.id);
              const { emoji, g1, g2 } = getMedVis(m.name);
              return (
                <div key={it.medId} style={{ padding:'12px 0', borderBottom:'1px solid var(--cp-stone)' }}>
                  <div className="cp-cell-thumb" style={{ marginBottom:8 }}>
                    <div className="cp-med-picture" style={{ width:42,height:42,background:`linear-gradient(140deg,${g1},${g2})`,flexShrink:0 }}>
                      <span style={{fontSize:20}}>{emoji}</span>
                    </div>
                    <strong style={{ fontSize:13.5 }}>{m.name}</strong>
                  </div>
                  {existing
                    ? <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <StarRow avg={existing.rating} size={15} />
                        <span className="cp-hint">Your rating · {fmtDate(existing.at)}</span>
                      </div>
                    : <>
                        <StarPicker
                          value={reviewRatings[it.medId] ?? 5}
                          onChange={(r) => setReviewRatings((prev) => ({ ...prev, [it.medId]:r }))} />
                        <button className="cp-btn cp-btn-primary cp-btn-sm" style={{ marginTop:8 }}
                          onClick={() => submitReview(it.medId)}>
                          Submit Rating
                        </button>
                      </>}
                </div>
              );
            })}
      </div>
    </div>
  );
}

// ── Page wrapper ─────────────────────────────────────────────
const OrdersPage: React.FC = () => {
  const navigate = useNavigate();
  const { state } = useApp();
  const [openId, setOpenId] = useState<string|null>(null);

  const custId = state.session.customer;
  if (!custId) { navigate('/auth', { replace:true }); return null; }

  return (
    <div className="cp-page">
      <div style={{ overflowY: "auto" }}>
        <div style={{ maxWidth:900, margin:'0 auto', padding:'28px 16px 80px' }}>
          {openId
            ? <OrderDetail orderId={openId} custId={custId} onBack={() => setOpenId(null)} />
            : <>
                <button className="cp-btn-link" onClick={() => navigate('/')}>← Home</button>
                <h2 style={{ fontFamily:'var(--cp-font-display)', fontSize:26, margin:'12px 0 20px' }}>My Orders</h2>
                <OrderList custId={custId} onOpen={setOpenId} />
              </>}
        </div>
      </div>
    </div>
  );
};

export default OrdersPage;
