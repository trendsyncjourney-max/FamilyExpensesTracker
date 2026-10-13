'use strict';
/* ============================================================
   Family Ledger — offline-first PWA
   Data lives entirely in IndexedDB. No server, no accounts.
   Two profiles (default: "Me" = husband, "Wife"), switchable
   in the header. Approvals always require the OTHER profile.
   ============================================================ */

/* ---------------- utilities ---------------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const pad2 = (n) => String(n).padStart(2, '0');
function toISO(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function todayStr() { return toISO(new Date()); }
function monthKey(iso) { return iso.slice(0, 7); }              // 'YYYY-MM'
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateShort(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
function fmtMoney(n) {
  const cur = (settings && settings.currency) || 'S$';
  const v = Number(n || 0);
  return cur + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function relDay(iso) {
  const t = todayStr();
  if (iso === t) return 'Today';
  const y = toISO(new Date(Date.now() - 864e5));
  if (iso === y) return 'Yesterday';
  return fmtDate(iso);
}

const CATEGORIES = ['Groceries', 'Dining', 'Transport', 'Utilities', 'Kids', 'Home', 'Health', 'Insurance', 'Leisure', 'Travel', 'Gifts', 'Education', 'Other'];
const CAT_ICONS = { Groceries: '🛒', Dining: '🍽️', Transport: '🚗', Utilities: '💡', Kids: '🧸', Home: '🏠', Health: '💊', Insurance: '🛡️', Leisure: '🎬', Travel: '✈️', Gifts: '🎁', Education: '📚', Other: '📦' };

/* ---------------- IndexedDB ---------------- */
const DB = (() => {
  const NAME = 'family-ledger', VER = 1;
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const req = indexedDB.open(NAME, VER);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('txns'))     db.createObjectStore('txns',     { keyPath: 'id' });
        if (!db.objectStoreNames.contains('advances')) db.createObjectStore('advances', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('plans'))    db.createObjectStore('plans',    { keyPath: 'id' });
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    return dbp;
  }
  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const out = fn(t.objectStore(store));
      t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
      t.onerror = () => rej(t.error);
    });
  }
  return {
    all:  (s) => open().then(db => new Promise((res, rej) => {
              const r = db.transaction(s).objectStore(s).getAll();
              r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })),
    put:  (s, v) => tx(s, 'readwrite', st => st.put(v)),
    del:  (s, k) => tx(s, 'readwrite', st => st.delete(k)),
    clear:(s)    => tx(s, 'readwrite', st => st.clear()),
  };
})();

/* ---------------- state ---------------- */
const state = {
  user: 'husband',                 // 'husband' | 'wife'
  page: 'dashboard',               // dashboard | receipts | money | calendar | personal | settings
  moneyTab: 'reimb',               // reimb | advances
  receiptFilter: 'all',            // all | active | returned | reimb | mine
  personalFilter: 'all',
  calMonth: null,                  // Date, 1st of month
  calSelected: todayStr(),
  pendingReceiptBlob: null,        // staged photo for forms
};
state.calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

let settings = null;
let data = { txns: [], advances: [], plans: [] };
const urlCache = new Map();       // receipt blob -> objectURL

function otherUser(u) { return u === 'husband' ? 'wife' : 'husband'; }
function userName(u) { return settings.users[u].name; }

async function loadSettings() {
  const rows = await DB.all('settings');
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
  settings = map.app || {
    currency: 'S$',
    users: { husband: { name: 'Me' }, wife: { name: 'Wife' } },
  };
  if (map.currentUser && map.currentUser.user) state.user = map.currentUser.user;
}
async function saveSetting(key, value) { await DB.put('settings', { key, value }); }
async function saveSettings() { await saveSetting('app', settings); }

async function reloadData() {
  const [txns, advances, plans] = await Promise.all([DB.all('txns'), DB.all('advances'), DB.all('plans')]);
  data.txns = txns.sort((a, b) => (b.date + (b.createdAt || '')).localeCompare(a.date + (a.createdAt || '')));
  data.advances = advances.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  data.plans = plans.sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------------- receipt image helpers ---------------- */
function blobUrl(blob) {
  if (!blob) return null;
  if (!urlCache.has(blob)) urlCache.set(blob, URL.createObjectURL(blob));
  return urlCache.get(blob);
}
function revokeUrls() { urlCache.forEach(u => URL.revokeObjectURL(u)); urlCache.clear(); }

function compressImage(file, maxDim = 1400, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > maxDim || h > maxDim) {
        const k = maxDim / Math.max(w, h);
        w = Math.round(w * k); h = Math.round(h * k);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not process image')), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}

/* ---------------- toast ---------------- */
function toast(msg, isError = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = msg;
  $('#toast-root').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2400);
  setTimeout(() => el.remove(), 2800);
}

/* ---------------- modal ---------------- */
function openModal(html) {
  $('#modal-card').innerHTML = html;
  $('#modal-root').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  $('#modal-root').classList.add('hidden');
  $('#modal-card').innerHTML = '';
  document.body.style.overflow = '';
  state.pendingReceiptBlob = null;
}
function confirmDialog(title, body, okLabel, onOk, danger = false) {
  openModal(`
    <div class="modal-title">${esc(title)}</div>
    <div class="modal-sub">${body}</div>
    <div class="btn-row">
      <button class="btn btn-outline" id="cf-cancel">Cancel</button>
      <button class="btn ${danger ? 'btn-red' : 'btn-primary'}" id="cf-ok">${esc(okLabel)}</button>
    </div>`);
  $('#cf-cancel').onclick = closeModal;
  $('#cf-ok').onclick = () => { closeModal(); onOk(); };
}

/* ---------------- image viewer ---------------- */
function openViewer(blob) {
  if (!blob) return;
  $('#viewer-img').src = blobUrl(blob);
  $('#viewer-root').classList.remove('hidden');
}

/* ---------------- PWA ---------------- */
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  $('#install-btn').classList.remove('hidden');
});
$('#install-btn').addEventListener('click', async () => {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  await deferredInstall.userChoice;
  deferredInstall = null;
  $('#install-btn').classList.add('hidden');
});
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* offline caching unavailable — app still works */ });
  });
}

/* ============================================================
   BUSINESS OPERATIONS
   ============================================================ */

/* ---- transactions (receipts) ----
   { id, scope:'family'|'personal', owner, paidBy, amount, category,
     date, merchant, note, receipt:Blob|null, status:'active'|'returned',
     returnNote, returnedAt, createdAt,
     reimb: null | { status:'pending'|'cleared', requestedBy, clearedBy, clearedAt } } */

async function createTxn(input) {
  const t = {
    id: uid(),
    scope: input.scope,
    owner: input.scope === 'personal' ? state.user : input.paidBy,
    paidBy: input.scope === 'personal' ? state.user : input.paidBy,
    amount: round2(input.amount),
    category: input.category || 'Other',
    date: input.date || todayStr(),
    merchant: (input.merchant || '').trim() || 'Untitled',
    note: (input.note || '').trim(),
    receipt: input.receipt || null,
    status: 'active',
    reimb: null,
    createdAt: new Date().toISOString(),
  };
  if (t.scope === 'family' && input.requestReimb && t.paidBy !== state.user) {
    t.reimb = { status: 'pending', requestedBy: state.user };
  }
  await DB.put('txns', t);
  await reloadData(); render();
  return t;
}

async function updateTxn(id, patch) {
  const t = data.txns.find(x => x.id === id);
  if (!t) return;
  Object.assign(t, patch, { amount: round2(patch.amount ?? t.amount) });
  await DB.put('txns', t);
  await reloadData(); render();
}

async function markReturned(id, note) {
  const t = data.txns.find(x => x.id === id);
  if (!t) return;
  t.status = 'returned'; t.returnNote = note; t.returnedAt = new Date().toISOString();
  await DB.put('txns', t);
  await reloadData(); render();
  toast('Marked as returned — item trace kept');
}

async function unmarkReturned(id) {
  const t = data.txns.find(x => x.id === id);
  if (!t) return;
  t.status = 'active'; t.returnNote = ''; t.returnedAt = null;
  await DB.put('txns', t);
  await reloadData(); render();
}

/* ---- reimbursements: clear a pending request ---- */
async function clearReimbursement(id) {
  const t = data.txns.find(x => x.id === id);
  if (!t || !t.reimb || t.reimb.status !== 'pending') return;
  t.reimb = { ...t.reimb, status: 'cleared', clearedBy: state.user, clearedAt: new Date().toISOString() };
  await DB.put('txns', t);
  await reloadData(); render();
  toast(`Reimbursement cleared — ${fmtMoney(t.amount)} paid to ${userName(t.reimb.requestedBy)}`);
}

/* ---- advances ----
   { id, amount, purpose, category, neededBy, note, requestedBy,
     status:'pending'|'approved'|'awaiting_receipt'|'settled'|'rejected',
     receipt:Blob|null, actualAmount, merchant, txnId, createdAt,
     approvedBy, approvedAt, settledAt } */

