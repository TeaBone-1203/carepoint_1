// ============================================================
//  CarePoint — Branch Portal (Staff / Pharmacy Admin)
//  Tabs: Workbench · Shelf · Inventory · Returns · Counter · Sales · Notices · Profile
// ============================================================
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PharmacyMapStaff } from '../components/PharmacyMap';
import { DB, counters } from '../data/db';
import {
  medicine, pharmacy, staffMember, order,
  pharmacyMedicines, lowStockMedicines, outOfStockMedicines,
  lowStockThreshold, isLowStock, productStatus,
  PRODUCT_STATUS_LABEL, PRODUCT_STATUS_BADGE,
  orderTotal, fmtDate, money, STATUS_FLOW, STATUS_LABEL,
  CATEGORIES, customerName,
  pharmacyReturns, orderReturn, RETURN_LABEL, RETURN_BADGE,
  unreadForStaffPharmacy, notifTemplates, NOTIF_EVENTS,
  pharmacyCustomerIds, logNotification,
  orderAddressText,
} from '../data/helpers';
import { useApp } from '../context/AppContext';

// ── Emoji / gradient helpers (shared visual) ─────────────────
const EMOJI_MAP:Record<string,string>={Paracetamol:'💊',Ibuprofen:'💊',Cetirizine:'💊',Amoxicillin:'💊','Cough Syrup':'🍯','Oral Rehydration':'🧂','Vitamin C':'🍊',Multivitamins:'🥗',Antiseptic:'🧴',Hydrocortisone:'🧴',Salbutamol:'💨',Echinacea:'🌿',Ginger:'🍯'};
const GRAD_MAP:Record<string,[string,string]>={Paracetamol:['#E8D5B7','#D4BFA0'],Ibuprofen:['#E8D5B7','#D4BFA0'],Cetirizine:['#D4E0D8','#B8C9BE'],Amoxicillin:['#F5E3D4','#E8CDB8'],'Cough Syrup':['#F0D4B0','#E0BC8A'],'Oral Rehydration':['#D4E8E0','#B8D4C8'],'Vitamin C':['#F5E0B0','#E8CC8A'],Multivitamins:['#D4E8D0','#B8D4B0'],Antiseptic:['#D0E0E8','#B0C8D4'],Hydrocortisone:['#E8DDE0','#D4C4C8'],Salbutamol:['#D0E0F0','#B0C8E0'],Echinacea:['#D4E8D8','#B0C8B8'],Ginger:['#E8D8B8','#D4C4A0']};
function vis(name:string){let e='💊',g1='#D4D4D4',g2='#B8B8B8';for(const[k,v]of Object.entries(EMOJI_MAP)){if(name.includes(k)){e=v;break;}}for(const[k,v]of Object.entries(GRAD_MAP)){if(name.includes(k)){[g1,g2]=v;break;}}return{e,g1,g2};}
function MedThumb({name,size=46}:{name:string;size?:number}){const{e,g1,g2}=vis(name);return(<div className="cp-med-picture"style={{width:size,height:size,background:`linear-gradient(140deg,${g1},${g2})`,flexShrink:0}}><span style={{fontSize:size>54?32:20}}>{e}</span></div>);}

// Bloom timeline
const FLOWERS=['🌱','🌿','🌸','🌺'];
function BloomTimeline({o}:{o:ReturnType<typeof order>}){
  if(!o)return null;
  if(o.status==='cancelled')return<div className="cp-apo-note"style={{background:'var(--cp-danger-tint)',borderColor:'#E0BDB4',transform:'rotate(0.4deg)',color:'var(--cp-danger)',fontWeight:600}}>This order was cancelled.</div>;
  const idx=Math.max(0,STATUS_FLOW.indexOf(o.status));
  const pct=(idx/(STATUS_FLOW.length-1))*100;
  return(<div className="cp-bloom-line"><div className="cp-bloom-stem"><div className="cp-bloom-fill"style={{width:`${pct}%`}}/></div><div className="cp-bloom-steps">{STATUS_FLOW.map((s,i)=>(<div key={s}className={`cp-bloom-step${i<idx?' done':''}${i===idx?' current':''}`}><span className="flower-icon">{i<=idx?FLOWERS[Math.min(i,3)]:'🌱'}</span><div className="cp-bloom-label">{STATUS_LABEL[s]}</div></div>))}</div></div>);
}

