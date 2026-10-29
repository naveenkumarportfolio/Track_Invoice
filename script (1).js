'use strict';
/* InvoiceTrack — vanilla JS. Data lives in localStorage (browser-only, unencrypted). */
const KEY = 'invoicetrack.v1';
const METHODS = ['Bank transfer', 'UPI', 'Cash', 'Card', 'Other'];
const PAGES = {
  dashboard: ['Dashboard', 'Overview of billing and collections'],
  invoices: ['All Invoices', 'Search, filter and manage invoices'],
  payments: ['Payments', 'Every payment recorded against invoices'],
  reports: ['Reports', 'Summary figures and CSV exports'],
  settings: ['Business Profile', 'Profile, backup and data tools'],
};
const SORTS = [['invoiceDate-desc', 'Invoice date (newest)'], ['invoiceDate-asc', 'Invoice date (oldest)'],
  ['dueDate-asc', 'Due date (soonest)'], ['total-desc', 'Total (high to low)'], ['balance-desc', 'Outstanding (high to low)']];
let state = { invoices: [], payments: [], profile: { name: 'My Business' } };
let ui = { page: 'dashboard', search: '', status: 'all', from: '', to: '', sort: 'invoiceDate-desc' };

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const nf = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
const money = n => nf.format(n || 0);
const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
const sum = (a, f) => round(a.reduce((s, x) => s + f(x), 0));
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayStr = () => iso(new Date());
const offsetDate = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const uid = p => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const fmtDate = s => s ? new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

// Safe DOM builder: text is always inserted as text nodes, never as HTML.
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach(c => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c)); });
  return e;
}
let toastTimer;
function toast(msg, type = 'ok') {
  const t = $('#toast'); t.textContent = msg; t.className = 'show ' + type;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ''; }, 3200);
}
const empty = msg => h('p', { class: 'empty' }, msg);
const badge = s => h('span', { class: 'badge ' + s.toLowerCase().replace(' ', '-') }, s);

/* ---------- persistence ---------- */
const validInvoice = i => i && typeof i.id === 'string' && Array.isArray(i.items) && i.items.length && i.invoiceDate && i.dueDate;
function saveData() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { toast('Could not save: browser storage is unavailable.', 'error'); }
}
function loadData() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { return; }
  if (!raw) { seedDemo(); saveData(); return; }
  try {
    const d = JSON.parse(raw);
    if (!d || !Array.isArray(d.invoices) || !Array.isArray(d.payments)) throw new Error('bad shape');
    state.invoices = d.invoices.filter(validInvoice);
    const ids = new Set(state.invoices.map(i => i.id));
    state.payments = d.payments.filter(p => ids.has(p.invoiceId) && p.amount > 0 && p.date);
    state.profile = { name: String((d.profile && d.profile.name) || 'My Business') };
  } catch (e) {
    state = { invoices: [], payments: [], profile: { name: 'My Business' } };
    toast('Saved data was unreadable and was ignored.', 'error');
  }
}