async function createAdvance(input) {
  const a = {
    id: uid(),
    amount: round2(input.amount),
    purpose: (input.purpose || '').trim() || 'Advance',
    category: input.category || 'Other',
    neededBy: input.neededBy || todayStr(),
    note: (input.note || '').trim(),
    requestedBy: state.user,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  await DB.put('advances', a);
  await reloadData(); render();
  toast(`Advance request sent to ${userName(otherUser(state.user))}`);
}

async function decideAdvance(id, approve) {
  const a = data.advances.find(x => x.id === id);
  if (!a || a.status !== 'pending') return;
  if (approve) {
    a.status = 'awaiting_receipt'; a.approvedBy = state.user; a.approvedAt = new Date().toISOString();
    toast(`Approved — ${fmtMoney(a.amount)} given. Receipt due after the event.`);
  } else {
    a.status = 'rejected'; a.approvedBy = state.user;
    toast('Advance request rejected');
  }
  await DB.put('advances', a);
  await reloadData(); render();
}

async function settleAdvance(id, input) {
  const a = data.advances.find(x => x.id === id);
  if (!a || a.status !== 'awaiting_receipt') return;
  const actual = round2(input.actualAmount);
  const t = await createTxn({
    scope: 'family', paidBy: a.approvedBy || otherUser(a.requestedBy),
    amount: actual, category: a.category, date: input.date || todayStr(),
    merchant: input.merchant || a.purpose, note: input.note || a.note,
    receipt: input.receipt || null,
  });
  // createTxn reloaded+rendered already; finish advance bookkeeping
  a.status = 'settled'; a.actualAmount = actual; a.receipt = input.receipt || null;
  a.merchant = input.merchant || a.purpose; a.txnId = t.id; a.settledAt = new Date().toISOString();
  await DB.put('advances', a);
  await reloadData(); render();
  const diff = round2(a.amount - actual);
  if (Math.abs(diff) < 0.005) toast('Advance fully settled ✓');
  else if (diff > 0) toast(`Settled — ${fmtMoney(diff)} change owed back by ${userName(a.requestedBy)}`);
  else toast(`Settled — extra ${fmtMoney(-diff)} added to reimbursement`);
}

/* ---- calendar plans ----
   { id, title, amount, date, category, note, status:'planned'|'paid'|'cancelled',
     createdBy, createdAt, txnId } */

async function createPlan(input) {
  const p = {
    id: uid(),
    title: (input.title || '').trim() || 'Planned expense',
    amount: round2(input.amount),
    date: input.date || todayStr(),
    category: input.category || 'Other',
    note: (input.note || '').trim(),
    status: 'planned',
    createdBy: state.user,
    createdAt: new Date().toISOString(),
  };
  await DB.put('plans', p);
  await reloadData(); render();
  toast('Planned expense added to calendar');
}

async function cancelPlan(id) {
  const p = data.plans.find(x => x.id === id);
  if (!p) return;
  p.status = 'cancelled';
  await DB.put('plans', p);
  await reloadData(); render();
}

async function markPlanPaid(id, input) {
  const p = data.plans.find(x => x.id === id);
  if (!p || p.status !== 'planned') return;
  const t = await createTxn({
    scope: 'family', paidBy: input.paidBy || state.user,
    amount: input.amount ?? p.amount, category: p.category,
    date: input.date || p.date, merchant: p.title, note: input.note || p.note,
    receipt: input.receipt || null,
  });
  p.status = 'paid'; p.txnId = t.id;
  await DB.put('plans', p);
  await reloadData(); render();
  toast('Plan marked as paid — receipt recorded');
}

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

/* ============================================================
   EXPORT / BACKUP
   ============================================================ */
function download(filename, content, mime = 'text/csv') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function txnsToCSV(list) {
  const head = ['Date', 'Merchant', 'Category', 'Paid by', 'Recorded by', 'Amount', 'Currency', 'Status', 'Reimbursement', 'Return note', 'Note', 'Has receipt'];
  const rows = list.map(t => [
    t.date, t.merchant, t.category, userName(t.paidBy), userName(t.owner),
    t.amount.toFixed(2), settings.currency, t.status,
    t.reimb ? t.reimb.status : '',
    t.status === 'returned' ? (t.returnNote || '') : '',
    t.note || '', t.receipt ? 'yes' : 'no',
  ]);
  return [head, ...rows].map(r => r.map(csvEscape).join(',')).join('\n');
}

function exportBackup() {
  const payload = { app: 'family-ledger', version: 1, exportedAt: new Date().toISOString(), settings, data };
  download(`family-ledger-backup-${todayStr()}.json`, JSON.stringify(payload, null, 2), 'application/json');
}

async function importBackup(file) {
  try {
    const payload = JSON.parse(await file.text());
    if (!payload || payload.app !== 'family-ledger') throw new Error('Not a Family Ledger backup');
    settings = payload.settings; await saveSettings();
    for (const s of ['txns', 'advances', 'plans']) await DB.clear(s);
    for (const t of payload.data.txns || []) await DB.put('txns', t);
    for (const a of payload.data.advances || []) await DB.put('advances', a);
    for (const p of payload.data.plans || []) await DB.put('plans', p);
    await reloadData(); renderProfileSwitch(); render();
    toast('Backup restored ✓');
  } catch (e) {
    toast('Restore failed: ' + e.message, true);
  }
}

/* ============================================================
   WHATSAPP SYNC — pull AI-processed receipts from the bot server
   ============================================================ */
function base64ToBlob(b64, mime) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: mime || 'image/jpeg' });
}

async function syncFromWhatsApp(opts = {}) {
  const cfg = settings.whatsapp || {};
  if (!cfg.serverUrl || !cfg.token) {
    if (!opts.quiet) toast('Set the server URL and sync token in Settings first', true);
    return 0;
  }
  try {
    const res = await fetch(cfg.serverUrl.replace(/\/+$/, '') + '/api/inbox?since=' + (cfg.lastSync || 0) + '&token=' + encodeURIComponent(cfg.token));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const recs = await res.json();
    let maxTs = cfg.lastSync || 0, added = 0;
    for (const r of recs) {
      maxTs = Math.max(maxTs, r.createdAt);
      const paidBy = r.profile === 'husband' || r.profile === 'wife' ? r.profile : state.user;
      await DB.put('txns', {
        id: 'wa-' + r.id,
        scope: r.scope === 'personal' ? 'personal' : 'family',
        owner: r.scope === 'personal' ? paidBy : paidBy,
        paidBy,
        amount: round2(r.amount),
        category: CATEGORIES.includes(r.category) ? r.category : 'Other',
        date: r.date || todayStr(),
        merchant: r.merchant || 'Untitled',
        note: r.caption ? '💬 ' + r.caption : '',
        receipt: r.image ? base64ToBlob(r.image, r.mime) : null,
        status: 'active',
        returnNote: '', returnedAt: null,
        reimb: null,
        via: 'whatsapp',
        createdAt: new Date(r.createdAt).toISOString(),
      });
      added++;
    }
    settings.whatsapp = { ...cfg, lastSync: maxTs };
    await saveSettings();
    if (added) { await reloadData(); render(); toast(`Synced ${added} WhatsApp receipt${added > 1 ? 's' : ''} 💬`); }
    else if (!opts.quiet) toast('WhatsApp inbox is up to date');
    return added;
  } catch (e) {
    if (!opts.quiet) toast('WhatsApp sync failed: ' + e.message, true);
    return 0;
  }
}

async function loadDemoData() {
  const iso = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return toISO(d); };
  const mk = (scope, paidBy, amount, category, offset, merchant, extra = {}) => ({
    id: uid(), scope, owner: scope === 'personal' ? paidBy : paidBy, paidBy,
    amount, category, date: iso(offset), merchant, note: extra.note || '',
    receipt: null, status: extra.status || 'active', returnNote: '', returnedAt: null,
    reimb: extra.reimb || null, createdAt: new Date(Date.now() + offset * 1e5).toISOString(),
  });
  const demo = [
    mk('family', 'wife', 86.40, 'Groceries', -3, 'FairPrice', { reimb: { status: 'pending', requestedBy: 'wife' } }),
    mk('family', 'wife', 128.00, 'Kids', -5, 'Toy Kingdom', { reimb: { status: 'cleared', requestedBy: 'wife', clearedBy: 'husband', clearedAt: new Date().toISOString() } }),
    mk('family', 'husband', 240.60, 'Utilities', -8, 'SP Services'),
    mk('family', 'wife', 45.50, 'Dining', -2, 'Swensens'),
    mk('family', 'husband', 32.90, 'Transport', -1, 'Esso'),
    mk('family', 'wife', 59.90, 'Home', -12, 'IKEA', { status: 'returned', note: 'Cushion cover — wrong colour' }),
    mk('personal', 'wife', 88.00, 'Leisure', -4, 'Sephora'),
    mk('personal', 'husband', 15.00, 'Dining', -6, 'Kopitiam'),
  ];
  for (const t of demo) await DB.put('txns', t);
  await DB.put('advances', {
    id: uid(), amount: 300, purpose: 'Kids birthday party deposit', category: 'Kids',
    neededBy: iso(2), note: 'Venue deposit at Party World', requestedBy: 'wife',
    status: 'awaiting_receipt', createdAt: new Date().toISOString(), approvedBy: 'husband', approvedAt: new Date().toISOString(),
  });
  await DB.put('advances', {
    id: uid(), amount: 150, purpose: 'Groceries top-up', category: 'Groceries',
    neededBy: iso(-1), note: '', requestedBy: 'wife',
    status: 'settled', createdAt: new Date().toISOString(), approvedBy: 'husband',
    actualAmount: 142.30, settledAt: new Date().toISOString(),
  });
  await DB.put('plans', { id: uid(), title: 'Insurance premium', amount: 420, date: iso(6), category: 'Insurance', note: 'Annual health', status: 'planned', createdBy: 'husband', createdAt: new Date().toISOString() });
  await DB.put('plans', { id: uid(), title: 'School excursion fee', amount: 65, date: iso(11), category: 'Education', note: 'For Emma', status: 'planned', createdBy: 'wife', createdAt: new Date().toISOString() });
  await DB.put('plans', { id: uid(), title: 'Groceries weekly', amount: 180, date: iso(3), category: 'Groceries', note: '', status: 'planned', createdBy: 'wife', createdAt: new Date().toISOString() });
  await reloadData(); render();
  toast('Demo data loaded — explore, then clear it in Settings');
}