// ── Tab: Workbench (Orders) ───────────────────────────────────
function Workbench({phId,dispatch,toast}:{phId:string;dispatch:any;toast:any}) {
  const [filter,setFilter]=useState('all');
  const [openId,setOpenId]=useState<string|null>(null);
  const all=DB.orders.filter(o=>o.pharmacyId===phId);
  const newOrders=all.filter(o=>o.status==='pending').length;
  const openMsgs=unreadForStaffPharmacy(phId);
  const lowStock=DB.medicines.filter(m=>m.pharmacyId===phId&&m.stock<=10).length;
  const filtered=all.filter(o=>filter==='all'?true:filter==='toPrepare'?o.status==='pending':filter==='beingMade'?(o.status==='confirmed'||o.status==='ready'):o.status===filter).sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());

  if(openId){
    const o=order(openId)!;
    if(!order(openId))return<button className="cp-btn-link"onClick={()=>setOpenId(null)}>← Back</button>;
    const idx=STATUS_FLOW.indexOf(o.status as any);
    const next=STATUS_FLOW[idx+1];
    const ret=orderReturn(openId);
    function advanceOrder(){const ni=STATUS_FLOW.indexOf(o.status as any);if(ni<STATUS_FLOW.length-1){o.status=STATUS_FLOW[ni+1];toast('Order marked '+STATUS_LABEL[o.status],'success');dispatch({type:'SET_SEARCH',payload:{}});}}
    function cancelOrder(){if(!window.confirm('Cancel this order?'))return;o.items.forEach(it=>{const m=medicine(it.medId);if(m){m.stock+=it.qty;m.sold=Math.max(0,(m.sold||0)-it.qty);}});o.status='cancelled';toast('Order cancelled.','success');dispatch({type:'SET_SEARCH',payload:{}});}
    function applyStatus(val:string){if(val==='cancelled'){cancelOrder();return;}o.status=val as any;toast('Status updated.','success');dispatch({type:'SET_SEARCH',payload:{}});}
    return(
      <div>
        <button className="cp-btn-link"onClick={()=>setOpenId(null)}>← Back to Workbench</button>
        <div className="cp-card"style={{marginTop:14}}>
          <div className="cp-row-between">
            <h2 style={{fontFamily:'var(--cp-font-display)',fontSize:22,margin:0}}>Order #{o.id.replace('o','')}</h2>
            <span className={`cp-badge cp-badge-${o.status}`}>{STATUS_LABEL[o.status]}</span>
          </div>
          <p style={{fontSize:13,color:'var(--cp-walnut-faint)',margin:'4px 0 12px'}}>Customer: {customerName(o.customerId)} · {fmtDate(o.createdAt)}</p>
          <BloomTimeline o={o}/>
          <div className="cp-divider"/>
          <table className="cp-table"><thead><tr><th>Item</th><th className="text-center">Qty</th><th className="text-right">Subtotal</th></tr></thead>
            <tbody>{o.items.map(it=>{const m=medicine(it.medId)??{id:it.medId,name:'Delisted item',price:it.price,stock:0};return(<tr key={it.medId}><td><div className="cp-cell-thumb"><MedThumb name={m.name}size={42}/><span>{m.name}</span></div></td><td className="text-center">{it.qty}</td><td className="text-right">{money(it.price*it.qty)}</td></tr>);})}</tbody>
          </table>
          <div className="cp-divider"/>
          <p style={{fontSize:14}}><strong>Fulfillment:</strong> {o.fulfillment==='pickup'?'Pickup':`Delivery to ${orderAddressText(o)}`}</p>
          <p style={{fontSize:14}}><strong>Payment:</strong> {o.paymentLabel??'Card (test mode)'}</p>
          <div className="cp-divider"/>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:16}}>
            <div>
              <h3 style={{marginTop:0,fontSize:15}}>Update status</h3>
              <div style={{display:'flex',gap:8,alignItems:'flex-end',flexWrap:'wrap'}}>
                <div className="cp-field"style={{flex:1,minWidth:160,marginBottom:0}}>
                  <label>Order status</label>
                  <select id={`statusSel-${o.id}`} defaultValue={o.status}>
                    {[...STATUS_FLOW,'cancelled'].map(s=><option key={s}value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                </div>
                <button className="cp-btn cp-btn-primary"onClick={()=>{const sel=document.getElementById(`statusSel-${o.id}`) as HTMLSelectElement;applyStatus(sel.value);}}>Apply</button>
              </div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10}}>
                {next&&<button className="cp-btn cp-btn-sage cp-btn-sm"onClick={advanceOrder}>Mark as {STATUS_LABEL[next]}</button>}
                {(o.status==='pending'||o.status==='confirmed')&&<button className="cp-btn cp-btn-danger cp-btn-sm"onClick={cancelOrder}>Cancel order</button>}
              </div>
            </div>
            <div>
              <h3 style={{marginTop:0,fontSize:15}}>Returns</h3>
              {ret?<div className="cp-apo-note"><strong>Return {RETURN_LABEL[ret.status]}</strong> — {ret.reason}{(ret as any).refundAmount!=null?` · ${money((ret as any).refundAmount)}`:''}</div>
                :<button className="cp-btn cp-btn-outline cp-btn-sm"onClick={()=>{const reason=window.prompt('Reason:');if(!reason?.trim())return;DB.returns.push({id:'r'+counters.ret++,orderId:openId,customerId:o.customerId,pharmacyId:o.pharmacyId,reason:reason.trim(),status:'approved',at:new Date()} as any);toast('Return recorded.','success');dispatch({type:'SET_SEARCH',payload:{}});}}>↩️ Record return</button>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return(
    <div>
      <h2 style={{fontFamily:'var(--cp-font-display)',fontSize:24,margin:'0 0 4px'}}>Workbench</h2>
      <div className="cp-stat-grid"style={{marginBottom:16}}>
        <div className="cp-stat-jar"><div className="stat-num">{newOrders}</div><div className="stat-label">New Orders</div></div>
        <div className="cp-stat-jar"><div className="stat-num">{openMsgs}</div><div className="stat-label">Messages</div></div>
        <div className="cp-stat-jar"><div className="stat-num">{lowStock}</div><div className="stat-label">Low Stock</div></div>
      </div>
      <div style={{display:'flex',gap:7,flexWrap:'wrap',marginBottom:14}}>
        {[['toPrepare','To Prepare'],['beingMade','Being Made'],['completed','Completed'],['cancelled','Cancelled'],['all','All']].map(([k,l])=>(
          <button key={k}className={`cp-chip${filter===k?' active':''}`}onClick={()=>setFilter(k)}>{l}</button>
        ))}
      </div>
      <div className="cp-card">
        {filtered.length===0?<div className="cp-empty"><div className="cp-empty-icon">🧾</div><div className="cp-empty-title">Nothing here</div></div>:
        <div className="cp-table-wrap"><table className="cp-table">
          <thead><tr><th>Order</th><th>Customer</th><th>Fulfillment</th><th className="text-right">Total</th><th className="text-center">Status</th><th>Placed</th><th className="col-actions"></th></tr></thead>
          <tbody>{filtered.map(o=>(
            <tr key={o.id}>
              <td>#{o.id.replace('o','')}</td><td>{customerName(o.customerId)}</td>
              <td style={{textTransform:'capitalize'}}>{o.fulfillment}</td>
              <td className="text-right">{money(orderTotal(o))}</td>
              <td className="text-center"><span className={`cp-badge cp-badge-${o.status}`}>{STATUS_LABEL[o.status]}</span></td>
              <td style={{fontSize:12}}>{fmtDate(o.createdAt)}</td>
              <td className="col-actions"><button className="cp-btn cp-btn-outline cp-btn-sm"onClick={()=>setOpenId(o.id)}>Manage</button></td>
            </tr>
          ))}</tbody>
        </table></div>}
      </div>
    </div>
  );
}