/* ---------- business logic ---------- */
function calculateInvoiceTotals(inv) {
  const subtotal = sum(inv.items, x => (Number(x.quantity) || 0) * (Number(x.unitPrice) || 0));
  const taxAmount = round(subtotal * (Number(inv.taxRate) || 0) / 100);
  return { subtotal, taxAmount, total: round(subtotal + taxAmount) };
}
// Status rules, in priority order: Paid > Overdue > Partially Paid > Unpaid.
function getInvoiceStatus(inv, today) {
  if (inv.balance <= 0) return 'Paid';
  if (inv.dueDate < today) return 'Overdue';
  if (inv.paid > 0) return 'Partially Paid';
  return 'Unpaid';
}
function enrich(inv) {
  const t = calculateInvoiceTotals(inv);
  const paid = sum(state.payments.filter(p => p.invoiceId === inv.id), p => p.amount);
  const balance = Math.max(0, round(t.total - paid));
  return { ...inv, ...t, paid, balance, status: getInvoiceStatus({ balance, paid, dueDate: inv.dueDate }, todayStr()) };
}
const enrichedAll = () => state.invoices.map(enrich);
function calculateDashboardMetrics(list) {
  const today = todayStr();
  const invoiced = sum(list, i => i.total), collected = sum(list, i => i.paid);
  return {
    invoiced, collected,
    outstanding: sum(list, i => i.balance),
    overdue: sum(list.filter(i => i.balance > 0 && i.dueDate < today), i => i.balance),
    rate: invoiced > 0 ? collected / invoiced * 100 : 0, // avoids division by zero
  };
}
function nextNumber() {
  const max = state.invoices.reduce((m, i) => Math.max(m, parseInt((i.number.match(/(\d+)$/) || [0, 0])[1], 10) || 0), 0);
  return `INV-${new Date().getFullYear()}-${String(max + 1).padStart(4, '0')}`;
}
function filterInvoices(list) {
  const q = ui.search.trim().toLowerCase(), [k, dir] = ui.sort.split('-');
  return list.filter(i => (!q || i.number.toLowerCase().includes(q) || i.customer.toLowerCase().includes(q))
    && (ui.status === 'all' || i.status === ui.status)
    && (!ui.from || i.invoiceDate >= ui.from) && (!ui.to || i.invoiceDate <= ui.to))
    .sort((a, b) => {
      const c = typeof a[k] === 'number' ? a[k] - b[k] : String(a[k]).localeCompare(String(b[k]));
      return dir === 'asc' ? c : -c;
    });
}

/* ---------- demo data ---------- */
function seedDemo() {
  // customer, email, issue offset, due offset, description, qty, price, tax%, fraction paid
  const rows = [
    ['Arya Textiles Pvt Ltd', 'accounts@arya.example', -80, -50, 'Cotton fabric rolls', 40, 2150, 5, 1],
    ['Bluewave Logistics', 'billing@bluewave.example', -60, -30, 'Freight services', 1, 185000, 18, 0.5],
    ['Chandra Foods', 'pay@chandrafoods.example', -45, -15, 'Packaging supplies', 200, 145, 12, 0],
    ['Deepak Design Studio', 'hello@deepakdesign.example', -30, 0, 'Brand identity project', 1, 60000, 18, 0.4],
    ['Evergreen Clinics', 'admin@evergreen.example', -20, 10, 'Annual maintenance', 12, 7500, 18, 0],
    ['Fable Books', 'orders@fablebooks.example', -12, 18, 'Bulk book order', 150, 320, 0, 0.6],
    ['Gulmohar Events', 'team@gulmohar.example', -5, 25, 'Event consultation', 3, 22000, 18, 0],
  ];
  rows.forEach(([customer, email, io, dd, description, quantity, unitPrice, taxRate, frac], n) => {
    const inv = { id: uid('inv'), number: nextNumber(), customer, email, invoiceDate: offsetDate(io), dueDate: offsetDate(dd),
      items: [{ description, quantity, unitPrice }], taxRate, notes: 'Fictional demo record.', demo: true };
    state.invoices.push({ ...inv, ...calculateInvoiceTotals(inv) });
    if (frac > 0) state.payments.push({ id: uid('pay'), invoiceId: inv.id, amount: round(calculateInvoiceTotals(inv).total * frac),
      date: offsetDate(Math.min(io + 10, 0)), method: METHODS[n % METHODS.length], reference: 'DEMO-' + (n + 1), demo: true });
  });
}