/* ============================================================
   FORMS (modals)
   ============================================================ */
function receiptPickerHTML() {
  return `
    <div class="field full">
      <label>Receipt photo</label>
      <div id="rp-preview">${state.pendingReceiptBlob
        ? `<img class="receipt-preview" src="${blobUrl(state.pendingReceiptBlob)}" alt="Receipt preview">`
        : `<div class="receipt-placeholder">No photo yet — snap the receipt or pick from gallery</div>`}</div>
      <div class="btn-row">
        <button class="btn btn-outline btn-sm" type="button" id="rp-camera">📷 Take photo</button>
        <button class="btn btn-outline btn-sm" type="button" id="rp-gallery">🖼 Gallery</button>
      </div>
    </div>`;
}
function wireReceiptPicker(onChange) {
  $('#rp-camera').onclick = () => pickImage($('#camera-input'), onChange);
  $('#rp-gallery').onclick = () => pickImage($('#gallery-input'), onChange);
}
function pickImage(input, onChange) {
  input.value = '';
  input.onchange = async () => {
    const f = input.files && input.files[0];
    if (!f) return;
    try {
      state.pendingReceiptBlob = await compressImage(f);
      onChange && onChange();
    } catch { toast('Could not read that image', true); }
  };
  input.click();
}

function categoryOptions(sel) {
  return CATEGORIES.map(c => `<option value="${c}" ${c === sel ? 'selected' : ''}>${CAT_ICONS[c]} ${c}</option>`).join('');
}
function userSegmented(name, current) {
  return `<div class="segmented" id="seg-${name}">
    <button type="button" data-v="husband" class="${current === 'husband' ? 'active' : ''}">${esc(userName('husband'))}${state.user === 'husband' ? ' (me)' : ''}</button>
    <button type="button" data-v="wife" class="${current === 'wife' ? 'active' : ''}">${esc(userName('wife'))}${state.user === 'wife' ? ' (me)' : ''}</button>
  </div>`;
}
function wireSegmented(name, onChange) {
  const seg = $(`#seg-${name}`);
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    $$('button', seg).forEach(x => x.classList.toggle('active', x === b));
    onChange && onChange(b.dataset.v);
  });
  return () => ($(`#seg-${name} button.active`) || {}).dataset?.v;
}

/* ---- receipt / expense form (create & edit) ---- */
function openReceiptForm(opts = {}) {
  const editing = opts.edit || null;                 // txn being edited
  const fixedScope = opts.scope || null;             // 'personal' locks scope
  const presetDate = opts.date || todayStr();
  state.pendingReceiptBlob = editing ? editing.receipt : (opts.receipt || null);

  const isPersonal = fixedScope === 'personal';
  const title = editing ? 'Edit record' : (isPersonal ? 'Add personal expense' : 'Capture receipt');
  const sub = editing ? 'Adjust the details below.' :
    isPersonal ? `Private to ${esc(userName(state.user))} — never mixed with family books.`
    : 'Snapped receipts become accounting records automatically.';

  openModal(`
    <div class="modal-title">${title}</div>
    <div class="modal-sub">${sub}</div>
    <div class="form-grid">
      ${isPersonal ? '' : `
      <div class="field full"><label>Book</label>
        <div class="segmented" id="seg-scope">
          <button type="button" data-v="family" class="${(!editing || editing.scope === 'family') && opts.seg?.scope !== 'personal' ? 'active' : ''}">👪 Family</button>
          <button type="button" data-v="personal" class="${(editing && editing.scope === 'personal') || opts.seg?.scope === 'personal' ? 'active' : ''}">🔒 ${esc(userName(state.user))} — personal</button>
        </div>
      </div>`}
      <div class="field full"><label>Paid by</label>${userSegmented('paidBy', editing ? editing.paidBy : (opts.seg?.paidBy || state.user))}</div>
      <div class="field"><label>Amount</label>
        <input type="number" id="f-amount" inputmode="decimal" step="0.01" min="0" placeholder="0.00" value="${editing ? editing.amount : (opts.amount ?? '')}">
      </div>
      <div class="field"><label>Date</label><input type="date" id="f-date" value="${editing ? editing.date : presetDate}"></div>
      <div class="field"><label>Category</label><select id="f-category">${categoryOptions(editing ? editing.category : (opts.category || 'Groceries'))}</select></div>
      <div class="field"><label>Merchant / payee</label><input type="text" id="f-merchant" placeholder="e.g. FairPrice" value="${esc(editing ? editing.merchant : (opts.merchant || ''))}"></div>
      <div class="field full"><label>Note (optional)</label><input type="text" id="f-note" placeholder="What was this for?" value="${esc(editing ? editing.note : (opts.note || ''))}"></div>
      ${receiptPickerHTML()}
      <div class="field full hidden" id="reimb-wrap">
        <label id="reimb-label"></label>
        <div class="segmented" id="seg-reimb">
          <button type="button" data-v="yes" class="${opts.seg?.reimb === 'no' ? '' : 'active'}">🙋 Request reimbursement</button>
          <button type="button" data-v="no" class="${opts.seg?.reimb === 'no' ? 'active' : ''}">No reimbursement</button>
        </div>
      </div>
    </div>
    <div class="btn-row">
      <button class="btn btn-outline" id="f-cancel">Cancel</button>
      <button class="btn btn-primary" id="f-save">${editing ? 'Save changes' : 'Save record'}</button>
    </div>`);

  const getScope = isPersonal ? (() => 'personal') : wireSegmented('scope', () => refreshReimb());
  const getPaidBy = wireSegmented('paidBy', () => refreshReimb());
  const getReimb = wireSegmented('reimb', null);

  function refreshReimb() {
    if (editing) { $('#reimb-wrap').classList.add('hidden'); return; }
    const scope = getScope(), paidBy = getPaidBy();
    const show = scope === 'family' && paidBy !== state.user;
    $('#reimb-wrap').classList.toggle('hidden', !show);
    if (show) $('#reimb-label').textContent =
      `Paid by your own money? Ask ${userName(otherUser(state.user))} to pay you back`;
  }
  refreshReimb();
  wireReceiptPicker(() => openReceiptForm({ ...opts, edit: editing, receipt: state.pendingReceiptBlob, date: $('#f-date').value, amount: $('#f-amount').value, merchant: $('#f-merchant').value, note: $('#f-note').value, category: $('#f-category').value, seg: { scope: isPersonal ? undefined : getScope(), paidBy: getPaidBy(), reimb: getReimb() } }));

  $('#f-cancel').onclick = closeModal;
  $('#f-save').onclick = async () => {
    const amount = parseFloat($('#f-amount').value);
    if (!(amount > 0)) { toast('Enter an amount greater than zero', true); return; }
    const payload = {
      amount, date: $('#f-date').value || todayStr(),
      category: $('#f-category').value,
      merchant: $('#f-merchant').value, note: $('#f-note').value,
      receipt: state.pendingReceiptBlob,
    };
    if (editing) {
      await updateTxn(editing.id, payload);
      toast('Record updated');
    } else {
      await createTxn({
        ...payload,
        scope: getScope(), paidBy: getPaidBy(),
        requestReimb: getReimb() === 'yes',
      });
      toast(getScope() === 'personal' ? 'Personal expense saved 🔒' : 'Receipt recorded to family ledger');
    }
    closeModal();
  };
}