// ── Tab: The Shelf (Listings + Product Form) ─────────────────
function Shelf({phId,dispatch,toast}:{phId:string;dispatch:any;toast:any}){
  const [filter,setFilter]=useState('all');
  const [editId,setEditId]=useState<string|null>(null); // 'new' | medId | null
  const [draftImages,setDraftImages]=useState<string[]>([]);
  const all=pharmacyMedicines(phId);
  const counts={all:all.length,active:all.filter(m=>productStatus(m)==='active').length,inactive:all.filter(m=>productStatus(m)==='inactive').length,out:all.filter(m=>productStatus(m)==='out').length,rx:all.filter(m=>m.prescription).length};
  const meds=all.filter(m=>filter==='all'?true:filter==='rx'?m.prescription:productStatus(m)===filter);

  function saveProduct(){
    const name=(document.getElementById('medName') as HTMLInputElement)?.value?.trim();
    const desc=(document.getElementById('medDesc') as HTMLTextAreaElement)?.value?.trim();
    const cat=(document.getElementById('medCat') as HTMLSelectElement)?.value;
    const price=parseFloat((document.getElementById('medPrice') as HTMLInputElement)?.value);
    const stock=parseInt((document.getElementById('medStock') as HTMLInputElement)?.value,10);
    const isRx=(document.getElementById('medRx') as HTMLInputElement)?.checked;
    const status=(document.getElementById('medStatus') as HTMLSelectElement)?.value||'active';
    if(!name||isNaN(price)||price<=0||isNaN(stock)||stock<0){toast('Valid name, price, and stock required.','error');return;}
    const finalCat=isRx?'Prescription':cat;
    const ph2=pharmacy(phId);
    if(editId&&editId!=='new'){
      const m=medicine(editId);
      if(m)Object.assign(m,{name,description:desc||undefined,category:finalCat,price,stock,prescription:isRx,status,images:draftImages});
      toast('Product updated.','success');
    }else{
      const id='m'+counters.med++;
      const newest=DB.medicines.reduce((mx,m)=>Math.max(mx,m.addedAt||0),0);
      DB.medicines.push({id,pharmacyId:phId,name,category:finalCat as any,price,stock,prescription:isRx,sold:0,addedAt:newest+1,status:status as any,description:desc||undefined,images:draftImages,specs:{Category:finalCat,'Requires Prescription':isRx?'Yes':'No','Sold By':ph2?.name??''}});
      toast('Product added to the shelf.','success');
    }
    setEditId(null);setDraftImages([]);dispatch({type:'SET_SEARCH',payload:{}});
  }

  function handleImages(e:React.ChangeEvent<HTMLInputElement>){
    const files=Array.from(e.target.files??[]);const room=4-draftImages.length;
    files.slice(0,room).forEach(f=>{if(!f.type.startsWith('image/'))return;const r=new FileReader();r.onload=ev=>{setDraftImages(prev=>[...prev,(ev.target?.result as string)]);};r.readAsDataURL(f);});
  }

  const editMed=editId&&editId!=='new'?medicine(editId):null;

  return(
    <div>
      <div className="cp-row-between"style={{marginBottom:14}}>
        <div>
          <h2 style={{fontFamily:'var(--cp-font-display)',fontSize:24,margin:'0 0 2px'}}>The Shelf</h2>
          <p style={{margin:0,fontSize:13,color:'var(--cp-walnut-faint)'}}>{pharmacy(phId)?.name} · {all.length} product{all.length!==1?'s':''}</p>
        </div>
        <button className="cp-btn cp-btn-primary"onClick={()=>{setEditId('new');setDraftImages([]);}}>🍃 Add Product</button>
      </div>

      {/* Inline product form */}
      {editId&&(
        <div className="cp-card"style={{marginBottom:16,border:'1.5px solid var(--cp-terracotta)'}}>
          <div className="cp-row-between">
            <h3 style={{margin:0,fontSize:15}}>{editId==='new'?'Add Product':`Edit — ${editMed?.name??''}`}</h3>
            <button className="cp-btn-link"onClick={()=>{setEditId(null);setDraftImages([]);}}>Cancel</button>
          </div>
          <div className="cp-divider"/>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:16}}>
            <div>
              <div className="cp-field"><label>Product name</label><input id="medName"type="text"defaultValue={editMed?.name??''}placeholder="e.g. Mefenamic Acid 500mg"/></div>
              <div className="cp-field"><label>Description</label><textarea id="medDesc"rows={3}placeholder="Short description"defaultValue={editMed?.description??''}/></div>
              <div className="cp-field"><label>Category</label>
                <select id="medCat"defaultValue={editMed?.category??CATEGORIES[0]}>
                  {[...CATEGORIES,'Prescription'].map(c=><option key={c}value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{display:'flex',gap:10}}>
                <div className="cp-field"style={{flex:1}}><label>Price (₱)</label><input id="medPrice"type="number"defaultValue={editMed?.price??''}/></div>
                <div className="cp-field"style={{flex:1}}><label>Stock</label><input id="medStock"type="number"defaultValue={editMed?.stock??''}/></div>
              </div>
              <div className="cp-field"><label>Status</label>
                <select id="medStatus"defaultValue={editMed?.status??'active'}>
                  <option value="active">Active — visible to shoppers</option>
                  <option value="inactive">Inactive — hidden</option>
                </select>
              </div>
              <div className="cp-checkbox-row"><input id="medRx"type="checkbox"defaultChecked={editMed?.prescription??false}/><label htmlFor="medRx">Requires prescription</label></div>
            </div>
            <div>
              <div className="cp-field"><label>Product images</label><input type="file"accept="image/*"multiple onChange={handleImages}/><p className="cp-hint">Up to 4 images.</p></div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {draftImages.map((src,i)=>(
                  <div key={i}style={{position:'relative'}}>
                    <div style={{width:74,height:74,borderRadius:12,backgroundImage:`url('${src}')`,backgroundSize:'cover',border:'1.5px solid var(--cp-stone)'}}/>
                    <button className="cp-btn cp-btn-danger cp-btn-sm"style={{position:'absolute',top:-6,right:-6,padding:'2px 7px'}}onClick={()=>setDraftImages(p=>p.filter((_,j)=>j!==i))}>×</button>
                  </div>
                ))}
              </div>
              <div className="cp-divider"/>
              <button className="cp-btn cp-btn-primary cp-btn-block"onClick={saveProduct}>{editId==='new'?'Add product':'Save changes'}</button>
            </div>
          </div>
        </div>
      )}

      <div style={{display:'flex',gap:7,flexWrap:'wrap',marginBottom:14}}>
        {[['all',`All (${counts.all})`],['active',`Active (${counts.active})`],['inactive',`Inactive (${counts.inactive})`],['out',`Out (${counts.out})`],['rx',`Rx (${counts.rx})`]].map(([k,l])=>(
          <button key={k}className={`cp-chip${filter===k?' active':''}`}onClick={()=>setFilter(k)}>{l}</button>
        ))}
      </div>

      <div className="cp-card">
        <div className="cp-table-wrap"><table className="cp-table">
          <thead><tr><th>Product</th><th>Category</th><th className="text-right">Price</th><th className="text-right">Stock</th><th className="text-center">Status</th><th className="col-actions"></th></tr></thead>
          <tbody>
            {meds.map(m=>{
              const st=productStatus(m);
              return(<tr key={m.id}>
                <td><div className="cp-cell-thumb"><MedThumb name={m.name}size={46}/><span className="cell-text">{m.name}{m.prescription&&<span className="cp-badge cp-badge-pending"style={{marginLeft:6}}>Rx</span>}</span></div></td>
                <td style={{fontSize:13}}>💊 {m.category}</td>
                <td className="text-right">{money(m.price)}</td>
                <td className="text-right"><span className={`cp-dot cp-dot-${m.stock===0?'out':isLowStock(m)?'low':'in'}`}style={{marginRight:4}}/>{m.stock}</td>
                <td className="text-center"><span className={`cp-badge ${PRODUCT_STATUS_BADGE[st]}`}>{PRODUCT_STATUS_LABEL[st]}</span></td>
                <td className="col-actions" style={{display:'flex',gap:4,justifyContent:'flex-end',flexWrap:'wrap'}}>
                  <button className="cp-btn cp-btn-outline cp-btn-sm"onClick={()=>{setEditId(m.id);setDraftImages((m.images??[]).slice());}}>Edit</button>
                  <button className="cp-btn cp-btn-outline cp-btn-sm"onClick={()=>{m.status=(m.status||'active')==='active'?'inactive':'active';toast(m.name+' is now '+(m.status==='active'?'active':'inactive')+'.','success');dispatch({type:'SET_SEARCH',payload:{}});}}>{(m.status||'active')==='active'?'Deactivate':'Activate'}</button>
                  <button className="cp-btn cp-btn-danger cp-btn-sm"onClick={()=>{if(!window.confirm('Remove this listing?'))return;DB.medicines=DB.medicines.filter(x=>x.id!==m.id);toast('Removed.','success');dispatch({type:'SET_SEARCH',payload:{}});}}>Delete</button>
                </td>
              </tr>);
            })}
            {meds.length===0&&<tr><td colSpan={6}className="cp-hint"style={{textAlign:'center',padding:24}}>No products match this filter.</td></tr>}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}