/* ---------- CSV / downloads ---------- */
const csvCell = v => { const s = String(v == null ? '' : v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const toCSV = (head, rows) => [head, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
function download(name, text, type = 'text/csv') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' })), download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function exportInvoicesCSV(list, name) {
  if (!list.length) return toast('No invoices to export.', 'error');
  const head = ['Invoice No', 'Customer', 'Email', 'Invoice Date', 'Due Date', 'Description', 'Quantity', 'Unit Price', 'Tax %', 'Subtotal', 'Tax Amount', 'Total', 'Amount Paid', 'Outstanding', 'Status', 'Notes'];
  download(`${name}-${todayStr()}.csv`, toCSV(head, list.map(i => [i.number, i.customer, i.email, i.invoiceDate, i.dueDate,
    i.items.map(x => x.description).join('; '), i.items.map(x => x.quantity).join('; '), i.items.map(x => x.unitPrice).join('; '),
    i.taxRate, i.subtotal, i.taxAmount, i.total, i.paid, i.balance, i.status, i.notes])));
}
function exportPaymentsCSV() {
  if (!state.payments.length) return toast('No payments to export.', 'error');
  const inv = Object.fromEntries(state.invoices.map(i => [i.id, i]));
  download(`payments-${todayStr()}.csv`, toCSV(['Payment ID', 'Invoice No', 'Customer', 'Date', 'Amount', 'Method', 'Reference'],
    state.payments.map(p => [p.id, inv[p.invoiceId].number, inv[p.invoiceId].customer, p.date, p.amount, p.method, p.reference])));
}

/* ---------- dialogs ---------- */
function openModal(title, body) {
  $('#modal-title').textContent = title; $('#modal-body').replaceChildren(body);
  if (!$('#modal').open) $('#modal').showModal();
}
const closeModal = () => { if ($('#modal').open) $('#modal').close(); };
function confirmBox(msg, onYes, label = 'Delete') {
  $('#confirm-msg').textContent = msg;
  const y = $('#confirm-yes'); y.textContent = label;
  y.onclick = () => { $('#confirm').close(); onYes(); };
  $('#confirm-no').onclick = () => $('#confirm').close();
  $('#confirm').showModal();
}
function printNode(node) { $('#print-area').replaceChildren(node); window.print(); }

/* ---------- forms ---------- */
function field(label, name, type, value, attrs = {}) {
  return h('div', { class: 'field' }, h('label', { for: 'f_' + name }, label),
    h('input', { id: 'f_' + name, name, type, value: value == null ? '' : value, 'aria-describedby': 'e_' + name, ...attrs }),
    h('span', { class: 'err', id: 'e_' + name }));
}
function showErrors(form, errs) {
  form.querySelectorAll('.err').forEach(s => { s.textContent = ''; });
  form.querySelectorAll('[aria-invalid]').forEach(i => i.removeAttribute('aria-invalid'));
  let first = null;
  for (const [k, msg] of Object.entries(errs)) {
    const err = form.querySelector('#e_' + k), inp = form.querySelector('#f_' + k);
    if (err) err.textContent = msg;
    if (inp) { inp.setAttribute('aria-invalid', 'true'); first = first || inp; }
  }
  if (first) first.focus();
}
function readInvoiceForm(f) {
  const d = Object.fromEntries(new FormData(f));
  const n = k => (d[k] === '' || d[k] == null) ? NaN : Number(d[k]);
  return { number: d.number, customer: (d.customer || '').trim(), email: (d.email || '').trim(),
    invoiceDate: d.invoiceDate, dueDate: d.dueDate,
    items: [{ description: (d.description || '').trim(), quantity: n('quantity'), unitPrice: n('unitPrice') }],
    taxRate: d.taxRate === '' ? 0 : Number(d.taxRate), notes: (d.notes || '').trim() };
}
function validateInvoice(v, paid) {
  const e = {}, it = v.items[0];
  if (!v.customer) e.customer = 'Customer name is required.';
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) e.email = 'Enter a valid email address.';
  if (!v.invoiceDate) e.invoiceDate = 'Invoice date is required.';
  if (!v.dueDate) e.dueDate = 'Due date is required.';
  else if (v.invoiceDate && v.dueDate < v.invoiceDate) e.dueDate = 'Due date cannot be before the invoice date.';
  if (!it.description) e.description = 'Description is required.';
  if (isNaN(it.quantity) || it.quantity < 0) e.quantity = 'Enter a quantity of 0 or more.';
  if (isNaN(it.unitPrice) || it.unitPrice < 0) e.unitPrice = 'Enter a price of 0 or more.';
  if (isNaN(v.taxRate) || v.taxRate < 0) e.taxRate = 'Tax cannot be negative.';
  if (!Object.keys(e).length && calculateInvoiceTotals(v).total < paid)
    e.unitPrice = `Total cannot go below the ${money(paid)} already paid.`;
  return e;
}
function openInvoiceForm(id) {
  const inv = id ? state.invoices.find(i => i.id === id) : null;
  const it = inv ? inv.items[0] : { description: '', quantity: 1, unitPrice: '' };
  const paid = inv ? enrich(inv).paid : 0;
  const totals = h('dl', { class: 'totals' });
  const form = h('form', { novalidate: true, class: 'form', onsubmit: e => { e.preventDefault(); submitInvoice(form, inv, paid); } },
    field('Invoice number', 'number', 'text', inv ? inv.number : nextNumber(), { readonly: true }),
    field('Customer / company *', 'customer', 'text', inv && inv.customer),
    field('Customer email', 'email', 'email', inv && inv.email),
    field('Invoice date *', 'invoiceDate', 'date', inv ? inv.invoiceDate : todayStr()),
    field('Due date *', 'dueDate', 'date', inv ? inv.dueDate : offsetDate(30)),
    field('Description *', 'description', 'text', it.description),
    field('Quantity *', 'quantity', 'number', it.quantity, { min: 0, step: 'any' }),
    field('Unit price (₹) *', 'unitPrice', 'number', it.unitPrice, { min: 0, step: '0.01' }),
    field('Tax (%)', 'taxRate', 'number', inv ? inv.taxRate : 18, { min: 0, step: '0.01' }),
    h('div', { class: 'field full' }, h('label', { for: 'f_notes' }, 'Notes'), h('textarea', { id: 'f_notes', name: 'notes', rows: 2 }, (inv && inv.notes) || '')),
    totals,
    h('div', { class: 'actions full' }, h('button', { type: 'button', class: 'btn', onclick: closeModal }, 'Cancel'),
      h('button', { type: 'submit', class: 'btn primary' }, inv ? 'Save changes' : 'Create invoice')));
  const update = () => {
    const t = calculateInvoiceTotals(readInvoiceForm(form));
    totals.replaceChildren(...[['Subtotal', t.subtotal], ['Tax', t.taxAmount], ['Total', t.total]].flatMap(([a, b]) => [h('dt', {}, a), h('dd', {}, money(b))]));
  };
  form.addEventListener('input', update); update();
  openModal(inv ? 'Edit invoice' : 'New invoice', form);
}
function submitInvoice(form, inv, paid) {
  const v = readInvoiceForm(form), errs = validateInvoice(v, paid);
  showErrors(form, errs);
  if (Object.keys(errs).length) return;
  const totals = calculateInvoiceTotals(v);
  // Editing only touches the invoice; payments are stored separately and are never altered here.
  if (inv) { Object.assign(inv, v, totals); toast('Invoice updated.'); }
  else { state.invoices.push({ id: uid('inv'), ...v, ...totals, demo: false }); toast('Invoice created.'); }
  saveData(); closeModal(); renderApp();
}
function recordPayment(invoiceId, d) {
  const inv = enrichedAll().find(i => i.id === invoiceId), e = {};
  if (!inv) return { amount: 'Invoice not found.' };
  const amt = d.amount === '' ? NaN : round(Number(d.amount));
  if (inv.balance <= 0) e.amount = 'This invoice is already fully paid.';
  else if (isNaN(amt) || amt <= 0) e.amount = 'Enter an amount greater than zero.';
  else if (amt > inv.balance) e.amount = `Amount cannot exceed the balance of ${money(inv.balance)}.`;
  if (!d.date) e.date = 'Payment date is required.';
  if (Object.keys(e).length) return e;
  state.payments.push({ id: uid('pay'), invoiceId, amount: amt, date: d.date,
    method: METHODS.includes(d.method) ? d.method : 'Other', reference: (d.reference || '').trim() });
  saveData(); toast('Payment recorded.'); renderApp(); openDetail(invoiceId);
  return {};
}
function paymentForm(i) {
  const form = h('form', { novalidate: true, class: 'form', onsubmit: e => {
    e.preventDefault(); showErrors(form, recordPayment(i.id, Object.fromEntries(new FormData(form)))); } },
    field('Amount (₹) *', 'amount', 'number', i.balance, { min: 0, step: '0.01' }),
    field('Payment date *', 'date', 'date', todayStr()),
    h('div', { class: 'field' }, h('label', { for: 'f_method' }, 'Method'),
      h('select', { id: 'f_method', name: 'method' }, METHODS.map(m => h('option', { value: m }, m)))),
    field('Reference', 'reference', 'text', ''),
    h('div', { class: 'actions full' }, h('button', { class: 'btn primary', type: 'submit' }, 'Record payment')));
  return form;
}

/* ---------- invoice detail ---------- */
function detailContent(i, forPrint) {
  const pays = state.payments.filter(p => p.invoiceId === i.id).sort((a, b) => a.date.localeCompare(b.date));
  const row = (a, b) => [h('dt', {}, a), h('dd', {}, b)];
  return h('div', {},
    forPrint && h('h2', {}, `${state.profile.name} — Invoice ${i.number}`),
    h('dl', { class: 'kv' }, row('Customer', i.customer), row('Email', i.email || '—'), row('Invoice date', fmtDate(i.invoiceDate)),
      row('Due date', fmtDate(i.dueDate)), row('Status', badge(i.status)), row('Notes', i.notes || '—')),
    h('div', { class: 'sec' }, h('h3', {}, 'Line items'), h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Description', 'Qty', 'Unit price', 'Amount'].map(c => h('th', {}, c)))),
      h('tbody', {}, i.items.map(x => h('tr', {}, h('td', {}, x.description), h('td', {}, x.quantity), h('td', {}, money(x.unitPrice)), h('td', {}, money(x.quantity * x.unitPrice)))))))),
    h('dl', { class: 'totals sec' }, row('Subtotal', money(i.subtotal)), row(`Tax (${i.taxRate}%)`, money(i.taxAmount)),
      row('Total', money(i.total)), row('Amount paid', money(i.paid)), row('Outstanding', money(i.balance))),
    h('div', { class: 'sec' }, h('h3', {}, 'Payment history'),
      pays.length ? h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Date', 'Amount', 'Method', 'Reference'].map(c => h('th', {}, c)))),
        h('tbody', {}, pays.map(p => h('tr', {}, h('td', {}, fmtDate(p.date)), h('td', {}, money(p.amount)), h('td', {}, p.method), h('td', {}, p.reference || '—'))))))
        : h('p', { class: 'muted' }, 'No payments recorded yet.')),
    !forPrint && (i.balance > 0 ? h('div', { class: 'sec' }, h('h3', {}, 'Record a payment'), paymentForm(i))
      : h('p', { class: 'muted sec' }, 'This invoice is fully paid.')),
    !forPrint && h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: () => openInvoiceForm(i.id) }, 'Edit'),
      h('button', { class: 'btn', onclick: () => printNode(detailContent(i, true)) }, 'Print'),
      h('button', { class: 'btn danger-o', onclick: () => askDelete(i.id) }, 'Delete'),
      h('button', { class: 'btn', onclick: closeModal }, 'Close')));
}
function openDetail(id) {
  const i = enrichedAll().find(x => x.id === id);
  if (i) openModal('Invoice ' + i.number, detailContent(i, false));
}
function askDelete(id) {
  const inv = state.invoices.find(i => i.id === id); if (!inv) return;
  const n = state.payments.filter(p => p.invoiceId === id).length;
  confirmBox(`Delete invoice ${inv.number}${n ? ` and its ${n} payment record(s)` : ''}? This cannot be undone.`, () => {
    state.invoices = state.invoices.filter(i => i.id !== id);
    state.payments = state.payments.filter(p => p.invoiceId !== id);
    saveData(); closeModal(); renderApp(); toast('Invoice deleted.');
  });
}