/* ---- advance request form ---- */
function openAdvanceForm() {
  openModal(`
    <div class="modal-title">Request an advance</div>
    <div class="modal-sub">For when an expense is too large to pay from your own pocket. ${esc(userName(otherUser(state.user)))} approves it first, then you submit the receipt after the event.</div>
    <div class="form-grid">
      <div class="field"><label>Amount needed</label><input type="number" id="a-amount" inputmode="decimal" step="0.01" min="0" placeholder="0.00"></div>
      <div class="field"><label>Needed by</label><input type="date" id="a-needed" value="${todayStr()}"></div>
      <div class="field"><label>Category</label><select id="a-category">${categoryOptions('Other')}</select></div>
      <div class="field"><label>For (merchant / occasion)</label><input type="text" id="a-purpose" placeholder="e.g. Kids party venue"></div>
      <div class="field full"><label>Note (optional)</label><input type="text" id="a-note" placeholder="Anything ${esc(userName(otherUser(state.user)))} should know"></div>
    </div>
    <div class="btn-row">
      <button class="btn btn-outline" id="a-cancel">Cancel</button>
      <button class="btn btn-coral" id="a-send">Send request</button>
    </div>`);
  $('#a-cancel').onclick = closeModal;
  $('#a-send').onclick = async () => {
    const amount = parseFloat($('#a-amount').value);
    if (!(amount > 0)) { toast('Enter an amount greater than zero', true); return; }
    closeModal();
    await createAdvance({
      amount, neededBy: $('#a-needed').value, category: $('#a-category').value,
      purpose: $('#a-purpose').value, note: $('#a-note').value,
    });
  };
}

/* ---- settle an approved advance with the real receipt ---- */
function openSettleForm(adv, keep = {}) {
  state.pendingReceiptBlob = keep.receipt !== undefined ? keep.receipt : null;
  openModal(`
    <div class="modal-title">Submit receipt &amp; settle</div>
    <div class="modal-sub">Advance approved: <b class="mono">${fmtMoney(adv.amount)}</b> for “${esc(adv.purpose)}”. Enter the actual amount from the receipt.</div>
    <div class="form-grid">
      <div class="field"><label>Actual amount</label><input type="number" id="s-amount" inputmode="decimal" step="0.01" min="0" value="${keep.actual ?? adv.amount}"></div>
      <div class="field"><label>Date of spend</label><input type="date" id="s-date" value="${keep.date || todayStr()}"></div>
      <div class="field full"><label>Merchant (if different)</label><input type="text" id="s-merchant" value="${esc(keep.merchant ?? adv.purpose)}"></div>
      ${receiptPickerHTML()}
    </div>
    <div class="btn-row">
      <button class="btn btn-outline" id="s-cancel">Cancel</button>
      <button class="btn btn-green" id="s-save">Settle advance</button>
    </div>`);
  wireReceiptPicker(() => openSettleForm(adv, { actual: $('#s-amount').value, date: $('#s-date').value, merchant: $('#s-merchant').value, receipt: state.pendingReceiptBlob }));
  $('#s-cancel').onclick = closeModal;
  $('#s-save').onclick = async () => {
    const actual = parseFloat($('#s-amount').value);
    if (!(actual > 0)) { toast('Enter the actual amount', true); return; }
    closeModal();
    await settleAdvance(adv.id, {
      actualAmount: actual, date: $('#s-date').value,
      merchant: $('#s-merchant').value, receipt: state.pendingReceiptBlob,
    });
  };
}

/* ---- plan form (calendar projected expense) ---- */
function openPlanForm(dateStr) {
  openModal(`
    <div class="modal-title">Plan a projected expense</div>
    <div class="modal-sub">Shows on the family calendar so upcoming costs are never a surprise.</div>
    <div class="form-grid">
      <div class="field"><label>Title</label><input type="text" id="p-title" placeholder="e.g. Insurance premium"></div>
      <div class="field"><label>Amount</label><input type="number" id="p-amount" inputmode="decimal" step="0.01" min="0" placeholder="0.00"></div>
      <div class="field"><label>Date</label><input type="date" id="p-date" value="${dateStr || todayStr()}"></div>
      <div class="field"><label>Category</label><select id="p-category">${categoryOptions('Other')}</select></div>
      <div class="field full"><label>Note (optional)</label><input type="text" id="p-note" placeholder="Details"></div>
    </div>
    <div class="btn-row">
      <button class="btn btn-outline" id="p-cancel">Cancel</button>
      <button class="btn btn-primary" id="p-save">Add to calendar</button>
    </div>`);
  $('#p-cancel').onclick = closeModal;
  $('#p-save').onclick = async () => {
    const amount = parseFloat($('#p-amount').value);
    if (!(amount > 0)) { toast('Enter an amount greater than zero', true); return; }
    closeModal();
    await createPlan({ title: $('#p-title').value, amount, date: $('#p-date').value, category: $('#p-category').value, note: $('#p-note').value });
  };
}

/* ---- mark a planned expense as paid ---- */
function openPlanPayForm(plan, keep = {}) {
  state.pendingReceiptBlob = keep.receipt !== undefined ? keep.receipt : null;
  openModal(`
    <div class="modal-title">Mark “${esc(plan.title)}” as paid</div>
    <div class="modal-sub">Records the actual receipt into the family ledger and closes the plan.</div>
    <div class="form-grid">
      <div class="field"><label>Actual amount</label><input type="number" id="pp-amount" inputmode="decimal" step="0.01" min="0" value="${keep.amount ?? plan.amount}"></div>
      <div class="field"><label>Paid by</label>${userSegmented('ppPaidBy', keep.paidBy || state.user)}</div>
      <div class="field"><label>Date</label><input type="date" id="pp-date" value="${keep.date || todayStr()}"></div>
      <div class="field"><label>Merchant</label><input type="text" id="pp-merchant" value="${esc(keep.merchant ?? plan.title)}"></div>
      ${receiptPickerHTML()}
    </div>
    <div class="btn-row">
      <button class="btn btn-outline" id="pp-cancel">Cancel</button>
      <button class="btn btn-green" id="pp-save">Record payment</button>
    </div>`);
  const getPaidBy = wireSegmented('ppPaidBy', null);
  wireReceiptPicker(() => openPlanPayForm(plan, { amount: $('#pp-amount').value, paidBy: getPaidBy(), date: $('#pp-date').value, merchant: $('#pp-merchant').value, receipt: state.pendingReceiptBlob }));
  $('#pp-cancel').onclick = closeModal;
  $('#pp-save').onclick = async () => {
    const amount = parseFloat($('#pp-amount').value);
    if (!(amount > 0)) { toast('Enter an amount greater than zero', true); return; }
    closeModal();
    await markPlanPaid(plan.id, {
      amount, paidBy: getPaidBy(), date: $('#pp-date').value,
      merchant: $('#pp-merchant').value, receipt: state.pendingReceiptBlob,
    });
  };
}

/* ---- return dialog ---- */
function openReturnDialog(txn) {
  openModal(`
    <div class="modal-title">Return an item</div>
    <div class="modal-sub">The record stays in the books with its receipt for traceability — it is flagged <b>Returned</b> and excluded from active totals.</div>
    <div class="field"><label>What is being returned?</label><input type="text" id="r-note" placeholder="e.g. Cushion cover — wrong colour"></div>
    <div class="btn-row">
      <button class="btn btn-outline" id="r-cancel">Cancel</button>
      <button class="btn btn-red" id="r-ok">Mark returned</button>
    </div>`);
  $('#r-cancel').onclick = closeModal;
  $('#r-ok').onclick = async () => {
    closeModal();
    await markReturned(txn.id, $('#r-note').value.trim());
  };
}

/* ---- transaction detail sheet ---- */
function openTxnDetail(txn) {
  const isPersonal = txn.scope === 'personal';
  const receiptUrl = blobUrl(txn.receipt);
  openModal(`
    <div class="modal-title">${esc(txn.merchant)}</div>
    <div class="modal-sub">${isPersonal ? '🔒 Personal — ' + esc(userName(txn.owner)) : '👪 Family record'} · ${esc(CAT_ICONS[txn.category] || '📦')} ${esc(txn.category)}</div>
    ${receiptUrl ? `<img class="receipt-photo" src="${receiptUrl}" id="d-photo" alt="Receipt">` : ''}
    <div class="card" style="margin-top:12px">
      <div class="kv"><span>Amount</span><b class="mono">${fmtMoney(txn.amount)}</b></div>
      <div class="kv"><span>Date</span><b>${fmtDate(txn.date)}</b></div>
      <div class="kv"><span>Paid by</span><b>${esc(userName(txn.paidBy))}</b></div>
      <div class="kv"><span>Status</span><b>${txn.status === 'returned' ? '↩️ Returned' : '✅ Active'}</b></div>
      ${txn.reimb ? `<div class="kv"><span>Reimbursement</span><b>${txn.reimb.status === 'pending' ? '⏳ Pending — owed to ' + esc(userName(txn.reimb.requestedBy)) : '✅ Cleared by ' + esc(userName(txn.reimb.clearedBy || '')) + ' · ' + fmtDate((txn.reimb.clearedAt || '').slice(0, 10))}</b></div>` : ''}
      ${txn.status === 'returned' ? `<div class="kv"><span>Returned</span><b>${esc(txn.returnNote || '—')} · ${fmtDate((txn.returnedAt || '').slice(0, 10))}</b></div>` : ''}
      ${txn.note ? `<div class="kv"><span>Note</span><b>${esc(txn.note)}</b></div>` : ''}
      <div class="kv"><span>Recorded</span><b>${new Date(txn.createdAt).toLocaleString()}</b></div>
    </div>
    <div class="btn-row">
      ${txn.status === 'active' ? `<button class="btn btn-outline" id="d-return">↩️ Return</button>` : `<button class="btn btn-outline" id="d-unreturn">↪️ Un-mark return</button>`}
      <button class="btn btn-outline" id="d-edit">✏️ Edit</button>
      <button class="btn btn-red" id="d-del">🗑 Delete</button>
    </div>
    <div class="btn-row"><button class="btn btn-outline btn-block" id="d-close">Close</button></div>`);
  if (receiptUrl) $('#d-photo').onclick = () => openViewer(txn.receipt);
  $('#d-close').onclick = closeModal;
  if ($('#d-return')) $('#d-return').onclick = () => openReturnDialog(txn);
  if ($('#d-unreturn')) $('#d-unreturn').onclick = async () => { closeModal(); await unmarkReturned(txn.id); };
  $('#d-edit').onclick = () => openReceiptForm({ edit: txn });
  $('#d-del').onclick = () => confirmDialog('Delete this record?', 'The receipt photo will be deleted too. This cannot be undone.', 'Delete', async () => {
    await DB.del('txns', txn.id); await reloadData(); render(); toast('Record deleted');
  }, true);
}