// ── Tab: Inventory ────────────────────────────────────────────
function Inventory({phId,dispatch,toast}:{phId:string;dispatch:any;toast:any}){
  const meds=pharmacyMedicines(phId);
  const low=lowStockMedicines(phId);
  const out=outOfStockMedicines(phId);
  const units=meds.reduce((s,m)=>s+m.stock,0);
  const value=meds.reduce((s,m)=>s+m.stock*m.price,0);
  const sorted=[...meds].sort((a,b)=>a.stock-b.stock);
  function adjust(id:string,delta:number){const m=medicine(id);if(m){m.stock=Math.max(0,m.stock+delta);dispatch({type:'SET_SEARCH',payload:{}});}}
  function setThreshold(id:string,val:string){const m=medicine(id);if(!m)return;const n=parseInt(val,10);if(isNaN(n)||n<0){toast('Enter a whole number.','error');return;}m.lowStockThreshold=n;dispatch({type:'SET_SEARCH',payload:{}});}
  function setStockPrompt(id:string){const m=medicine(id);if(!m)return;const v=window.prompt(`Set stock for ${m.name}`,String(m.stock));if(v===null)return;const n=parseInt(v,10);if(isNaN(n)||n<0){toast('Enter a whole number.','error');return;}m.stock=n;toast(m.name+' stock set to '+n+'.','success');dispatch({type:'SET_SEARCH',payload:{}});}
  return(
    <div>
      <h2 style={{fontFamily:'var(--cp-font-display)',fontSize:24,margin:'0 0 4px'}}>Inventory</h2>
      <p style={{fontSize:13,color:'var(--cp-walnut-faint)',margin:'0 0 16px'}}>{pharmacy(phId)?.name} · stock levels and alerts</p>
      <div className="cp-stat-grid"style={{marginBottom:16}}>
        <div className="cp-stat-jar"><div className="stat-num">{meds.length}</div><div className="stat-label">Products</div></div>
        <div className="cp-stat-jar"><div className="stat-num">{units}</div><div className="stat-label">Units on hand</div></div>
        <div className="cp-stat-jar"><div className="stat-num">{low.length}</div><div className="stat-label">Low stock</div></div>
        <div className="cp-stat-jar"><div className="stat-num">{out.length}</div><div className="stat-label">Out of stock</div></div>
        <div className="cp-stat-jar"><div className="stat-num">{money(value)}</div><div className="stat-label">Stock value</div></div>
      </div>
      {(low.length||out.length)?
        <div className="cp-card"style={{border:'1.5px solid var(--cp-yarrow)',marginBottom:16}}>
          <h3 style={{marginTop:0,fontSize:15}}>🔔 Stock alerts</h3>
          {out.map(m=><div key={m.id}className="cp-row-between"style={{padding:'9px 0',borderBottom:'1px solid var(--cp-stone)'}}><span><span className="cp-badge cp-badge-cancelled">Out of stock</span> {m.name}</span><button className="cp-btn cp-btn-sage cp-btn-sm"onClick={()=>adjust(m.id,25)}>Restock +25</button></div>)}
          {low.map(m=><div key={m.id}className="cp-row-between"style={{padding:'9px 0',borderBottom:'1px solid var(--cp-stone)'}}><span><span className="cp-badge cp-badge-pending">Low</span> {m.name} — {m.stock} left (alert at {lowStockThreshold(m)})</span><button className="cp-btn cp-btn-sage cp-btn-sm"onClick={()=>adjust(m.id,25)}>Restock +25</button></div>)}
        </div>:
        <div className="cp-card"style={{marginBottom:16}}><p className="cp-hint"style={{margin:0}}>🍃 Every product is comfortably in stock.</p></div>}
      <div className="cp-card">
        <h3 style={{marginTop:0,fontSize:15}}>Stock ledger</h3>
        <div className="cp-table-wrap"><table className="cp-table">
          <thead><tr><th>Product</th><th className="text-right">On hand</th><th className="text-right">Sold</th><th className="text-right">Alert at</th><th className="text-center">Status</th><th className="col-actions">Adjust</th></tr></thead>
          <tbody>{sorted.map(m=>{
            const st=m.stock===0?'out':isLowStock(m)?'low':'ok';
            const badge=st==='out'?<span className="cp-badge cp-badge-cancelled">Out</span>:st==='low'?<span className="cp-badge cp-badge-pending">Low</span>:<span className="cp-badge cp-badge-active">In stock</span>;
            return(<tr key={m.id}>
              <td><div className="cp-cell-thumb"><MedThumb name={m.name}size={42}/><span>{m.name}</span></div></td>
              <td className="text-right"><span className={`cp-dot cp-dot-${st==='out'?'out':st==='low'?'low':'in'}`}style={{marginRight:4}}/>{m.stock}</td>
              <td className="text-right">{m.sold||0}</td>
              <td className="text-right"><input type="number"defaultValue={lowStockThreshold(m)}style={{width:58,textAlign:'right',border:'1px solid var(--cp-stone-dark)',borderRadius:6,padding:'3px 6px',fontSize:13}}onBlur={e=>setThreshold(m.id,e.target.value)}/></td>
              <td className="text-center">{badge}</td>
              <td className="col-actions"style={{display:'flex',gap:4,flexWrap:'wrap',justifyContent:'flex-end'}}>
                <button className="cp-btn cp-btn-outline cp-btn-sm"onClick={()=>adjust(m.id,-1)}>−1</button>
                <button className="cp-btn cp-btn-outline cp-btn-sm"onClick={()=>adjust(m.id,1)}>+1</button>
                <button className="cp-btn cp-btn-outline cp-btn-sm"onClick={()=>adjust(m.id,10)}>+10</button>
                <button className="cp-btn cp-btn-outline cp-btn-sm"onClick={()=>setStockPrompt(m.id)}>Set…</button>
              </td>
            </tr>);
          })}</tbody>
        </table></div>
      </div>
    </div>
  );
}