/* ---------- pages ---------- */
function kpi(label, value, hint, warn) {
  return h('div', { class: 'card kpi' + (warn ? ' warn' : '') }, h('span', { class: 'label' }, label), h('strong', {}, value), h('small', {}, hint));
}
const demoBanner = () => state.invoices.some(i => i.demo) ? h('div', { class: 'banner' }, 'Demo records (fictional customers) are included. Remove them under Business Profile when you are ready.') : null;
function invoiceTable(list) {
  if (!list.length) return empty('No invoices match.');
  return h('div', { class: 'table-wrap' }, h('table', {},
    h('thead', {}, h('tr', {}, ['Invoice', 'Customer', 'Date', 'Due', 'Total', 'Balance', 'Status', ''].map(c => h('th', { scope: 'col' }, c)))),
    h('tbody', {}, list.map(i => h('tr', {},
      h('td', {}, h('button', { class: 'link', onclick: () => openDetail(i.id) }, i.number)),
      h('td', {}, i.customer, i.demo && h('span', { class: 'tag' }, 'Demo')),
      h('td', {}, fmtDate(i.invoiceDate)), h('td', {}, fmtDate(i.dueDate)),
      h('td', {}, money(i.total)), h('td', {}, money(i.balance)), h('td', {}, badge(i.status)),
      h('td', { class: 'acts' }, h('button', { class: 'btn small', onclick: () => openInvoiceForm(i.id) }, 'Edit'),
        h('button', { class: 'btn small danger-o', onclick: () => askDelete(i.id) }, 'Delete')))))));
}
function monthlyChart(all) {
  const now = new Date(), months = [];
  for (let k = 5; k >= 0; k--) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
    months.push({ key: iso(d).slice(0, 7), label: d.toLocaleDateString('en-IN', { month: 'short' }), inv: 0, col: 0 });
  }
  all.forEach(i => { const m = months.find(x => x.key === i.invoiceDate.slice(0, 7)); if (m) m.inv += i.total; });
  state.payments.forEach(p => { const m = months.find(x => x.key === p.date.slice(0, 7)); if (m) m.col += p.amount; });
  const max = Math.max(...months.map(m => Math.max(m.inv, m.col)));
  if (!max) return empty('No activity in the last 6 months.');
  return h('div', {},
    h('div', { class: 'chart', role: 'img', 'aria-label': 'Invoiced versus collected for the last six months' },
      months.map(m => h('div', { class: 'col' },
        h('div', { class: 'bars' },
          h('i', { class: 'b inv', style: `height:${m.inv / max * 100}%`, title: `${m.label} invoiced: ${money(m.inv)}` }),
          h('i', { class: 'b col', style: `height:${m.col / max * 100}%`, title: `${m.label} collected: ${money(m.col)}` })),
        h('span', {}, m.label)))),
    h('p', { class: 'legend' }, h('span', { class: 'dot inv' }), 'Invoiced', h('span', { class: 'dot col' }), 'Collected'));
}
function pageDashboard() {
  const all = enrichedAll(), m = calculateDashboardMetrics(all), today = todayStr();
  const recent = [...all].sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate)).slice(0, 5);
  const upcoming = all.filter(i => i.balance > 0 && i.dueDate >= today).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5);
  return h('div', {}, demoBanner(),
    h('section', { class: 'kpis' }, kpi('Total invoiced', money(m.invoiced), 'All invoices'), kpi('Total collected', money(m.collected), 'Recorded payments'),
      kpi('Outstanding balance', money(m.outstanding), 'Invoiced minus collected'), kpi('Overdue balance', money(m.overdue), 'Past due date', m.overdue > 0),
      kpi('Collection rate', m.rate.toFixed(1) + '%', 'Collected ÷ invoiced')),
    h('section', { class: 'grid2' },
      h('div', { class: 'card' }, h('h2', {}, 'Invoiced vs collected'), monthlyChart(all)),
      h('div', { class: 'card' }, h('h2', {}, 'Upcoming payments due'),
        upcoming.length ? h('ul', { class: 'list' }, upcoming.map(i => h('li', {},
          h('button', { class: 'link', onclick: () => openDetail(i.id) }, `${i.number} · ${i.customer}`),
          h('span', {}, `${fmtDate(i.dueDate)} · ${money(i.balance)}`)))) : empty('Nothing is due soon.'))),
    h('section', { class: 'card' }, h('div', { class: 'row' }, h('h2', {}, 'Recent invoices'),
      h('button', { class: 'btn small', onclick: () => navigate('invoices') }, 'View all')),
      all.length ? invoiceTable(recent) : empty('No invoices yet. Create one, or load demo data under Business Profile.')));
}
function renderResults(el = $('#results')) {
  const list = filterInvoices(enrichedAll());
  el.replaceChildren(
    h('div', { class: 'row' }, h('p', { class: 'muted', role: 'status' }, `${list.length} matching invoice${list.length === 1 ? '' : 's'}`),
      h('div', { class: 'btns' }, h('button', { class: 'btn small', onclick: () => exportInvoicesCSV(list, 'invoices-filtered') }, 'Export filtered CSV'),
        h('button', { class: 'btn small', onclick: () => exportInvoicesCSV(enrichedAll(), 'invoices-all') }, 'Export all CSV'))),
    h('div', { class: 'card' }, invoiceTable(list)));
}
function clearFilters() { ui = { ...ui, search: '', status: 'all', from: '', to: '', sort: 'invoiceDate-desc' }; $('#search').value = ''; renderApp(); }
function pageInvoices() {
  const results = h('div', { id: 'results' });
  const date = (k, l) => h('label', { class: 'inline' }, l, h('input', { type: 'date', value: ui[k], onchange: e => { ui[k] = e.target.value; renderResults(); } }));
  const bar = h('div', { class: 'card toolbar' },
    h('label', { class: 'inline' }, 'Status', h('select', { onchange: e => { ui.status = e.target.value; renderResults(); } },
      ['all', 'Paid', 'Partially Paid', 'Unpaid', 'Overdue'].map(s => h('option', { value: s, selected: s === ui.status }, s === 'all' ? 'All statuses' : s)))),
    date('from', 'Invoice date from'), date('to', 'to'),
    h('label', { class: 'inline' }, 'Sort by', h('select', { onchange: e => { ui.sort = e.target.value; renderResults(); } },
      SORTS.map(([v, l]) => h('option', { value: v, selected: v === ui.sort }, l)))),
    h('button', { class: 'btn', onclick: clearFilters }, 'Clear filters'));
  const wrap = h('div', {}, demoBanner(), bar, results);
  renderResults(results);
  return wrap;
}
function pagePayments() {
  const inv = Object.fromEntries(state.invoices.map(i => [i.id, i]));
  const pays = [...state.payments].sort((a, b) => b.date.localeCompare(a.date));
  return h('div', {}, h('div', { class: 'card' },
    h('div', { class: 'row' }, h('p', { class: 'muted' }, `${pays.length} payment${pays.length === 1 ? '' : 's'} · ${money(sum(pays, p => p.amount))} collected`),
      h('button', { class: 'btn small', onclick: exportPaymentsCSV }, 'Export payments CSV')),
    pays.length ? h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Date', 'Invoice', 'Customer', 'Amount', 'Method', 'Reference'].map(c => h('th', {}, c)))),
      h('tbody', {}, pays.map(p => h('tr', {}, h('td', {}, fmtDate(p.date)),
        h('td', {}, h('button', { class: 'link', onclick: () => openDetail(p.invoiceId) }, inv[p.invoiceId].number)),
        h('td', {}, inv[p.invoiceId].customer), h('td', {}, money(p.amount)), h('td', {}, p.method), h('td', {}, p.reference || '—'))))))
      : empty('No payments yet. Open an invoice to record one.')));
}
function reportSummary() {
  const all = enrichedAll(), m = calculateDashboardMetrics(all);
  const count = s => all.filter(i => i.status === s).length;
  const row = (a, b) => [h('dt', {}, a), h('dd', {}, b)];
  return h('div', { class: 'card' }, h('h2', {}, `${state.profile.name} — summary as of ${fmtDate(todayStr())}`),
    h('dl', { class: 'kv sec' }, row('Total invoiced', money(m.invoiced)), row('Total collected', money(m.collected)),
      row('Outstanding balance', money(m.outstanding)), row('Overdue balance', money(m.overdue)),
      row('Collection rate', m.rate.toFixed(1) + '%'), row('Invoices (total)', all.length),
      row('Paid', count('Paid')), row('Partially paid', count('Partially Paid')), row('Unpaid', count('Unpaid')), row('Overdue', count('Overdue'))));
}
function pageReports() {
  return h('div', {}, reportSummary(), h('div', { class: 'btns' },
    h('button', { class: 'btn', onclick: () => exportInvoicesCSV(enrichedAll(), 'invoices-all') }, 'Export all invoices CSV'),
    h('button', { class: 'btn', onclick: exportPaymentsCSV }, 'Export payments CSV'),
    h('button', { class: 'btn primary', onclick: () => printNode(reportSummary()) }, 'Print report')));
}
function pageSettings() {
  const form = h('form', { class: 'form', novalidate: true, onsubmit: e => {
    e.preventDefault();
    const name = String(new FormData(form).get('name')).trim();
    if (!name) return showErrors(form, { name: 'Business name is required.' });
    state.profile.name = name; saveData(); toast('Profile saved.'); renderApp();
  } }, field('Business name', 'name', 'text', state.profile.name, { maxlength: 60 }),
    h('div', { class: 'actions full' }, h('button', { class: 'btn primary', type: 'submit' }, 'Save profile')));
  return h('div', {}, h('div', { class: 'card' }, h('h2', {}, 'Business profile'), h('div', { class: 'sec' }, form)),
    h('div', { class: 'card' }, h('h2', {}, 'Your data'),
      h('p', { class: 'muted' }, 'Everything is stored in this browser\'s localStorage. It is not encrypted, does not sync between devices, and is not a substitute for a secure production database.'),
      h('div', { class: 'btns' },
        h('button', { class: 'btn', onclick: () => download(`invoicetrack-backup-${todayStr()}.json`, JSON.stringify(state, null, 2), 'application/json') }, 'Download JSON backup'),
        h('button', { class: 'btn', onclick: () => { if (state.invoices.some(i => i.demo)) return toast('Demo data is already loaded.', 'error'); seedDemo(); saveData(); renderApp(); toast('Demo data loaded.'); } }, 'Load demo data'),
        h('button', { class: 'btn danger-o', onclick: () => confirmBox('Remove all demo invoices and their payments? Your own records stay.', () => {
          const ids = new Set(state.invoices.filter(i => i.demo).map(i => i.id));
          state.invoices = state.invoices.filter(i => !ids.has(i.id));
          state.payments = state.payments.filter(p => !ids.has(p.invoiceId));
          saveData(); renderApp(); toast('Demo records cleared.');
        }, 'Clear demo') }, 'Clear demo records'),
        h('button', { class: 'btn danger', onclick: () => confirmBox('Erase ALL invoices, payments and settings in this browser? This cannot be undone.', () => {
          state = { invoices: [], payments: [], profile: { name: 'My Business' } }; saveData(); renderApp(); toast('All data erased.');
        }, 'Erase everything') }, 'Reset all data'))));
}