/* ============================================================
   SHARED RENDER HELPERS
   ============================================================ */
function userDot(u) { return `<span class="avatar-dot dot-${u}">${esc(userName(u).slice(0, 1).toUpperCase())}</span>`; }
function receiptThumb(t) {
  const url = blobUrl(t.receipt);
  return url ? `<img class="txn-thumb" src="${url}" alt="" loading="lazy">`
             : `<div class="txn-thumb placeholder">${CAT_ICONS[t.category] || '📦'}</div>`;
}
function txnRowHTML(t, { showScope = false } = {}) {
  const isPersonal = t.scope === 'personal';
  const badges = [];
  if (showScope) badges.push(isPersonal ? '<span class="badge badge-violet">🔒 personal</span>' : '<span class="badge badge-teal">👪 family</span>');
  if (t.via === 'whatsapp') badges.push('<span class="badge badge-teal">💬 WhatsApp</span>');
  if (t.status === 'returned') badges.push('<span class="badge badge-red">↩ returned</span>');
  if (t.reimb) badges.push(t.reimb.status === 'pending'
    ? `<span class="badge badge-gold">⏳ reimb · ${esc(userName(t.reimb.requestedBy))}</span>`
    : `<span class="badge badge-green">✅ reimbursed</span>`);
  return `<div class="card clickable" data-txn="${t.id}">
    <div class="txn-row">
      ${receiptThumb(t)}
      <div class="txn-body">
        <div class="txn-top"><span class="txn-merchant">${esc(t.merchant)}</span><span class="txn-amount mono">${fmtMoney(t.amount)}</span></div>
        <div class="txn-meta">
          <span>${fmtDateShort(t.date)}</span><span>${esc(CAT_ICONS[t.category] || '')} ${esc(t.category)}</span>
          <span style="display:inline-flex;align-items:center;gap:4px">${userDot(t.paidBy)} ${esc(userName(t.paidBy))}</span>
        </div>
        ${badges.length ? `<div class="txn-meta" style="margin-top:5px">${badges.join(' ')}</div>` : ''}
        ${t.note ? `<div class="txn-note">${esc(t.note)}</div>` : ''}
      </div>
    </div>
  </div>`;
}
function wireTxnRows(root) {
  $$('[data-txn]', root).forEach(el => el.onclick = () => {
    const t = data.txns.find(x => x.id === el.dataset.txn);
    if (t) openTxnDetail(t);
  });
}
function emptyState(ico, title, sub) {
  return `<div class="empty"><div class="empty-ico">${ico}</div><div class="empty-title">${title}</div><div class="empty-sub">${sub}</div></div>`;
}

/* ============================================================
   PAGES
   ============================================================ */
function familyTxns() { return data.txns.filter(t => t.scope === 'family'); }
function activeFamily() { return familyTxns().filter(t => t.status === 'active'); }
function personalTxns(u = state.user) { return data.txns.filter(t => t.scope === 'personal' && t.owner === u); }

/* ---------- dashboard ---------- */
function renderDashboard() {
  const mk = monthKey(todayStr());
  const monthSpend = activeFamily().filter(t => monthKey(t.date) === mk).reduce((s, t) => s + t.amount, 0);
  const pendingReimb = familyTxns().filter(t => t.reimb && t.reimb.status === 'pending');
  const owedToMe = pendingReimb.filter(t => t.reimb.requestedBy === state.user).reduce((s, t) => s + t.amount, 0);
  const iOwe = pendingReimb.filter(t => t.reimb.requestedBy !== state.user).reduce((s, t) => s + t.amount, 0);
  const myOpenAdv = data.advances.filter(a => a.requestedBy === state.user && (a.status === 'pending' || a.status === 'awaiting_receipt'));
  const toApprove = data.advances.filter(a => a.status === 'pending' && a.requestedBy !== state.user);
  const toClear = pendingReimb.filter(t => t.reimb.requestedBy !== state.user);
  const soon = data.plans.filter(p => p.status === 'planned' && p.date >= todayStr() && p.date <= toISO(new Date(Date.now() + 30 * 864e5)));
  const upcoming = soon.slice(0, 4);

  // attention banner
  let attention = '';
  if (toApprove.length) attention += `<div class="hint-box">🙋 <b>${userName(toApprove[0].requestedBy)}</b> is asking for ${toApprove.map(a => fmtMoney(a.amount)).join(' + ')} in advance${toApprove.length > 1 ? 's' : ''} — <b>review in the Money tab</b>.</div>`;
  if (toClear.length) attention += `<div class="hint-box">💸 ${toClear.length} reimbursement${toClear.length > 1 ? 's' : ''} waiting for you to clear (${fmtMoney(toClear.reduce((s, t) => s + t.amount, 0))}) — <b>Money tab</b>.</div>`;
  if (myOpenAdv.length) attention += `<div class="hint-box">📌 You have ${myOpenAdv.length} open advance request${myOpenAdv.length > 1 ? 's' : ''}${myOpenAdv.some(a => a.status === 'awaiting_receipt') ? ' — don’t forget the receipt after the event!' : ''}</div>`;

  // category breakdown (this month)
  const byCat = {};
  activeFamily().filter(t => monthKey(t.date) === mk).forEach(t => byCat[t.category] = (byCat[t.category] || 0) + t.amount);
  const catEntries = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const catMax = catEntries.length ? catEntries[0][1] : 1;
  const catBars = catEntries.map(([c, v]) => `
    <div class="cat-row">
      <span class="cat-name">${CAT_ICONS[c] || '📦'} ${esc(c)}</span>
      <div class="cat-bar-wrap"><div class="bar-track"><div class="bar-fill" style="width:${Math.round(v / catMax * 100)}%"></div></div></div>
      <span class="cat-amt mono">${fmtMoney(v)}</span>
    </div>`).join('');

  const recent = data.txns.slice(0, 5);

  return `<div class="page">
    <div class="page-title">Hi ${esc(userName(state.user))} 👋</div>
    <div class="page-sub">Here is the family money picture.</div>
    ${attention}
    <div class="stats-grid">
      <div class="stat-tile stat-teal"><div class="stat-label">Family spend · ${new Date().toLocaleDateString(undefined, { month: 'long' })}</div><div class="stat-value mono">${fmtMoney(monthSpend)}</div><div class="stat-hint">active receipts this month</div></div>
      <div class="stat-tile stat-coral"><div class="stat-label">${owedToMe > 0 ? 'Owed to me' : iOwe > 0 ? 'I owe' : 'Reimbursements'}</div><div class="stat-value mono">${fmtMoney(Math.max(owedToMe, iOwe))}</div><div class="stat-hint">${pendingReimb.length} pending request${pendingReimb.length !== 1 ? 's' : ''}</div></div>
      <div class="stat-tile stat-gold"><div class="stat-label">Open advances</div><div class="stat-value">${myOpenAdv.length + toApprove.length}</div><div class="stat-hint">${toApprove.length ? `${toApprove.length} awaiting your approval` : 'money given ahead of spends'}</div></div>
      <div class="stat-tile stat-violet"><div class="stat-label">Planned · next 30 days</div><div class="stat-value mono">${fmtMoney(soon.reduce((s, p) => s + p.amount, 0))}</div><div class="stat-hint">${soon.length} projected expense${soon.length !== 1 ? 's' : ''} on calendar</div></div>
    </div>

    <div class="list-label"><h3>Spending by category</h3><span>this month</span></div>
    <div class="card">${catBars || emptyState('📊', 'Nothing yet', 'Capture a family receipt and the breakdown appears here.')}</div>

    ${upcoming.length ? `
    <div class="list-label"><h3>Coming up</h3><span>next 30 days</span></div>
    <div class="card">${upcoming.map(p => `
      <div class="kv"><span>📅 ${esc(p.title)} <span style="color:var(--ink-3)">· ${relDay(p.date)}</span></span><b class="mono">${fmtMoney(p.amount)}</b></div>`).join('')}
      <div class="btn-row"><button class="btn btn-outline btn-sm btn-block" id="dash-goto-cal">Open calendar</button></div>
    </div>` : ''}

    <div class="list-label"><h3>Recent activity</h3><span>${data.txns.length} records</span></div>
    ${recent.map(t => txnRowHTML(t, { showScope: true })).join('') || emptyState('🧾', 'No records yet', 'Tap the coral ＋ Receipt button to snap your first receipt.')}
  </div>`;
}
function wireDashboard() {
  const b = $('#dash-goto-cal'); if (b) b.onclick = () => go('calendar');
  wireTxnRows($('#app'));
}