// ── Tab: Returns ──────────────────────────────────────────────
function Returns({phId,dispatch,toast}:{phId:string;dispatch:any;toast:any}){
  const [filter,setFilter]=useState('all');
  const all=pharmacyReturns(phId).sort((a,b)=>b.at.getTime()-a.at.getTime());
  const list=all.filter(r=>filter==='all'?true:r.status===filter);
  const refunded=all.filter(r=>r.status==='refunded');
  const refundTotal=refunded.reduce((s,r)=>s+(r as any).refundAmount||0,0);
  function approve(id:string){const r=DB.returns.find(x=>x.id===id);if(r){r.status='approved';toast('Return approved.','success');dispatch({type:'SET_SEARCH',payload:{}});}}
  function reject(id:string){const r=DB.returns.find(x=>x.id===id);if(r){r.status='rejected';toast('Return rejected.','success');dispatch({type:'SET_SEARCH',payload:{}});}}
  function refund(id:string){const r=DB.returns.find(x=>x.id===id);if(!r)return;const amt=window.prompt('Refund amount:');if(amt===null)return;const n=parseFloat(amt);if(isNaN(n)||n<0){toast('Enter a valid amount.','error');return;}(r as any).refundAmount=n;r.status='refunded';toast(`Refund of ${money(n)} issued.`,'success');dispatch({type:'SET_SEARCH',payload:{}});}
  return(
    <div>
      <h2 style={{fontFamily:'var(--cp-font-display)',fontSize:24,margin:'0 0 4px'}}>Returns &amp; Refunds</h2>
      <div className="cp-stat-grid"style={{marginBottom:16}}>
        <div className="cp-stat-card"><div className="stat-num">{all.filter(r=>r.status==='requested').length}</div><div className="stat-label">Awaiting review</div></div>
        <div className="cp-stat-card"><div className="stat-num">{all.filter(r=>r.status==='approved').length}</div><div className="stat-label">Approved</div></div>
        <div className="cp-stat-card"><div className="stat-num">{refunded.length}</div><div className="stat-label">Refunded</div></div>
        <div className="cp-stat-card"><div className="stat-num">{money(refundTotal)}</div><div className="stat-label">Refunded value</div></div>
      </div>
      <div style={{display:'flex',gap:7,flexWrap:'wrap',marginBottom:14}}>
        {[['all','All'],['requested','Requested'],['approved','Approved'],['refunded','Refunded'],['rejected','Rejected']].map(([k,l])=>(
          <button key={k}className={`cp-chip${filter===k?' active':''}`}onClick={()=>setFilter(k)}>{l}</button>
        ))}
      </div>
      <div className="cp-card">
        {list.length===0?<div className="cp-empty"><div className="cp-empty-icon">↩️</div><div className="cp-empty-title">No return requests</div></div>:
        <div className="cp-table-wrap"><table className="cp-table">
          <thead><tr><th>Order</th><th>Customer</th><th>Reason</th><th className="text-right">Total</th><th className="text-center">Status</th><th>Requested</th><th className="col-actions"></th></tr></thead>
          <tbody>{list.map(r=>{
            const o=DB.orders.find(x=>x.id===r.orderId);
            return(<tr key={r.id}>
              <td>#{r.orderId.replace('o','')}</td>
              <td>{customerName(r.customerId)}</td>
              <td style={{maxWidth:180,fontSize:13}}>{r.reason}</td>
              <td className="text-right">{o?money(orderTotal(o)):'—'}</td>
              <td className="text-center"><span className={`cp-badge ${RETURN_BADGE[r.status]}`}>{RETURN_LABEL[r.status]}</span></td>
              <td style={{fontSize:12}}>{fmtDate(r.at)}</td>
              <td className="col-actions"style={{display:'flex',gap:4,flexWrap:'wrap',justifyContent:'flex-end'}}>
                {r.status==='requested'&&<><button className="cp-btn cp-btn-sage cp-btn-sm"onClick={()=>approve(r.id)}>Approve</button><button className="cp-btn cp-btn-danger cp-btn-sm"onClick={()=>reject(r.id)}>Reject</button></>}
                {r.status==='approved'&&<button className="cp-btn cp-btn-primary cp-btn-sm"onClick={()=>refund(r.id)}>Issue refund</button>}
              </td>
            </tr>);
          })}</tbody>
        </table></div>}
      </div>
    </div>
  );
}