/* ---------- app shell ---------- */
function renderApp() {
  const [t, d] = PAGES[ui.page];
  $('#page-title').textContent = t; $('#page-desc').textContent = d; document.title = t + ' — InvoiceTrack';
  document.querySelectorAll('#nav button').forEach(b => {
    const on = b.dataset.page === ui.page;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  $('#biz-name').textContent = state.profile.name;
  $('#avatar').textContent = state.profile.name.trim().charAt(0).toUpperCase() || 'B';
  const pages = { dashboard: pageDashboard, invoices: pageInvoices, payments: pagePayments, reports: pageReports, settings: pageSettings };
  $('#view').replaceChildren(pages[ui.page]());
}
function navigate(page) {
  ui.page = page; renderApp();
  $('#sidebar').classList.remove('open'); $('#menu-btn').setAttribute('aria-expanded', 'false');
  $('#view').focus();
}
document.querySelectorAll('#nav button').forEach(b => b.addEventListener('click', () => navigate(b.dataset.page)));
$('#new-btn').addEventListener('click', () => openInvoiceForm());
$('#modal-close').addEventListener('click', closeModal);
$('#search').addEventListener('input', e => {
  ui.search = e.target.value;
  if (ui.page !== 'invoices') { ui.page = 'invoices'; renderApp(); } else renderResults();
});
$('#menu-btn').addEventListener('click', () => {
  const open = $('#sidebar').classList.toggle('open');
  $('#menu-btn').setAttribute('aria-expanded', String(open));
});
loadData();
renderApp();
