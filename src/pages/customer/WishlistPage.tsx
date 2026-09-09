// ============================================================
//  CarePoint — Wishlist page
// ============================================================
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { DB } from '../../data/db';
import { medicine, pharmacyName, money, medRatingAvg, stockState, stockText } from '../../data/helpers';
import { useApp } from '../../context/AppContext';

const EMOJI_MAP:Record<string,string>={Paracetamol:'💊',Ibuprofen:'💊',Cetirizine:'💊',Amoxicillin:'💊','Cough Syrup':'🍯','Oral Rehydration':'🧂','Vitamin C':'🍊',Multivitamins:'🥗',Antiseptic:'🧴',Hydrocortisone:'🧴',Salbutamol:'💨',Echinacea:'🌿',Ginger:'🍯'};
const GRAD_MAP:Record<string,[string,string]>={Paracetamol:['#E8D5B7','#D4BFA0'],Ibuprofen:['#E8D5B7','#D4BFA0'],Cetirizine:['#D4E0D8','#B8C9BE'],Amoxicillin:['#F5E3D4','#E8CDB8'],'Cough Syrup':['#F0D4B0','#E0BC8A'],'Oral Rehydration':['#D4E8E0','#B8D4C8'],'Vitamin C':['#F5E0B0','#E8CC8A'],Multivitamins:['#D4E8D0','#B8D4B0'],Antiseptic:['#D0E0E8','#B0C8D4'],Hydrocortisone:['#E8DDE0','#D4C4C8'],Salbutamol:['#D0E0F0','#B0C8E0'],Echinacea:['#D4E8D8','#B0C8B8'],Ginger:['#E8D8B8','#D4C4A0']};
function vis(name:string){let e='💊',g1='#D4D4D4',g2='#B8B8B8';for(const[k,v]of Object.entries(EMOJI_MAP)){if(name.includes(k)){e=v;break;}}for(const[k,v]of Object.entries(GRAD_MAP)){if(name.includes(k)){[g1,g2]=v;break;}}return{e,g1,g2};}

function StarRow({avg}:{avg:number}) {
  const f=Math.round(avg);
  return <span className="cp-stars">{[1,2,3,4,5].map(i=><span key={i} className={`cp-star ${i<=f?'cp-star-filled':'cp-star-empty'}`}>★</span>)}</span>;
}

const WishlistPage: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch, addToCart, cartKey, toast } = useApp();
  const custId = state.session.customer;
  if (!custId) { navigate('/auth', { replace:true }); return null; }

  const cust = DB.customers.find((c) => c.id === custId);
  const items = (cust?.wishlist ?? []).map((id) => medicine(id)).filter(Boolean) as ReturnType<typeof medicine>[];

  function removeWish(medId: string) {
    if (!cust) return;
    cust.wishlist = cust.wishlist.filter((w) => w !== medId);
    toast('Removed from wishlist.', 'success');
    dispatch({ type:'SET_SEARCH', payload:{} });
  }

  function handleAdd(medId: string, price: number, pharmacyId: string) {
    if (!cartKey) return;
    const cart = state.carts[cartKey];
    const med  = medicine(medId);
    if (!med || med.prescription || med.stock === 0) return;
    if (cart && cart.pharmacyId !== pharmacyId && cart.items.length > 0) {
      if (!window.confirm('Your satchel has items from another pharmacy. Clear and start a new order?')) return;
    }
    addToCart(medId, price, pharmacyId);
    toast(`${med.name} added.`, 'success');
  }

  return (
    <div className="cp-page">
      <div style={{ overflowY: "auto" }}>
        <div style={{ maxWidth:900, margin:'0 auto', padding:'28px 16px 80px' }}>
          <button className="cp-btn-link" onClick={() => navigate('/')}>← Home</button>
          <h2 style={{ fontFamily:'var(--cp-font-display)', fontSize:26, margin:'12px 0 4px' }}>Wishlist</h2>
          <p style={{ fontSize:13, color:'var(--cp-walnut-faint)', margin:'0 0 20px' }}>
            {items.length} item{items.length !== 1 ? 's' : ''} saved.
          </p>
          {items.length === 0
            ? <div className="cp-empty">
                <div className="cp-empty-icon">🤍</div>
                <div className="cp-empty-title">Nothing saved</div>
                <div className="cp-empty-sub">Tap the heart on any product to keep it here.</div>
                <button className="cp-btn cp-btn-primary" style={{ marginTop:16 }} onClick={() => navigate('/')}>Browse</button>
              </div>
            : <div className="cp-masonry" style={{ padding:0 }}>
                {items.map((m) => {
                  if (!m) return null;
                  const {e,g1,g2} = vis(m.name);
                  const avg = medRatingAvg(m.id);
                  const ss  = stockState(m.stock);
                  return (
                    <div key={m.id} className="cp-med-card" style={{ position:'relative' }}
                      onClick={() => navigate(`/medicine/${m.id}`)} role="button" tabIndex={0}>
                      <button className="cp-wish-btn" aria-pressed title="Remove" style={{ color:'var(--cp-danger)' }}
                        onClick={(e2) => { e2.stopPropagation(); removeWish(m.id); }}>❤️</button>
                      <div className="cp-med-card-top">
                        <div className="cp-med-picture" style={{ width:72,height:72,background:`linear-gradient(140deg,${g1},${g2})` }}>
                          <span className="cp-med-emoji">{e}</span>
                          <span className="cp-med-label">{m.name.split(' ').slice(0,2).join(' ')}</span>
                        </div>
                        <div className="cp-med-card-info">
                          <div className="cp-cat-pill">💊 {m.category}</div>
                          <div className="cp-med-card-name">{m.name}</div>
                          <StarRow avg={avg} />
                        </div>
                      </div>
                      <div style={{ fontSize:12, color:'var(--cp-walnut-faint)' }}>🏥 {pharmacyName(m.pharmacyId)}</div>
                      {m.prescription
                        ? <div className="cp-stock-line">📜 Rx required</div>
                        : <div className="cp-stock-line"><span className={`cp-dot cp-dot-${ss}`} />{stockText(m.stock)}</div>}
                      <div className="cp-med-card-actions">
                        <span className="cp-med-card-price">{money(m.price)}</span>
                        {!m.prescription && (
                          <button className="cp-btn cp-btn-primary cp-btn-sm"
                            disabled={m.stock===0}
                            onClick={(e2) => { e2.stopPropagation(); handleAdd(m.id,m.price,m.pharmacyId); }}>
                            {m.stock===0 ? 'Out' : 'Add'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>}
        </div>
      </div>
    </div>
  );
};

export default WishlistPage;