// ── Tab: Counter (Messages) ───────────────────────────────────
function Counter({phId,dispatch,toast}:{phId:string;dispatch:any;toast:any}){
  const [openId,setOpenId]=useState<string|null>(null);
  const [msgText,setMsgText]=useState('');
  const threads=DB.threads.filter(t=>t.pharmacyId===phId);

  function openThread(id:string){const t=DB.threads.find(x=>x.id===id);if(t)t.unreadForStaff=false;setOpenId(id);setMsgText('');}
  function sendMsg(tid:string){const t=DB.threads.find(x=>x.id===tid);const text=msgText.trim();if(!text){toast('Type a message.','error');return;}t?.messages.push({from:'staff',text,at:new Date()} as any);if(t){t.unreadForCustomer=true;t.unreadForStaff=false;}setMsgText('');toast('Message sent.','success');dispatch({type:'SET_SEARCH',payload:{}});}
  function resolveThread(tid:string){const t=DB.threads.find(x=>x.id===tid);if(t){t.status='resolved';toast('Resolved.','success');dispatch({type:'SET_SEARCH',payload:{}}); setOpenId(null);}}

  if(openId){
    const t=DB.threads.find(x=>x.id===openId);if(!t)return null;
    return(
      <div>
        <button className="cp-btn-link"onClick={()=>setOpenId(null)}>← Back</button>
        <div className="cp-card"style={{marginTop:14,maxWidth:680}}>
          <div className="cp-row-between">
            <h3 style={{margin:0,fontFamily:'var(--cp-font-display)'}}>{t.subject}</h3>
            <span className={`cp-badge cp-badge-${t.status==='open'?'active':'completed'}`}>{t.status}</span>
          </div>
          <p className="cp-hint">{t.type==='prescription'?'Prescription inquiry':'Order-related'} · with {customerName(t.customerId)}</p>
          <div className="cp-divider"/>
          <div style={{marginBottom:14}}>
            {t.messages.length===0?<p className="cp-hint">No messages yet.</p>:t.messages.map((msg,i)=>(
              <div key={i}className={`cp-thread-bubble ${msg.from}`}>
                {(msg as any).image&&<img src={(msg as any).image}alt="Rx"style={{maxWidth:200,borderRadius:10,display:'block',marginBottom:6}}/>}
                {msg.text&&<div>{msg.text}</div>}
                <div className="meta">{msg.from==='staff'?'You':'Customer'} · {fmtDate(msg.at)}</div>
              </div>
            ))}
          </div>
          <div className="cp-field"><textarea value={msgText}onChange={e=>setMsgText(e.target.value)}placeholder="Type your message…"rows={3}/></div>
          <div style={{display:'flex',gap:8}}>
            <button className="cp-btn cp-btn-primary"onClick={()=>sendMsg(openId)}>Send</button>
            {t.status==='open'&&<button className="cp-btn cp-btn-sage cp-btn-sm"onClick={()=>resolveThread(openId)}>Mark resolved</button>}
          </div>
        </div>
      </div>
    );
  }

  return(
    <div>
      <h2 style={{fontFamily:'var(--cp-font-display)',fontSize:24,margin:'0 0 20px'}}>Counter</h2>
      {threads.length===0?<div className="cp-empty"><div className="cp-empty-icon">✉️</div><div className="cp-empty-title">No messages</div></div>:
      <div className="cp-card">
        {threads.map(t=>{
          const last=t.messages[t.messages.length-1];
          let preview='No messages yet';
          if(last?.text)preview=last.text.slice(0,58)+(last.text.length>58?'…':'');
          else if((last as any)?.image)preview='📎 Rx photo attached';
          return(<div key={t.id}className="cp-thread-list-row"onClick={()=>openThread(t.id)}>
            <div style={{display:'flex',gap:10,alignItems:'flex-start',flex:1,minWidth:0}}>
              <span className="cp-dot"style={{background:t.type==='prescription'?'var(--cp-yarrow)':'var(--cp-sage)',marginTop:6,flexShrink:0}}/>
              <div style={{minWidth:0}}>
                <div style={{fontWeight:700,fontSize:13.5,fontFamily:'var(--cp-font-display)'}}>{t.unreadForStaff&&<span className="cp-unread-dot"/>}{t.subject}</div>
                <div className="cp-hint">{customerName(t.customerId)} · {preview}</div>
              </div>
            </div>
            <span className={`cp-badge cp-badge-${t.status==='open'?'active':'completed'}`}>{t.status}</span>
          </div>);
        })}
      </div>}
    </div>
  );
}