/* ---------- receipts (family ledger) ---------- */
function renderReceipts() {
  let list = familyTxns();
  const f = state.receiptFilter;
  if (f === 'active') list = list.filter(t => t.status === 'active');
  if (f === 'returned') list = list.filter(t => t.status === 'returned');
  if (f === 'reimb') list = list.filter(t => t.reimb && t.reimb.status === 'pending');
  if (f === 'wa') list = list.filter(t => t.via === 'whatsapp');
  if (f === 'mine') list = list.filter(t => t.paidBy === state.user);
  const active = activeFamily();
  const returned = familyTxns().filter(t => t.status === 'returned');
  const waCount = familyTxns().filter(t => t.via === 'whatsapp').length;

  const chips = [
    ['all', 'All'], ['active', `Active · ${active.length}`], ['returned', `Returned · ${returned.length}`],
    ['reimb', 'Needs reimb'], ['wa', `WhatsApp · ${waCount}`], ['mine', 'Paid by me'],
  ].map(([v, l]) => `<button class="chip ${state.receiptFilter === v ? 'active' : ''}" data-filter="${v}">${l}</button>`).join('');

  return `<div class="page">
    <div class="page-title">Family receipts</div>
    <div class="page-sub">Every receipt becomes an accounting record — returned items stay traceable.</div>
    <div class="chip-row">${chips}</div>
    ${list.map(t => txnRowHTML(t)).join('') || emptyState('🧾', 'Nothing here', f === 'all' ? 'Tap ＋ Receipt to capture one.' : 'No records match this filter.')}
  </div>`;
}
function wireReceipts() {
  $$('#app .chip').forEach(c => c.onclick = () => { state.receiptFilter = c.dataset.filter; render(); });
  wireTxnRows($('#app'));
}

/* ---------- money: reimbursements + advances ---------- */
function renderMoney() {
  const tab = state.moneyTab;
  const pending = familyTxns().filter(t => t.reimb && t.reimb.status === 'pending');
  const history = familyTxns().filter(t => t.reimb && t.reimb.status === 'cleared');
  const myPending = pending.filter(t => t.reimb.requestedBy === state.user);
  const toClear = pending.filter(t => t.reimb.requestedBy !== state.user);

  const openAdv = data.advances.filter(a => a.status === 'pending' || a.status === 'awaiting_receipt');
  const settledAdv = data.advances.filter(a => a.status === 'settled' || a.status === 'rejected');

  const reimbHTML = `
    ${toClear.length ? `<div class="hint-box">💸 <b>Your move:</b> ${userName(toClear[0].reimb.requestedBy)} paid these from her own pocket — clear them once you have paid her back.</div>` : ''}
    <div class="list-label"><h3>Awaiting payment by you</h3><span>${toClear.length} item${toClear.length !== 1 ? 's' : ''}</span></div>
    ${toClear.map(t => `
      <div class="card">
        <div class="txn-row">${receiptThumb(t)}<div class="txn-body">
          <div class="txn-top"><span class="txn-merchant">${esc(t.merchant)}</span><span class="txn-amount mono">${fmtMoney(t.amount)}</span></div>
          <div class="txn-meta"><span>${fmtDate(t.date)}</span><span>${esc(t.category)}</span><span>requested by ${esc(userName(t.reimb.requestedBy))}</span></div>
        </div></div>
        <div class="txn-actions">
          <button class="btn btn-green" data-clear="${t.id}">✅ Paid · clear reimbursement</button>
          <button class="btn btn-outline" data-view="${t.id}">View</button>
        </div>
      </div>`).join('') || emptyState('✅', 'All caught up', 'No reimbursements waiting for your action.')}

    ${myPending.length ? `
    <div class="list-label"><h3>Waiting for ${esc(userName(otherUser(state.user)))} to pay you</h3><span>${myPending.length} item${myPending.length !== 1 ? 's' : ''}</span></div>
    ${myPending.map(t => `<div class="card"><div class="txn-row">${receiptThumb(t)}<div class="txn-body">
        <div class="txn-top"><span class="txn-merchant">${esc(t.merchant)}</span><span class="txn-amount mono">${fmtMoney(t.amount)}</span></div>
        <div class="txn-meta"><span>${fmtDate(t.date)}</span><span class="badge badge-gold">⏳ pending</span></div>
      </div></div></div>`).join('')}` : ''}

    <div class="list-label"><h3>Cleared history</h3><span>${history.length}</span></div>
    ${history.map(t => `<div class="card"><div class="txn-row">${receiptThumb(t)}<div class="txn-body">
        <div class="txn-top"><span class="txn-merchant">${esc(t.merchant)}</span><span class="txn-amount mono">${fmtMoney(t.amount)}</span></div>
        <div class="txn-meta"><span>${fmtDate(t.date)}</span><span class="badge badge-green">✅ cleared by ${esc(userName(t.reimb.clearedBy || ''))} · ${fmtDate((t.reimb.clearedAt || '').slice(0, 10))}</span></div>
      </div></div></div>`).join('') || emptyState('🗂', 'No cleared reimbursements yet', 'Cleared requests land here for your records.')}`;

  const advCard = (a) => {
    const mine = a.requestedBy === state.user;
    const other = userName(otherUser(a.requestedBy));
    const statusBadge = {
      pending: `<span class="badge badge-gold">⏳ awaiting ${esc(other)}’s approval</span>`,
      awaiting_receipt: `<span class="badge badge-teal">📸 approved — receipt due</span>`,
      settled: `<span class="badge badge-green">✅ settled</span>`,
      rejected: `<span class="badge badge-red">✗ rejected</span>`,
    }[a.status];
    let diff = '';
    if (a.status === 'settled' && a.actualAmount != null) {
      const d = round2(a.amount - a.actualAmount);
      if (Math.abs(d) >= 0.005) diff = `<div class="txn-note">Actual ${fmtMoney(a.actualAmount)} — ${d > 0 ? `<span class="delta-neg">${fmtMoney(d)} change owed back</span>` : `<span class="delta-pos">${fmtMoney(-d)} overspent</span>`}</div>`;
      else diff = `<div class="txn-note">Actual ${fmtMoney(a.actualAmount)} — exact match ✓</div>`;
    }
    return `<div class="card">
      <div class="txn-top"><span class="txn-merchant">${esc(a.purpose)}</span><span class="txn-amount mono">${fmtMoney(a.amount)}</span></div>
      <div class="txn-meta"><span>by ${fmtDate(a.neededBy)}</span><span>${esc(a.category)}</span><span>requested by ${esc(userName(a.requestedBy))}</span></div>
      <div class="txn-meta" style="margin-top:5px">${statusBadge}</div>
      ${a.note ? `<div class="txn-note">${esc(a.note)}</div>` : ''}
      ${diff}
      <div class="txn-actions">
        ${a.status === 'pending' && !mine ? `<button class="btn btn-green" data-adv-approve="${a.id}">✅ Approve &amp; give money</button><button class="btn btn-red" data-adv-reject="${a.id}">Reject</button>` : ''}
        ${a.status === 'awaiting_receipt' && mine ? `<button class="btn btn-primary" data-adv-settle="${a.id}">📸 Submit receipt &amp; settle</button>` : ''}
        ${a.status === 'awaiting_receipt' && !mine ? `<span class="txn-note">Waiting for ${esc(userName(a.requestedBy))}’s receipt…</span>` : ''}
      </div>
    </div>`;
  };

  const advHTML = `
    <div class="hint-box">💡 <b>How advances work:</b> 1) request money for a big expense → 2) ${esc(userName(otherUser(state.user)))} approves and hands over the cash → 3) you submit the receipt after the event and the advance closes.</div>
    <div class="btn-row" style="margin-top:0"><button class="btn btn-coral btn-block" id="adv-new">＋ Request an advance</button></div>
    <div class="list-label"><h3>Open requests</h3><span>${openAdv.length}</span></div>
    ${openAdv.map(advCard).join('') || emptyState('🤝', 'No open advances', 'Big upcoming expense? Ask for an advance instead of fronting your own cash.')}
    <div class="list-label"><h3>History</h3><span>${settledAdv.length}</span></div>
    ${settledAdv.map(advCard).join('') || emptyState('🗂', 'No past advances', 'Settled and rejected requests are kept here.')}`;

  return `<div class="page">
    <div class="page-title">Money between us</div>
    <div class="page-sub">Reimbursements for receipts already paid, and advances for money needed up front.</div>
    <div class="segmented" id="money-tabs" style="margin-bottom:14px">
      <button data-v="reimb" class="${tab === 'reimb' ? 'active' : ''}">💸 Reimbursements${pending.length ? ` (${pending.length})` : ''}</button>
      <button data-v="advances" class="${tab === 'advances' ? 'active' : ''}">🤝 Advances${openAdv.length ? ` (${openAdv.length})` : ''}</button>
    </div>
    ${tab === 'reimb' ? reimbHTML : advHTML}
  </div>`;
}
function wireMoney() {
  $$('#money-tabs button').forEach(b => b.onclick = () => { state.moneyTab = b.dataset.v; render(); });
  $$('#app [data-clear]').forEach(b => b.onclick = () => {
    const t = data.txns.find(x => x.id === b.dataset.clear);
    confirmDialog('Clear this reimbursement?', `Confirm you have paid ${userName(t.reimb.requestedBy)} ${fmtMoney(t.amount)} for “${esc(t.merchant)}”. It will be marked cleared in the books.`, 'Yes, paid', () => clearReimbursement(t.id));
  });
  $$('#app [data-view]').forEach(b => b.onclick = () => { const t = data.txns.find(x => x.id === b.dataset.view); if (t) openTxnDetail(t); });
  $$('#app [data-adv-approve]').forEach(b => b.onclick = () => {
    const a = data.advances.find(x => x.id === b.dataset.advApprove);
    confirmDialog('Approve advance?', `Give ${userName(a.requestedBy)} ${fmtMoney(a.amount)} for “${esc(a.purpose)}”. The request stays open until the receipt is submitted.`, 'Approve & give', () => decideAdvance(a.id, true));
  });
  $$('#app [data-adv-reject]').forEach(b => b.onclick = () => {
    const a = data.advances.find(x => x.id === b.dataset.advReject);
    confirmDialog('Reject this advance?', `“${esc(a.purpose)}” — ${fmtMoney(a.amount)}. ${userName(a.requestedBy)} will see it as rejected.`, 'Reject', () => decideAdvance(a.id, false), true);
  });
  $$('#app [data-adv-settle]').forEach(b => b.onclick = () => { const a = data.advances.find(x => x.id === b.dataset.advSettle); if (a) openSettleForm(a); });
  const nb = $('#adv-new'); if (nb) nb.onclick = openAdvanceForm;
}

