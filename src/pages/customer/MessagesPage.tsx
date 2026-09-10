// ============================================================
//  CarePoint — Messages + Thread view (customer side)
// ============================================================
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DB, counters } from '../../data/db';
import { pharmacyName, fmtDate } from '../../data/helpers';
import { useApp } from '../../context/AppContext';

const MessagesPage: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch, toast } = useApp();
  const [openThreadId, setOpenThreadId] = useState<string|null>(null);
  const [msgText, setMsgText] = useState('');
  const [pendingImage, setPendingImage] = useState<{ dataUrl:string; name:string }|null>(null);

  const custId = state.session.customer;
  if (!custId) { navigate('/auth', { replace:true }); return null; }

  // Shared lightbox (AppContext) — same instance used in MedicinePage
  const lightboxSrc    = state.lightbox?.src    ?? null;
  const lightboxZoomed = state.lightbox?.zoomed ?? false;

  function openLightbox(src: string) {
    dispatch({ type: 'SET_LIGHTBOX', lightbox: { src, zoomed: false } });
  }
  function closeLightbox() {
    dispatch({ type: 'SET_LIGHTBOX', lightbox: null });
  }

  const threads = DB.threads.filter((t) => t.customerId === custId);

  function openThread(id: string) {
    const t = DB.threads.find((x) => x.id === id);
    if (t) t.unreadForCustomer = false;
    setOpenThreadId(id);
    setMsgText('');
    setPendingImage(null);
  }

  function newRxUpload() {
    const ph = DB.pharmacies.find((p) => p.status === 'approved');
    if (!ph) { toast('No pharmacy available.','error'); return; }
    const tid = 't' + counters.thread++;
    DB.threads.push({
      id: tid, pharmacyId: ph.id, customerId: custId,
      type: 'prescription', medId: null as any, subject:'Prescription for review',
      status:'open', unreadForCustomer:false, unreadForStaff:false, messages:[],
    } as any);
    openThread(tid);
  }

  function sendMessage(threadId: string) {
    const t = DB.threads.find((x) => x.id === threadId);
    const text = msgText.trim();
    const image = pendingImage?.dataUrl ?? null;
    if (!text && !image) { toast('Type a message or attach a photo.','error'); return; }
    t?.messages.push({ from:'customer', text, image: image ?? undefined, at:new Date() } as any);
    if (t) { t.unreadForStaff = true; t.unreadForCustomer = false; }
    setPendingImage(null);
    setMsgText('');
    toast(image ? 'Rx photo sent.' : 'Message sent.','success');
    dispatch({ type:'SET_SEARCH', payload:{} });
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('Please choose an image.','error'); return; }
    if (file.size > 4*1024*1024) { toast('Image must be under 4MB.','error'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => { setPendingImage({ dataUrl: ev.target?.result as string, name:file.name }); };
    reader.readAsDataURL(file);
  }

  // ── Thread detail view ───────────────────────────────────
  if (openThreadId) {
    const t = DB.threads.find((x) => x.id === openThreadId);
    if (!t) return null;
    return (
      <div className="cp-page">
        {/* ── Lightbox overlay ─────────────────────────── */}
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
                alt="Rx preview"
                onClick={() => dispatch({ type: 'TOGGLE_LIGHTBOX_ZOOM' })}
                style={{ cursor: lightboxZoomed ? 'zoom-out' : 'zoom-in' }}
              />
            </div>
          </div>
        )}

        <div style={{ overflowY: "auto" }}>
          <div style={{ maxWidth:700, margin:'0 auto', padding:'28px 16px 80px' }}>
            <button className="cp-btn-link" onClick={() => setOpenThreadId(null)}>← Back</button>
            <div className="cp-card" style={{ marginTop:14 }}>
              <div className="cp-row-between">
                <h3 style={{ margin:0, fontFamily:'var(--cp-font-display)' }}>{t.subject}</h3>
                <span className={`cp-badge cp-badge-${t.status==='open'?'active':'completed'}`}>{t.status}</span>
              </div>
              <p className="cp-hint">
                {t.type==='prescription' ? 'Prescription inquiry' : 'Order-related'} · with {pharmacyName(t.pharmacyId)}
              </p>
              <div className="cp-divider" />

              {/* Messages */}
              <div style={{ marginBottom:14 }}>
                {t.messages.length === 0
                  ? <p className="cp-hint">Say hello to start.</p>
                  : t.messages.map((msg, i) => (
                    <div key={i} className={`cp-thread-bubble ${msg.from}`}>
                      {(msg as any).image && (
                        <img
                          src={(msg as any).image}
                          alt="Rx"
                          style={{ maxWidth:200, borderRadius:10, display:'block', marginBottom:6, cursor:'zoom-in' }}
                          onClick={() => openLightbox((msg as any).image)}
                          title="Click to view full size"
                        />
                      )}
                      {msg.text && <div>{msg.text}</div>}
                      <div className="meta">{msg.from==='staff' ? 'Pharmacy' : 'You'} · {fmtDate(msg.at)}</div>
                    </div>
                  ))}
              </div>

              {/* Compose */}
              <div className="cp-field">
                <textarea value={msgText} onChange={(e) => setMsgText(e.target.value)}
                  placeholder="Type your message…" rows={3} />
              </div>
              <div className="cp-field">
                {pendingImage
                  ? <div className="cp-img-preview">
                      <img src={pendingImage.dataUrl} alt="Rx" />
                      <button onClick={() => setPendingImage(null)}>✕</button>
                    </div>
                  : <label className="cp-upload-btn">
                      📜 Attach Rx photo
                      <input type="file" accept="image/*" style={{ display:'none' }} onChange={handleImageSelect} />
                    </label>}
                <p className="cp-hint">Upload a clear photo of the prescription.</p>
              </div>
              <button className="cp-btn cp-btn-primary" onClick={() => sendMessage(openThreadId)}>Send</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Thread list ──────────────────────────────────────────
  return (
    <div className="cp-page">
      <div style={{ overflowY: "auto" }}>
        <div style={{ maxWidth:700, margin:'0 auto', padding:'28px 16px 80px' }}>
          <button className="cp-btn-link" onClick={() => navigate('/')}>← Home</button>
          <h2 style={{ fontFamily:'var(--cp-font-display)', fontSize:26, margin:'12px 0 20px' }}>Messages</h2>
          <button className="cp-btn cp-btn-outline" style={{ marginBottom:16 }} onClick={newRxUpload}>
            📜 Upload Rx
          </button>
          {threads.length === 0
            ? <div className="cp-empty">
                <div className="cp-empty-icon">✉️</div>
                <div className="cp-empty-title">No messages</div>
              </div>
            : <div className="cp-card">
                {threads.map((t) => {
                  const last = t.messages[t.messages.length-1];
                  let preview = 'No messages yet';
                  if (last?.text) preview = last.text.slice(0,58) + (last.text.length>58?'…':'');
                  else if ((last as any)?.image) preview = '📎 Rx photo attached';
                  return (
                    <div key={t.id} className="cp-thread-list-row" onClick={() => openThread(t.id)}>
                      <div style={{ display:'flex', gap:10, alignItems:'flex-start', flex:1, minWidth:0 }}>
                        <span className="cp-dot" style={{ background:t.type==='prescription'?'var(--cp-yarrow)':'var(--cp-sage)', marginTop:6, flexShrink:0 }} />
                        <div style={{ minWidth:0 }}>
                          <div style={{ fontWeight:700, fontSize:13.5, fontFamily:'var(--cp-font-display)' }}>
                            {t.unreadForCustomer && <span className="cp-unread-dot" />}
                            {t.subject}
                          </div>
                          <div className="cp-hint">{pharmacyName(t.pharmacyId)} · {preview}</div>
                        </div>
                      </div>
                      <span className={`cp-badge cp-badge-${t.status==='open'?'active':'completed'}`}>{t.status}</span>
                    </div>
                  );
                })}
              </div>}
        </div>
      </div>
    </div>
  );
};

export default MessagesPage;