// ── Tab: Sales ────────────────────────────────────────────────
function Sales({phId}:{phId:string}){
  const [range,setRange]=useState(30);
  const orders=DB.orders.filter(o=>o.pharmacyId===phId);
  const completed=orders.filter(o=>o.status==='completed');
  const cancelled=orders.filter(o=>o.status==='cancelled');
  const revenue=completed.reduce((s,o)=>s+orderTotal(o),0);
  const aov=completed.length?revenue/completed.length:0;
  const refunds=pharmacyReturns(phId).filter(r=>r.status==='refunded').reduce((s,r)=>s+((r as any).refundAmount||0),0);
  const since=Date.now()-range*864e5;
  const inRange=completed.filter(o=>new Date(o.createdAt).getTime()>=since);
  const rangeRevenue=inRange.reduce((s,o)=>s+orderTotal(o),0);
  const perf:Record<string,{units:number;revenue:number}>={};
  completed.forEach(o=>o.items.forEach(it=>{if(!perf[it.medId])perf[it.medId]={units:0,revenue:0};perf[it.medId].units+=it.qty;perf[it.medId].revenue+=it.price*it.qty;}));
  const perfRows=Object.entries(perf).map(([medId,p])=>({med:medicine(medId)??{id:medId,name:'Delisted',price:0,stock:0},...p})).sort((a,b)=>b.revenue-a.revenue);
  const byCustomer:Record<string,{orders:number;spend:number}>={};
  orders.forEach(o=>{if(!byCustomer[o.customerId])byCustomer[o.customerId]={orders:0,spend:0};byCustomer[o.customerId].orders++;if(o.status==='completed')byCustomer[o.customerId].spend+=orderTotal(o);});
  const custRows=Object.entries(byCustomer).map(([id,c])=>({id,...c})).sort((a,b)=>b.spend-a.spend);
  const repeat=custRows.filter(c=>c.orders>1).length;
  const span=Math.min(range,14);
  const buckets=[];
  for(let i=span-1;i>=0;i--){const s=new Date();s.setHours(0,0,0,0);s.setDate(s.getDate()-i);const e2=new Date(s);e2.setDate(e2.getDate()+1);const day=completed.filter(o=>{const t=new Date(o.createdAt);return t>=s&&t<e2;});buckets.push({label:s.toLocaleDateString('en-PH',{month:'short',day:'numeric'}),total:day.reduce((s2,o)=>s2+orderTotal(o),0)});}
  const maxB=Math.max(1,...buckets.map(b=>b.total));
  return(
    <div>
      <h2 style={{fontFamily:'var(--cp-font-display)',fontSize:24,margin:'0 0 4px'}}>Sales &amp; Analytics</h2>
      <div style={{display:'flex',gap:7,flexWrap:'wrap',marginBottom:16}}>
        {[[7,'Last 7 days'],[30,'Last 30 days'],[365,'Last year']].map(([d,l])=>(
          <button key={d}className={`cp-chip${range===d?' active':''}`}onClick={()=>setRange(d as number)}>{l}</button>
        ))}
      </div>
      <div className="cp-stat-grid"style={{marginBottom:16}}>
        <div className="cp-stat-card"><div className="stat-num">{money(rangeRevenue)}</div><div className="stat-label">Revenue (range)</div></div>
        <div className="cp-stat-card"><div className="stat-num">{money(revenue)}</div><div className="stat-label">Lifetime revenue</div></div>
        <div className="cp-stat-card"><div className="stat-num">{money(aov)}</div><div className="stat-label">Avg. order value</div></div>
        <div className="cp-stat-card"><div className="stat-num">{orders.length}</div><div className="stat-label">Total orders</div></div>
        <div className="cp-stat-card"><div className="stat-num">{cancelled.length}</div><div className="stat-label">Cancelled</div></div>
        <div className="cp-stat-card"><div className="stat-num">{money(refunds)}</div><div className="stat-label">Refunded</div></div>
      </div>
      <div className="cp-card"style={{marginBottom:14}}>
        <h3 style={{marginTop:0,fontSize:15}}>Revenue trend</h3>
        <div className="cp-rev-bar-wrap">
          {buckets.map((b,i)=>(
            <div key={i}className="cp-rev-bar-col"title={`${b.label}: ${money(b.total)}`}>
              <div className="cp-rev-bar"style={{height:Math.max(3,(b.total/maxB)*100)}}/>
              <div className="cp-rev-bar-label">{b.label}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="cp-card"style={{marginBottom:14}}>
        <h3 style={{marginTop:0,fontSize:15}}>Product performance</h3>
        {perfRows.length===0?<p className="cp-hint">No completed sales yet.</p>:
        <div className="cp-table-wrap"><table className="cp-table">
          <thead><tr><th>Product</th><th className="text-right">Units sold</th><th className="text-right">Revenue</th><th className="text-right">In stock</th></tr></thead>
          <tbody>{perfRows.map(r=>(
            <tr key={r.med.id}><td><div className="cp-cell-thumb"><MedThumb name={r.med.name}size={42}/><span>{r.med.name}</span></div></td>
            <td className="text-right">{r.units}</td><td className="text-right">{money(r.revenue)}</td><td className="text-right">{r.med.stock}</td></tr>
          ))}</tbody>
        </table></div>}
      </div>
      <div className="cp-card">
        <h3 style={{marginTop:0,fontSize:15}}>Customer insights</h3>
        <div className="cp-stat-grid"style={{marginBottom:14}}>
          <div className="cp-stat-jar"><div className="stat-num">{custRows.length}</div><div className="stat-label">Customers served</div></div>
          <div className="cp-stat-jar"><div className="stat-num">{repeat}</div><div className="stat-label">Repeat customers</div></div>
          <div className="cp-stat-jar"><div className="stat-num">{custRows.length?Math.round(repeat/custRows.length*100):0}%</div><div className="stat-label">Repeat rate</div></div>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Notices ──────────────────────────────────────────────
function Notices({phId,dispatch,toast}:{phId:string;dispatch:any;toast:any}){
  const tpls=notifTemplates(phId);
  const log=DB.notificationLog.filter(l=>l.pharmacyId===phId).slice(0,25);
  const custIds=pharmacyCustomerIds(phId);
  const [target,setTarget]=useState('all');

  function toggleTpl(id:string){tpls[id].enabled=!tpls[id].enabled;dispatch({type:'SET_SEARCH',payload:{}});}
  function saveTpl(id:string){const el=document.getElementById(`tpl_${id}`) as HTMLTextAreaElement;if(el)tpls[id].text=el.value;toast('Saved.','success');}
  function resetTpl(id:string){const ev=NOTIF_EVENTS.find(e=>e.id===id);if(ev)tpls[id].text=ev.text;dispatch({type:'SET_SEARCH',payload:{}});toast('Reset to default.','success');}
  function sendBroadcast(){
    const el=document.getElementById('broadcastText') as HTMLTextAreaElement;
    const text=el?.value?.trim();
    if(!text){toast('Enter a message.','error');return;}
    const targets=target==='all'?custIds:[target];
    targets.forEach(cid=>{
      DB.notifications.unshift({id:'n'+counters.notif++,customerId:cid,type:'promo',text,read:false,at:new Date()});
      logNotification(phId,'broadcast',cid,text,'manual');
    });
    if(el)el.value='';
    toast(`Sent to ${targets.length} customer${targets.length!==1?'s':''}.`,'success');
    dispatch({type:'SET_SEARCH',payload:{}});
  }
  return(
    <div>
      <h2 style={{fontFamily:'var(--cp-font-display)',fontSize:24,margin:'0 0 4px'}}>Notices</h2>
      <p style={{fontSize:13,color:'var(--cp-walnut-faint)',margin:'0 0 16px'}}>Automated messages sent to your customers.</p>
      <div className="cp-card"style={{marginBottom:14}}>
        <h3 style={{marginTop:0,fontSize:15}}>🔔 Automated notifications</h3>
        <p className="cp-hint">Placeholders: <code>{'{customer}'}</code>, <code>{'{order}'}</code>, <code>{'{pharmacy}'}</code>, <code>{'{status}'}</code>.</p>
        {NOTIF_EVENTS.map(e=>{const t=tpls[e.id];return(
          <div key={e.id}style={{padding:'12px 0',borderBottom:'1px solid var(--cp-stone)'}}>
            <div className="cp-row-between">
              <div><strong>{e.label}</strong><br/><span className="cp-hint">{e.when}</span></div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <span className={`cp-badge cp-badge-${t.enabled?'active':'inactive'}`}>{t.enabled?'On':'Off'}</span>
                <button className="cp-btn cp-btn-outline cp-btn-sm"onClick={()=>toggleTpl(e.id)}>{t.enabled?'Turn off':'Turn on'}</button>
              </div>
            </div>
            <div className="cp-field"style={{marginTop:8,marginBottom:0}}>
              <textarea rows={2}id={`tpl_${e.id}`}disabled={!t.enabled}defaultValue={t.text}/>
            </div>
            <div style={{display:'flex',gap:8,marginTop:6}}>
              <button className="cp-btn cp-btn-primary cp-btn-sm"onClick={()=>saveTpl(e.id)}>Save message</button>
              <button className="cp-btn cp-btn-outline cp-btn-sm"onClick={()=>resetTpl(e.id)}>Reset to default</button>
            </div>
          </div>
        );})}
      </div>
      <div className="cp-card"style={{marginBottom:14}}>
        <h3 style={{marginTop:0,fontSize:15}}>📜 Send an announcement</h3>
        <div className="cp-field"><label>Recipients</label>
          <select value={target}onChange={e=>setTarget(e.target.value)}>
            <option value="all">All customers ({custIds.length})</option>
            {custIds.map(id=><option key={id}value={id}>{customerName(id)}</option>)}
          </select>
        </div>
        <div className="cp-field"><label>Message</label><textarea id="broadcastText"rows={2}placeholder="e.g. 🌿 Flu shots available all week — walk in anytime."/></div>
        <button className="cp-btn cp-btn-primary"onClick={sendBroadcast}>Send notification</button>
        {custIds.length===0&&<p className="cp-hint">No customers have ordered from you yet.</p>}
      </div>
      <div className="cp-card">
        <h3 style={{marginTop:0,fontSize:15}}>Sent log</h3>
        {log.length===0?<p className="cp-hint">Nothing sent yet.</p>:
        <div className="cp-table-wrap"><table className="cp-table">
          <thead><tr><th>When</th><th>Type</th><th>To</th><th>Message</th></tr></thead>
          <tbody>{log.map(l=>(
            <tr key={l.id}><td style={{fontSize:12}}>{fmtDate(l.at)}</td>
            <td><span className={`cp-badge cp-badge-${l.kind==='manual'?'confirmed':'active'}`}>{l.kind}</span></td>
            <td>{customerName(l.customerId??'')}</td>
            <td style={{fontSize:12.5}}>{l.text}</td></tr>
          ))}</tbody>
        </table></div>}
      </div>
    </div>
  );
}

// ── Tab: Profile ──────────────────────────────────────────────
function PharmacyProfile({ph,dispatch,toast}:{ph:ReturnType<typeof pharmacy>;dispatch:any;toast:any}){
  const [n, setN] = useState(ph?.name     ?? '');
  const [l, setL] = useState(ph?.location ?? '');
  const [h, setH] = useState(ph?.hours    ?? '');
  // lat/lng stored as strings for the controlled inputs; persisted as numbers on ph
  const [lat, setLat] = useState(String((ph as any)?.lat ?? ''));
  const [lng, setLng] = useState(String((ph as any)?.lng ?? ''));

  if (!ph) return null;
  const phDef = ph!;

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!n.trim() || !l.trim() || !h.trim()) { toast('All fields required.', 'error'); return; }
    phDef.name     = n.trim();
    phDef.location = l.trim();
    phDef.hours    = h.trim();
    // Persist coordinates back onto the pharmacy object
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    if (!isNaN(parsedLat)) (phDef as any).lat = parsedLat;
    if (!isNaN(parsedLng)) (phDef as any).lng = parsedLng;
    toast('Profile updated.', 'success');
    dispatch({ type: 'SET_SEARCH', payload: {} });
  }

  // Called by the draggable map when the marker is moved
  function handleMapCoords(newLat: string, newLng: string) {
    setLat(newLat);
    setLng(newLng);
  }

  return (
    <div>
      <h2 style={{ fontFamily:'var(--cp-font-display)', fontSize:24, margin:'0 0 20px' }}>Pharmacy Profile</h2>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:20 }}>

        {/* ── Details form ── */}
        <div className="cp-card">
          <h3 style={{ marginTop:0, fontSize:15 }}>Branch details</h3>
          <form onSubmit={save}>
            <div className="cp-field"><label>Name</label>
              <input type="text" value={n} onChange={e => setN(e.target.value)} />
            </div>
            <div className="cp-field"><label>Location</label>
              <input type="text" value={l} onChange={e => setL(e.target.value)} />
            </div>
            <div className="cp-field"><label>Hours</label>
              <input type="text" value={h} onChange={e => setH(e.target.value)} />
            </div>

            {/* Lat / Lng — synced by the map drag or editable manually */}
            <div style={{ display:'flex', gap:10 }}>
              <div className="cp-field" style={{ flex:1 }}>
                <label>Latitude</label>
                <input type="number" step="any" value={lat}
                  onChange={e => setLat(e.target.value)}
                  placeholder="e.g. 14.5995" />
              </div>
              <div className="cp-field" style={{ flex:1 }}>
                <label>Longitude</label>
                <input type="number" step="any" value={lng}
                  onChange={e => setLng(e.target.value)}
                  placeholder="e.g. 120.9842" />
              </div>
            </div>
            <p className="cp-hint" style={{ marginTop:-6, marginBottom:12 }}>
              Drag the pin on the map to auto-fill coordinates, or enter them manually.
            </p>

            <button type="submit" className="cp-btn cp-btn-primary">Save profile</button>
          </form>
        </div>

        {/* ── Interactive map ── */}
        <div className="cp-card">
          <h3 style={{ marginTop:0, fontSize:15 }}>📍 Store location pin</h3>
          <PharmacyMapStaff
            lat={parseFloat(lat) || 14.5995}
            lng={parseFloat(lng) || 120.9842}
            onCoordsChange={handleMapCoords}
            height={260}
          />
        </div>

      </div>
    </div>
  );
}

// ── Main BranchPortal ─────────────────────────────────────────
const BranchPortal: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch, logout, toast } = useApp();

  const staffId = state.session.staff;
  if (!staffId) { navigate('/auth', { replace: true }); return null; }

  const staff = staffMember(staffId);
  const ph    = staff ? pharmacy(staff.pharmacyId) : undefined;
  if (!ph) { navigate('/auth', { replace: true }); return null; }

  const view = state.staff.view;
  const pendingReturns = pharmacyReturns(ph.id).filter(r=>r.status==='requested').length;
  const openMsgs       = unreadForStaffPharmacy(ph.id);
  const pendingOrders  = DB.orders.filter(o=>o.pharmacyId===ph.id&&o.status==='pending').length;
  const lowStockCount  = lowStockMedicines(ph.id).length + outOfStockMedicines(ph.id).length;

  const tabs: [string, string][] = [
    ['orders',   `Workbench${pendingOrders ? ` (${pendingOrders})` : ''}`],
    ['listings', 'The Shelf'],
    ['inventory',`Inventory${lowStockCount ? ` (${lowStockCount})` : ''}`],
    ['returns',  `Returns${pendingReturns ? ` (${pendingReturns})` : ''}`],
    ['messages', `Counter${openMsgs ? ` (${openMsgs})` : ''}`],
    ['sales',    'Sales'],
    ['notices',  'Notices'],
    ['profile',  'Profile'],
  ];

  return (
    <div className="cp-page">
      <div style={{ overflowY: "auto" }}>
        {/* Topbar */}
        <header style={{ background:'rgba(250,247,242,0.9)', backdropFilter:'blur(10px)', borderBottom:'1px solid var(--cp-stone-dark)', position:'sticky', top:0, zIndex:50 }}>
          <div style={{ maxWidth:1180, margin:'0 auto', padding:'12px 16px', display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
            <div className="cp-brand-wrap">
              <div className="cp-brand-mark">🍃</div>
              <div>
                <div className="cp-brand-name">CarePoint</div>
                <span className="cp-brand-tag">Branch Portal</span>
              </div>
            </div>
            <div className="cp-user-chip" style={{ marginLeft:'auto' }}>
              <span className="name">{staff?.name} · {ph.name}</span>
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
                onClick={() => dispatch({ type:'SET_STAFF_VIEW', view:v })} />
            ))}
          </div>
        </nav>

        {/* Content */}
        <div style={{ maxWidth:1180, margin:'0 auto', padding:'28px 16px 80px' }}>
          {view === 'orders'    && <Workbench phId={ph.id} dispatch={dispatch} toast={toast} />}
          {view === 'listings'  && <Shelf     phId={ph.id} dispatch={dispatch} toast={toast} />}
          {view === 'inventory' && <Inventory phId={ph.id} dispatch={dispatch} toast={toast} />}
          {view === 'returns'   && <Returns   phId={ph.id} dispatch={dispatch} toast={toast} />}
          {view === 'messages'  && <Counter   phId={ph.id} dispatch={dispatch} toast={toast} />}
          {view === 'sales'     && <Sales     phId={ph.id} />}
          {view === 'notices'   && <Notices   phId={ph.id} dispatch={dispatch} toast={toast} />}
          {view === 'profile'   && <PharmacyProfile ph={ph} dispatch={dispatch} toast={toast} />}
        </div>
      </div>
    </div>
  );
};

export default BranchPortal;