/* ---------- calendar ---------- */
function renderCalendar() {
  const m = state.calMonth;
  const y = m.getFullYear(), mo = m.getMonth();
  const monthLabel = m.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const first = new Date(y, mo, 1);
  const startDow = (first.getDay() + 6) % 7; // Monday-first
  const gridStart = new Date(y, mo, 1 - startDow);
  const mk = `${y}-${pad2(mo + 1)}`;

  const plansByDay = {};
  data.plans.filter(p => p.status === 'planned').forEach(p => { (plansByDay[p.date] = plansByDay[p.date] || []).push(p); });
  const txnsByDay = {};
  activeFamily().filter(t => monthKey(t.date) === mk).forEach(t => { txnsByDay[t.date] = (txnsByDay[t.date] || 0) + t.amount; });

  const plannedTotal = Object.values(plansByDay).flat().filter(p => monthKey(p.date) === mk).reduce((s, p) => s + p.amount, 0);
  const actualTotal = Object.values(txnsByDay).reduce((s, v) => s + v, 0);

  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const iso = toISO(d);
    const inMonth = d.getMonth() === mo;
    const plans = plansByDay[iso] || [];
    const txnAmt = txnsByDay[iso];
    const pills = plans.slice(0, 2).map(p => `<span class="cal-pill cal-pill-plan">📌 ${esc(p.title)}</span>`).join('')
      + (plans.length > 2 ? `<span class="cal-more">+${plans.length - 2} more</span>` : '')
      + (txnAmt ? `<span class="cal-pill cal-pill-txn mono">${fmtMoney(txnAmt)}</span>` : '');
    cells += `<div class="cal-cell ${inMonth ? '' : 'other'} ${iso === todayStr() ? 'today' : ''} ${iso === state.calSelected ? 'selected' : ''}" data-day="${iso}">
      <span class="cal-date">${d.getDate()}</span>${pills}</div>`;
  }
  const dows = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="cal-dow">${d}</div>`).join('');

  return `<div class="page">
    <div class="page-title">Family calendar</div>
    <div class="page-sub">Projected expenses on 📌 gold · actual family spend in teal.</div>
    <div class="card">
      <div class="cal-header">
        <button class="btn btn-outline btn-sm" id="cal-prev">‹ Prev</button>
        <span class="cal-month">${monthLabel}</span>
        <button class="btn btn-outline btn-sm" id="cal-next">Next ›</button>
      </div>
      <div class="cal-grid">${dows}${cells}</div>
      <div class="legend"><span><i style="background:var(--gold-500)"></i> planned</span><span><i style="background:var(--teal-500)"></i> actual spend</span><span style="margin-left:auto" class="mono">planned ${fmtMoney(plannedTotal)} · spent ${fmtMoney(actualTotal)}</span></div>
    </div>
    <div class="btn-row">
      <button class="btn btn-primary" id="cal-add-plan">📌 Plan an expense</button>
      <button class="btn btn-outline" id="cal-add-txn">＋ Receipt this day</button>
    </div>
  </div>`;
}
function wireCalendar() {
  const shift = (n) => { state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + n, 1); render(); };
  $('#cal-prev').onclick = () => shift(-1);
  $('#cal-next').onclick = () => shift(1);
  $$('#app .cal-cell').forEach(c => c.onclick = () => { state.calSelected = c.dataset.day; openDaySheet(c.dataset.day); });
  $('#cal-add-plan').onclick = () => openPlanForm(state.calSelected);
  $('#cal-add-txn').onclick = () => openReceiptForm({ date: state.calSelected });
}
function openDaySheet(iso) {
  const plans = data.plans.filter(p => p.date === iso && p.status !== 'cancelled');
  const txns = familyTxns().filter(t => t.date === iso);
  openModal(`
    <div class="modal-title">${fmtDate(iso)}</div>
    <div class="modal-sub">${relDay(iso)}</div>
    <div class="list-label"><h3>Planned</h3><span>${plans.filter(p => p.status === 'planned').length} upcoming</span></div>
    ${plans.map(p => `
      <div class="card">
        <div class="txn-top"><span class="txn-merchant">📌 ${esc(p.title)}</span><span class="txn-amount mono">${fmtMoney(p.amount)}</span></div>
        <div class="txn-meta"><span>${esc(p.category)}</span>${p.note ? `<span>${esc(p.note)}</span>` : ''}</div>
        <div class="txn-actions">
          ${p.status === 'planned' ? `<button class="btn btn-green btn-sm" data-plan-pay="${p.id}">✅ Paid — record receipt</button><button class="btn btn-outline btn-sm" data-plan-cancel="${p.id}">Cancel plan</button>` : `<span class="badge badge-green">paid ✓</span>`}
        </div>
      </div>`).join('') || emptyState('📌', 'Nothing planned', 'Projected expenses added on this day appear here.')}
    <div class="list-label"><h3>Actual spend</h3><span>${txns.length} receipt${txns.length !== 1 ? 's' : ''}</span></div>
    ${txns.map(t => txnRowHTML(t)).join('') || emptyState('🧾', 'No receipts', 'Family receipts dated this day appear here.')}
    <div class="btn-row">
      <button class="btn btn-outline" id="ds-plan">📌 Add plan</button>
      <button class="btn btn-primary" id="ds-txn">＋ Add receipt</button>
    </div>`);
  wireTxnRows($('#modal-card'));
  $$('#modal-card [data-plan-pay]').forEach(b => b.onclick = () => { const p = data.plans.find(x => x.id === b.dataset.planPay); if (p) openPlanPayForm(p); });
  $$('#modal-card [data-plan-cancel]').forEach(b => b.onclick = () => {
    const p = data.plans.find(x => x.id === b.dataset.planCancel);
    confirmDialog('Cancel this plan?', `“${esc(p.title)}” (${fmtMoney(p.amount)}) will be removed from the calendar.`, 'Cancel plan', () => cancelPlan(p.id), true);
  });
  $('#ds-plan').onclick = () => openPlanForm(iso);
  $('#ds-txn').onclick = () => openReceiptForm({ date: iso });
}

/* ---------- personal (isolated ledger) ---------- */
function renderPersonal() {
  const me = state.user;
  const list = personalTxns(me);
  const f = state.personalFilter;
  const shown = f === 'returned' ? list.filter(t => t.status === 'returned')
    : f === 'active' ? list.filter(t => t.status === 'active') : list;
  const total = list.filter(t => t.status === 'active').reduce((s, t) => s + t.amount, 0);

  const chips = [['all', 'All'], ['active', 'Active'], ['returned', 'Returned']]
    .map(([v, l]) => `<button class="chip ${f === v ? 'active' : ''}" data-pf="${v}">${l}</button>`).join('');

  return `<div class="page">
    <div class="page-title">🔒 ${esc(userName(me))}’s personal</div>
    <div class="page-sub">Completely separate from the family books. Only you see this page when your profile is selected.</div>
    <div class="card" style="display:flex;justify-content:space-between;align-items:center">
      <div><div style="font-size:12px;font-weight:700;color:var(--ink-3);text-transform:uppercase;letter-spacing:.5px">Active personal spend</div>
      <div style="font-size:24px;font-weight:800" class="mono">${fmtMoney(total)}</div></div>
      <button class="btn btn-coral" id="p-add">＋ Add personal</button>
    </div>
    <div class="chip-row">${chips}</div>
    ${shown.map(t => txnRowHTML(t)).join('') || emptyState('🔒', 'No personal expenses', 'Add private spends here — they never touch the family ledger or reimbursements.')}
  </div>`;
}
function wirePersonal() {
  $$('#app [data-pf]').forEach(c => c.onclick = () => { state.personalFilter = c.dataset.pf; render(); });
  $('#p-add').onclick = () => openReceiptForm({ scope: 'personal' });
  wireTxnRows($('#app'));
}

/* ---------- settings ---------- */
function renderSettings() {
  return `<div class="page">
    <div class="page-title">Settings &amp; data</div>
    <div class="page-sub">Profiles, currency, exports and backups. Everything is stored on this device.</div>

    <div class="section-title">Profiles</div>
    <div class="card form-grid">
      <div class="field"><label>Husband profile name</label><input type="text" id="set-name-h" value="${esc(userName('husband'))}"></div>
      <div class="field"><label>Wife profile name</label><input type="text" id="set-name-w" value="${esc(userName('wife'))}"></div>
      <div class="field"><label>Currency symbol</label><input type="text" id="set-cur" value="${esc(settings.currency)}" maxlength="4"></div>
      <div class="field full"><button class="btn btn-primary btn-block" id="set-save">Save settings</button></div>
    </div>

    <div class="section-title">Accounting exports</div>
    <div class="card">
      <div class="btn-row" style="margin-top:0">
        <button class="btn btn-outline" id="exp-family">📄 Family ledger CSV</button>
        <button class="btn btn-outline" id="exp-personal">🔒 Personal CSV</button>
      </div>
      <p style="font-size:12px;color:var(--ink-2);margin-top:8px">CSV opens in Excel / Google Sheets — the columns are accountant-ready (date, merchant, category, payer, amount, status, reimbursement, return note).</p>
    </div>

    <div class="section-title">Backup &amp; restore</div>
    <div class="card">
      <div class="btn-row" style="margin-top:0">
        <button class="btn btn-outline" id="bak-exp">⬇ Export backup (JSON)</button>
        <button class="btn btn-outline" id="bak-imp">⬆ Restore backup</button>
        <input type="file" id="bak-file" accept="application/json" class="hidden">
      </div>
    </div>

    <div class="section-title">WhatsApp sync</div>
    <div class="card form-grid">
      <div class="field full"><label>Bot server URL</label><input type="text" id="wa-url" placeholder="https://your-tunnel.trycloudflare.com" value="${esc((settings.whatsapp || {}).serverUrl || '')}"></div>
      <div class="field full"><label>Sync token</label><input type="text" id="wa-token" placeholder="same as SYNC_TOKEN on the server" value="${esc((settings.whatsapp || {}).token || '')}"></div>
      <div class="field full"><button class="btn btn-primary btn-block" id="wa-sync">💬 Sync WhatsApp receipts now</button></div>
      <div class="field full" style="font-size:12px;color:var(--ink-3)">Last synced: ${(settings.whatsapp || {}).lastSync ? new Date(settings.whatsapp.lastSync).toLocaleString() : 'never'} · the app also syncs automatically when opened.</div>
    </div>

    <div class="section-title">Try it out</div>
    <div class="card">
      <div class="btn-row" style="margin-top:0">
        <button class="btn btn-outline" id="demo-load">✨ Load demo data</button>
        <button class="btn btn-red" id="wipe">🗑 Erase all data</button>
      </div>
    </div>
    <p style="font-size:11.5px;color:var(--ink-3);text-align:center;margin-top:16px">Family Ledger v1.0 · offline-first · data never leaves your device unless you export it.</p>
  </div>`;
}
function wireSettings() {
  $('#set-save').onclick = async () => {
    settings.users.husband.name = $('#set-name-h').value.trim() || 'Me';
    settings.users.wife.name = $('#set-name-w').value.trim() || 'Wife';
    settings.currency = $('#set-cur').value.trim() || 'S$';
    await saveSettings();
    renderProfileSwitch(); render();
    toast('Settings saved');
  };
  $('#exp-family').onclick = () => { download(`family-ledger-${todayStr()}.csv`, txnsToCSV(familyTxns())); toast('Family CSV exported'); };
  $('#exp-personal').onclick = () => { download(`personal-${state.user}-${todayStr()}.csv`, txnsToCSV(personalTxns())); toast('Personal CSV exported'); };
  $('#bak-exp').onclick = () => { exportBackup(); toast('Backup downloaded'); };
  $('#bak-imp').onclick = () => $('#bak-file').click();
  $('#bak-file').onchange = (e) => { const f = e.target.files[0]; if (f) importBackup(f); };
  $('#wa-sync').onclick = async () => {
    settings.whatsapp = { ...(settings.whatsapp || {}), serverUrl: $('#wa-url').value.trim(), token: $('#wa-token').value.trim() };
    await saveSettings();
    await syncFromWhatsApp();
  };
  $('#demo-load').onclick = () => confirmDialog('Load demo data?', 'Adds sample receipts, an advance and plans so you can explore. Your existing data stays.', 'Load demo', loadDemoData);
  $('#wipe').onclick = () => confirmDialog('Erase everything?', 'All receipts, advances and plans on this device will be permanently deleted.', 'Erase all', async () => {
    for (const s of ['txns', 'advances', 'plans']) await DB.clear(s);
    await reloadData(); render(); toast('All data erased');
  }, true);
}

/* ============================================================
   SHELL: nav, profile switch, FAB, router, boot
   ============================================================ */
const NAV = [
  ['dashboard', '🏠', 'Home'],
  ['receipts', '🧾', 'Receipts'],
  ['money', '💸', 'Money'],
  ['calendar', '📅', 'Calendar'],
  ['personal', '🔒', 'Personal'],
  ['settings', '⚙️', 'More'],
];
function renderNav() {
  const pendingReimb = data.txns.filter(t => t.scope === 'family' && t.reimb && t.reimb.status === 'pending' && t.reimb.requestedBy !== state.user).length;
  const pendingAdv = data.advances.filter(a => a.status === 'pending' && a.requestedBy !== state.user).length;
  const badge = pendingReimb + pendingAdv;
  $('#bottom-nav').innerHTML = NAV.map(([id, ico, label]) =>
    `<button class="${state.page === id ? 'active' : ''}" data-nav="${id}">
       <span class="nav-ico">${ico}</span><span>${label}</span>
       ${id === 'money' && badge ? `<span class="nav-badge">${badge}</span>` : ''}
     </button>`).join('');
  $$('#bottom-nav button').forEach(b => b.onclick = () => go(b.dataset.nav));
}
function go(page) { state.page = page; render(); window.scrollTo({ top: 0 }); }

function renderProfileSwitch() {
  $('#profile-switch').innerHTML = ['husband', 'wife'].map(u =>
    `<button class="${state.user === u ? 'active' : ''}" data-user="${u}">${esc(userName(u))}</button>`).join('');
  $$('#profile-switch button').forEach(b => b.onclick = async () => {
    state.user = b.dataset.user;
    await saveSetting('currentUser', { user: state.user });
    renderProfileSwitch(); render();
  });
  $('#header-sub').textContent = state.page === 'personal'
    ? `${userName(state.user)}’s private ledger`
    : 'Shared expenses, receipts & planning';
}

function render() {
  revokeUrls();
  renderNav();
  renderProfileSwitch();
  const app = $('#app');
  let html = '', wire = () => {};
  switch (state.page) {
    case 'dashboard': html = renderDashboard(); wire = wireDashboard; break;
    case 'receipts':  html = renderReceipts();  wire = wireReceipts;  break;
    case 'money':     html = renderMoney();     wire = wireMoney;     break;
    case 'calendar':  html = renderCalendar();  wire = wireCalendar;  break;
    case 'personal':  html = renderPersonal();  wire = wirePersonal;  break;
    case 'settings':  html = renderSettings();  wire = wireSettings;  break;
  }
  app.innerHTML = html;
  wire();
  $('#fab').classList.toggle('hidden', state.page === 'settings');
}

$('#fab').onclick = () => openReceiptForm({});
$('#modal-backdrop').onclick = closeModal;
$('#viewer-close').onclick = () => $('#viewer-root').classList.add('hidden');
$('#viewer-root').addEventListener('click', (e) => { if (e.target.id === 'viewer-root') e.currentTarget.classList.add('hidden'); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); $('#viewer-root').classList.add('hidden'); } });

(async function boot() {
  try {
    await loadSettings();
    await reloadData();
  } catch (e) {
    $('#app').innerHTML = `<div class="empty"><div class="empty-ico">⚠️</div><div class="empty-title">Storage unavailable</div><div class="empty-sub">This browser blocked local storage. Try Chrome/Safari, or open over https:// or http://localhost.</div></div>`;
    return;
  }
  renderProfileSwitch();
  render();
  syncFromWhatsApp({ quiet: true });   // pull WhatsApp receipts in the background
})();
