// GMA Live Dashboard — App Logic v3.9
// Priority System · Special Requests · Login Gate · Supabase Sync
console.log('%c GMA Dashboard v3.9 loaded ', 'background:#0ea5e9;color:white;padding:2px 8px;border-radius:4px');

// ---- Priority Levels (order = sort weight) ----
const PRIORITY_WEIGHT = { critical: 0, high: 1, normal: 2, low: 3 };
const PRIORITY_LABELS = {
    critical: { label: 'Critical', icon: '🔴', cls: 'priority-critical' },
    high:     { label: 'High',     icon: '🟠', cls: 'priority-high' },
    normal:   { label: 'Normal',   icon: '🟢', cls: 'priority-normal' },
    low:      { label: 'Low',      icon: '⚪', cls: 'priority-low' }
};

// ---- Seed Data (fallback when cloud is empty) ----
const SEED_POS = [
    {
        id: 'PO-2024-001', item_number: '83356', desc: 'RV AC Unit - 15k BTU',
        description: 'RV AC Unit - 15k BTU',
        qty: 150, status: 'shipped', eta: '2024-04-12', value: 125000,
        order_date: '2024-03-01', ship_date: '2024-04-05', outstanding_qty: 0,
        location: 'DCIN', currency: 'USD', unit_cost: 833.33, reference: 'Batch A-12',
        priority: 'normal', special_requests: [],
        history: [
            { by: 'Dometic',  action: 'Created PO',                date: '2024-03-01 09:15' },
            { by: 'ZunPower', action: 'Status → Production',        date: '2024-03-18 14:30' },
            { by: 'ZunPower', action: 'Ship Date set to 2024-04-05',date: '2024-04-02 10:00' },
            { by: 'ZunPower', action: 'Status → Shipped',           date: '2024-04-05 16:45' }
        ]
    },
    {
        id: 'PO-2024-002', item_number: '91001', desc: 'Solar Panel 200W',
        description: 'Solar Panel 200W',
        qty: 300, status: 'production', eta: '2024-04-25', value: 98000,
        order_date: '2024-03-15', ship_date: '', outstanding_qty: 300,
        location: 'FTN', currency: 'USD', unit_cost: 326.66, reference: 'Urgent demand',
        priority: 'high', special_requests: [],
        history: [
            { by: 'Dometic',  action: 'Created PO',          date: '2024-03-15 11:00' },
            { by: 'ZunPower', action: 'Status → Production',  date: '2024-03-22 08:20' }
        ]
    }
];

// ---- State ----
let state = {
    role: null,          // null = not authenticated yet
    currentView: 'live-board',
    pos: [...SEED_POS],
    authenticated: false
};

// ---- DOM Refs ----
const poTableBody   = document.getElementById('poTableBody');
const poForm        = document.getElementById('poForm');
const createPOBtn   = document.getElementById('createPOBtn');
const sideDrawer    = document.getElementById('sideDrawer');
const drawerOverlay = document.getElementById('drawerOverlay');
const closeModal    = document.getElementById('closeModal');
const cancelModal   = document.getElementById('cancelModal');
const searchInput   = document.getElementById('searchInput');

let activeStatusFilter   = 'all';
let activePriorityFilter = null;
let activeSortBy         = 'priority';

// ---- Init ----
document.addEventListener('DOMContentLoaded', async () => {
    loadLocalState();
    setupEventListeners();
    setupLoginLogic();
    setupSpecialRequestModal();
    setupPrioritySelector();
    switchView('live-board');

    // Always force login on fresh page load (unless session is very recent)
    const sessionValid = enforceLoginGate();

    // Init API Proxy details
    await CloudService.init();
    
    // Only fetch from backend if already authenticated
    if (sessionValid) {
        await syncWithCloud();
    }
    renderAll();
});

// ---- Login Gate ----
function enforceLoginGate() {
    // Check if we have a valid recent session (within 8 hours)
    const lastAuth  = parseInt(localStorage.getItem('gma_last_auth') || '0', 10);
    const sessionTTL = 8 * 60 * 60 * 1000; // 8 hours
    const sessionValid = state.authenticated && (Date.now() - lastAuth) < sessionTTL;

    if (!sessionValid) {
        state.authenticated = false;
        state.role = null;
        openLoginOverlay();
        return false;
    } else {
        updateSidebarUser();
        return true;
    }
}

function openLoginOverlay() {
    const overlay = document.getElementById('loginOverlay');
    overlay.classList.add('active');
    // Ensure no cancel button — user MUST log in
    setTimeout(() => {
        const passcodeInput = document.getElementById('passcode');
        if (passcodeInput) passcodeInput.focus();
    }, 300);
}

// ---- Render ----
function renderAll() {
    if (!state.authenticated) return; // Don't render if not logged in
    renderStats();
    sortAndFilterRenderTable();
    updateUIForRole();
    updateSidebarUser();
}

function renderStats() {
    const totalOrders = state.pos.length || 1;
    const inProd  = state.pos.filter(po => po.status === 'production').length;
    const shipped = state.pos.filter(po => po.status === 'shipped').length;
    const atRisk  = state.pos.filter(po => po.status === 'delayed').length;
    const specReq = state.pos.filter(po => (po.special_requests || []).some(r => r.status === 'open')).length;

    setText('statInProduction',    `${inProd} Orders`);
    setText('statShipped',         `${shipped} Orders`);
    setText('statAtRisk',          `${atRisk} Orders`);
    setText('statSpecialRequests', `${specReq} Open`);

    setBar('barProduction',     inProd,   totalOrders);
    setBar('barShipped',        shipped,  totalOrders);
    setBar('barAtRisk',         atRisk,   totalOrders);
    setBar('barSpecialRequests',specReq,  totalOrders);
}

function setBar(id, val, total) {
    const el = document.getElementById(id);
    if (el) el.style.width = `${Math.min(100, (val / total) * 100)}%`;
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

// ---- Sort + Filter + Render ----
function sortAndFilterRenderTable() {
    const query = (searchInput.value || '').toLowerCase();

    let filtered = state.pos.filter(po => {
        const matchesQuery = (
            po.id.toLowerCase().includes(query) ||
            (po.item_number   || '').toLowerCase().includes(query) ||
            (po.description   || po.desc || '').toLowerCase().includes(query) ||
            (po.location      || '').toLowerCase().includes(query) ||
            (po.reference     || '').toLowerCase().includes(query)
        );
        const matchesStatus   = (activeStatusFilter === 'all' || po.status === activeStatusFilter);
        const matchesPriority = !activePriorityFilter || po.priority === activePriorityFilter;
        return matchesQuery && matchesStatus && matchesPriority;
    });

    // Sort
    filtered = sortPOs(filtered, activeSortBy);
    renderPOTable(filtered);
}

function sortPOs(list, by) {
    return [...list].sort((a, b) => {
        switch (by) {
            case 'priority':
                return (PRIORITY_WEIGHT[a.priority] ?? 2) - (PRIORITY_WEIGHT[b.priority] ?? 2);
            case 'priority_desc':
                return (PRIORITY_WEIGHT[b.priority] ?? 2) - (PRIORITY_WEIGHT[a.priority] ?? 2);
            case 'eta':
                return (a.eta || '9999') < (b.eta || '9999') ? -1 : 1;
            case 'eta_desc':
                return (a.eta || '0000') > (b.eta || '0000') ? -1 : 1;
            case 'qty':
                return (b.qty || 0) - (a.qty || 0);
            case 'qty_asc':
                return (a.qty || 0) - (b.qty || 0);
            case 'status': {
                const s = { delayed: 0, production: 1, open: 2, shipped: 3, closed: 4 };
                return (s[a.status] ?? 99) - (s[b.status] ?? 99);
            }
            case 'status_desc': {
                const s = { delayed: 0, production: 1, open: 2, shipped: 3, closed: 4 };
                return (s[b.status] ?? 99) - (s[a.status] ?? 99);
            }
            case 'po_number':
                return (a.id || '').localeCompare(b.id || '');
            case 'po_number_desc':
                return (b.id || '').localeCompare(a.id || '');
            case 'recent_updates': {
                const getLatestUpdate = po => {
                    const latest = (po.history || []).slice(-1)[0];
                    if (!latest) return 0;
                    return new Date(latest.date).getTime() || 0;
                };
                return getLatestUpdate(b) - getLatestUpdate(a);
            }
            default:
                return 0;
        }
    });
}

// ---- Split-shipment helpers ----

/** Compute aggregate totals from shipment lines (fallback to top-level fields if no lines) */
function computeTotals(po) {
    const lines = po.shipment_lines || [];
    if (lines.length === 0) {
        return { qty: po.qty || 0, outstanding_qty: po.outstanding_qty || 0, eta: po.eta, ship_date: po.ship_date };
    }
    const qty             = lines.reduce((s, l) => s + (parseInt(l.qty) || 0), 0);
    // Use Number() to catch NaN properly, then default to line.qty when outstanding_qty not set
    const outstanding_qty = lines.reduce((s, l) => {
        const oq = parseInt(l.outstanding_qty);
        return s + (isNaN(oq) ? (parseInt(l.qty) || 0) : oq);
    }, 0);
    const etas  = lines.map(l => l.eta).filter(Boolean).sort();
    const ships = lines.map(l => l.ship_date).filter(Boolean).sort();
    return { qty, outstanding_qty, eta: etas[0] || po.eta, ship_date: ships[0] || po.ship_date };
}

/** Read-only mini-table of shipment lines shown in the expanded row */
function renderShipmentLinesPanel(po) {
    const lines = po.shipment_lines || [];
    if (lines.length === 0) return '';
    const totalQty = lines.reduce((s, l) => s + (parseInt(l.qty) || 0), 0);
    const totalOut = lines.reduce((s, l) => {
        const oq = parseInt(l.outstanding_qty);
        return s + (isNaN(oq) ? (parseInt(l.qty) || 0) : oq);
    }, 0);
    return `
        <div style="grid-column:1/-1;border-top:1px solid #e2e8f0;padding-top:16px;margin-top:8px">
            <p class="detail-label" style="margin-bottom:10px;color:#0369a1">Shipment Lines &nbsp;<span style="font-weight:500;text-transform:none;letter-spacing:0;font-size:0.75rem;color:#64748b">${lines.length} line${lines.length > 1 ? 's' : ''}</span></p>
            <table class="shipment-lines-table">
                <thead><tr><th>#</th><th>Qty</th><th>Outstanding</th><th>Location</th><th>Ship Date</th><th>ETA</th></tr></thead>
                <tbody>
                    ${lines.map((l, i) => `
                        <tr>
                            <td><span class="lines-badge" style="margin:0">L${i + 1}</span></td>
                            <td>${l.qty || 0}</td>
                            <td style="font-weight:700;color:${(parseInt(l.outstanding_qty) ?? parseInt(l.qty) ?? 0) > 0 ? '#ea580c' : '#059669'}">${l.outstanding_qty ?? l.qty ?? 0}</td>
                            <td>${l.location || '—'}</td>
                            <td>${l.ship_date || '—'}</td>
                            <td>${l.eta || '—'}</td>
                        </tr>`).join('')}
                </tbody>
                <tfoot><tr>
                    <td>Total</td>
                    <td>${totalQty}</td>
                    <td style="font-weight:700;color:${totalOut > 0 ? '#ea580c' : '#059669'}">${totalOut}</td>
                    <td colspan="3"></td>
                </tr></tfoot>
            </table>
        </div>`;
}

function renderPOTable(data) {
    const isZunPower = state.role === 'zunpower';

    if (data.length === 0) {
        poTableBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center;padding:40px;color:var(--slate-400);font-size:0.85rem">
                    No purchase orders match the current filters.
                </td>
            </tr>`;
        return;
    }

    poTableBody.innerHTML = data.map(po => {
        const pulseClass    = po.status === 'delayed' ? ' pulse' : '';
        const pMeta         = PRIORITY_LABELS[po.priority || 'normal'];
        const hasSpecialReq = (po.special_requests || []).some(r => r.status === 'open');
        const isClosed      = po.status === 'closed';
        const closedRowClass = isClosed ? ' po-row-closed' : '';
        const totals        = computeTotals(po);
        const hasLines      = (po.shipment_lines || []).length > 0;
        const etaStyle      = po.status === 'delayed' ? 'color:#dc2626;font-weight:700' : '';

        // Last update — most recent history entry shown inline
        const lastEntry  = (po.history || []).slice(-1)[0];
        const lastUpdate = lastEntry
            ? `<span class="last-update-who ${lastEntry.by === 'ZunPower' ? 'zp' : 'dom'}">${lastEntry.by}</span>
               <span class="last-update-text" title="${lastEntry.action}">${lastEntry.action.length > 36 ? lastEntry.action.slice(0, 34) + '…' : lastEntry.action}</span>
               <span class="last-update-time">${lastEntry.date}</span>`
            : '<span class="last-update-none">—</span>';

        const actionBtn = isZunPower
            ? `<button class="action-link update" onclick="event.stopPropagation(); openEditDrawer('${po.id}')">Update</button>`
            : `<button class="action-link"        onclick="event.stopPropagation(); openEditDrawer('${po.id}')">Details</button>`;

        // ZunPower quick status update
        const zunPowerPanel = isZunPower ? `
            <div style="grid-column:1/-1;border-top:1px solid #e2e8f0;padding-top:16px;margin-top:8px">
                <p class="detail-label" style="margin-bottom:10px;color:#2563eb">Quick Update</p>
                <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
                    <div style="flex:1;min-width:140px">
                        <label class="detail-label">Status</label>
                        <select class="form-input" onchange="quickUpdateField('${po.id}','status',this.value)" style="padding:8px 10px">
                            <option value="open"       ${po.status==='open'       ?'selected':''}>Open</option>
                            <option value="production" ${po.status==='production' ?'selected':''}>Production</option>
                            <option value="shipped"    ${po.status==='shipped'    ?'selected':''}>Shipped</option>
                            <option value="delayed"    ${po.status==='delayed'    ?'selected':''}>Delayed</option>
                        </select>
                    </div>
                </div>
            </div>` : '';

        // History timeline
        const historyLog   = (po.history || []).slice().reverse();
        const historyPanel = historyLog.length > 0 ? `
            <div style="grid-column:1/-1;border-top:1px solid #e2e8f0;padding-top:16px;margin-top:8px">
                <p class="detail-label" style="margin-bottom:10px">Update History</p>
                <div class="history-timeline">
                    ${historyLog.map(h => `
                        <div class="history-entry">
                            <div class="history-dot"></div>
                            <div class="history-body">
                                <div class="history-meta">
                                    <span class="history-who ${h.by === 'ZunPower' ? 'zp' : 'dom'}">${h.by}</span>
                                    <span class="history-when">${h.date}</span>
                                </div>
                                <p class="history-action">${h.action}</p>
                            </div>
                        </div>`).join('')}
                </div>
            </div>` : '';

        // Special requests panel (expanded view)
        const srList = (po.special_requests || []);
        const srPanel = srList.length > 0 ? `
            <div style="grid-column:1/-1;border-top:1px solid #e2e8f0;padding-top:16px;margin-top:8px">
                <p class="detail-label" style="margin-bottom:10px;color:#7c3aed">Special Requests</p>
                ${srList.map(sr => `
                    <div class="sr-entry sr-status-${sr.status}">
                        <div class="sr-entry-header">
                            <span class="sr-type-tag">${srTypeLabel(sr.type)}</span>
                            <span class="sr-entry-status">${sr.status === 'open' ? '🔔 Open' : '✅ Resolved'}</span>
                            <span class="sr-entry-date">${sr.date}</span>
                        </div>
                        <p class="sr-entry-notes">${sr.notes || '—'}</p>
                    </div>`).join('')}
            </div>` : '';

        return `
            <tr class="expandable-row po-priority-${po.priority || 'normal'}${closedRowClass}" onclick="toggleRow('${po.id}')">
                <td style="width:36px;padding-left:20px">
                    <svg id="icon-${po.id}" style="width:14px;height:14px;transition:transform 0.2s;color:#94a3b8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </td>
                <td>
                    <span class="priority-badge ${pMeta.cls}">${pMeta.icon} ${pMeta.label}</span>
                    ${hasSpecialReq ? '<span class="sr-flag" title="Has open special request">SR</span>' : ''}
                </td>
                <td style="font-weight:700;color:#1e293b">${po.id}</td>
                <td style="font-weight:600">${po.item_number || '—'}</td>
                <td><span class="status-pill status-${po.status}${pulseClass}">${po.status}</span></td>
                <td class="hidden-sm" style="${etaStyle}">${totals.eta || 'TBD'}${hasLines ? '<span class="lines-badge">split</span>' : ''}</td>
                <td class="hidden-md">
                    <span style="font-weight:600">${totals.qty}</span>
                    <span style="color:#94a3b8;font-size:0.75rem"> / </span>
                    <span style="font-weight:700;color:${totals.outstanding_qty > 0 ? '#ea580c' : '#059669'}">${totals.outstanding_qty}</span>
                    ${hasLines ? `<span class="lines-badge">${(po.shipment_lines||[]).length}L</span>` : ''}
                </td>
                <td class="hidden-md last-update-cell">${lastUpdate}</td>
                <td style="text-align:right">${actionBtn}</td>
            </tr>
            <tr id="details-${po.id}" class="details-row hidden">
                <td colspan="9" style="padding:0 20px">
                    <div class="details-content details-grid">
                        <div>
                            <p class="detail-label">Origin / Location</p>
                            <p class="detail-value">${po.location || 'Not Specified'}</p>
                        </div>
                        <div>
                            <p class="detail-label">Order Timeline</p>
                            <p class="detail-sub">Ordered: <span class="detail-val">${po.order_date || '—'}</span></p>
                            <p class="detail-sub">Shipped: <span class="detail-val">${po.ship_date  || 'Pending'}</span></p>
                        </div>
                        <div>
                            <p class="detail-label">Quantity Summary</p>
                            <p class="detail-sub">Total: <span class="detail-val">${po.qty}</span></p>
                            <p class="detail-sub">Remaining: <span style="font-weight:700;color:#ea580c">${po.outstanding_qty}</span></p>
                        </div>
                        <div>
                            <p class="detail-label">Description</p>
                            <p class="detail-value">${po.description || po.desc || '—'}</p>
                        </div>
                        <div style="grid-column:1/-1; display:flex; gap:16px; flex-wrap:wrap;">
                            <div style="flex:1; min-width: 250px;">
                                <p class="detail-label">Dometic Remarks</p>
                                <p class="detail-value" style="font-style:italic; white-space:pre-wrap;">${po.dometic_remarks !== undefined ? po.dometic_remarks : (po.reference && po.reference.includes('|||ZP:') ? po.reference.split('|||ZP:')[0] : po.reference) || '—'}</p>
                            </div>
                            <div style="flex:1; min-width: 250px;">
                                <p class="detail-label">ZunPower Remarks</p>
                                <p class="detail-value" style="font-style:italic; white-space:pre-wrap;">${po.zunpower_remarks || '—'}</p>
                            </div>
                        </div>
                        ${renderShipmentLinesPanel(po)}
                        ${srPanel}
                        ${zunPowerPanel}
                        ${historyPanel}
                    </div>
                </td>
            </tr>`;
    }).join('');
}

function srTypeLabel(type) {
    const labels = { split: 'Split Shipment', expedite: 'Expedite', hold: 'Hold Shipment', reroute: 'Re-Route', partial: 'Partial Release', other: 'Other' };
    return labels[type] || type;
}

// ---- Row Expand ----
window.toggleRow = function(id) {
    const row  = document.getElementById(`details-${id}`);
    const icon = document.getElementById(`icon-${id}`);
    if (!row) return;
    const isHidden = row.classList.contains('hidden');
    row.classList.toggle('hidden', !isHidden);
    icon.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
};

// ---- Drawer ----
let editingPOId = null;
let editingLines = []; // working copy of shipment lines in drawer

function fillForm(po) {
    const f = poForm;
    f.querySelector('[name="po_number"]').value      = po.id;
    f.querySelector('[name="sku"]').value            = po.item_number || '';
    f.querySelector('[name="description"]').value    = po.description || po.desc || '';
    f.querySelector('[name="location"]').value       = po.location || '';
    f.querySelector('[name="order_date"]').value     = po.order_date || '';
    f.querySelector('[name="eta"]').value            = po.eta || '';
    f.querySelector('[name="ship_date"]').value      = po.ship_date || '';
    f.querySelector('[name="status"]').value         = po.status || 'open';
    let dRem = po.dometic_remarks;
    if (dRem === undefined) {
        dRem = (typeof po.reference === 'string' && po.reference.includes('|||ZP:')) ? po.reference.split('|||ZP:')[0] : (po.reference || '');
    }
    f.querySelector('[name="dometic_remarks"]').value  = dRem ?? '';
    f.querySelector('[name="zunpower_remarks"]').value = po.zunpower_remarks ?? '';
    f.querySelector('[name="priority"]').value       = po.priority || 'normal';
    setPriorityUI(po.priority || 'normal');
    // Init shipment lines — qty/outstanding form fields will be set by _syncLineTotalsToForm
    editingLines = (po.shipment_lines || []).map(l => ({ ...l }));
    // If no lines, populate qty/outstanding from PO directly
    if (editingLines.length === 0) {
        f.querySelector('[name="qty"]').value             = po.qty ?? '';
        f.querySelector('[name="outstanding_qty"]').value = po.outstanding_qty ?? po.qty ?? '';
    }
    renderDrawerLines();
}

function setPriorityUI(priority) {
    document.querySelectorAll('.priority-opt').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-priority-val') === priority);
    });
}

/** Renders the editingLines array into the drawer's shipment lines container */
function renderDrawerLines() {
    const container = document.getElementById('shipmentLinesContainer');
    const addBtn    = document.getElementById('addShipmentLineBtn');
    if (!container) return;
    const isZP = state.role === 'zunpower';
    if (addBtn) addBtn.classList.toggle('hidden', isZP);

    if (editingLines.length === 0) {
        container.innerHTML = isZP
            ? `<p style="font-size:0.8rem;color:var(--slate-400);margin:0 0 8px;font-style:italic;">No split lines on this PO.</p>`
            : `<p style="font-size:0.8rem;color:var(--slate-400);margin:0 0 8px;font-style:italic;">No split lines — click "+ Add Shipment Line" to split this PO across multiple deliveries.</p>`;
        // Unlock top-level qty/outstanding when no lines
        _setQtyFieldsLocked(false);
        return;
    }

    // Lock top-level qty/outstanding — they are derived from lines
    _setQtyFieldsLocked(true);
    _syncLineTotalsToForm();

    const LOCATION_OPTS = ['DCIN', 'FTN', 'REMCO', 'OTHERS'];

    container.innerHTML = editingLines.map((l, i) => {
        const id = l.id;
        if (isZP) {
            return `
            <div class="shipment-line-row">
                <div class="line-num">L${i + 1}</div>
                <div class="line-field"><label>Qty</label><div class="line-readonly">${l.qty || 0}</div></div>
                <div class="line-field"><label>Outstanding</label><input type="number" class="form-input" min="0" value="${safeOutstanding(l)}" oninput="updateEditingLine('${id}','outstanding_qty',this.value)"></div>
                <div class="line-field"><label>Location</label><div class="line-readonly">${l.location || '—'}</div></div>
                <div class="line-field"><label>Ship Date</label><div class="line-readonly">${l.ship_date || '—'}</div></div>
                <div class="line-field"><label>ETA</label><div class="line-readonly">${l.eta || '—'}</div></div>
            </div>`;
        }
        const locOptions = LOCATION_OPTS.map(opt =>
            `<option value="${opt}" ${l.location === opt ? 'selected' : ''}>${opt}</option>`
        ).join('');
        return `
        <div class="shipment-line-row">
            <div class="line-num">L${i + 1}</div>
            <div class="line-field"><label>Qty</label><input type="number" class="form-input" min="0" value="${l.qty || ''}" oninput="updateEditingLine('${id}','qty',this.value)"></div>
            <div class="line-field"><label>Outstanding</label><input type="number" class="form-input" min="0" value="${safeOutstanding(l)}" oninput="updateEditingLine('${id}','outstanding_qty',this.value)"></div>
            <div class="line-field"><label>Location</label><select class="form-input" onchange="updateEditingLine('${id}','location',this.value)"><option value="">Select...</option>${locOptions}</select></div>
            <div class="line-field"><label>Ship Date</label><input type="date" class="form-input" value="${l.ship_date || ''}" oninput="updateEditingLine('${id}','ship_date',this.value)"></div>
            <div class="line-field"><label>ETA</label><input type="date" class="form-input" value="${l.eta || ''}" oninput="updateEditingLine('${id}','eta',this.value)"></div>
            <button type="button" class="btn-remove-line" onclick="removeShipmentLine('${id}')" title="Remove line">&#x2715;</button>
        </div>`;
    }).join('');
}

/**
 * Returns a safe outstanding_qty display value for a line.
 * Defaults to line.qty when outstanding_qty is not yet set (NaN/undefined).
 */
function safeOutstanding(line) {
    const oq = parseInt(line.outstanding_qty);
    return isNaN(oq) ? (parseInt(line.qty) || 0) : oq;
}

/**
 * Locks or unlocks the top-level qty / outstanding_qty form inputs.
 * When lines are active these are derived fields — editing them directly
 * would be inconsistent with the line totals.
 */
function _setQtyFieldsLocked(locked) {
    const qtyEl  = poForm.querySelector('[name="qty"]');
    const outEl  = poForm.querySelector('[name="outstanding_qty"]');
    if (!qtyEl || !outEl) return;
    qtyEl.readOnly  = locked;
    outEl.readOnly  = locked;
    const bg = locked ? 'var(--slate-50)' : 'white';
    qtyEl.style.background  = bg;
    outEl.style.background  = bg;
    qtyEl.title  = locked ? 'Derived from shipment lines — edit line quantities above' : '';
    outEl.title  = locked ? 'Derived from shipment lines — edit line outstanding values above' : '';
}

/**
 * Reads the current editingLines totals and writes them into the
 * top-level qty / outstanding_qty form fields so the user can see
 * the running totals at a glance while editing lines.
 */
function _syncLineTotalsToForm() {
    if (editingLines.length === 0) return;
    const totalQty = editingLines.reduce((s, l) => s + (parseInt(l.qty) || 0), 0);
    const totalOut = editingLines.reduce((s, l) => s + safeOutstanding(l), 0);
    const qtyEl = poForm.querySelector('[name="qty"]');
    const outEl = poForm.querySelector('[name="outstanding_qty"]');
    if (qtyEl) qtyEl.value = totalQty;
    if (outEl) outEl.value = totalOut;
}

window.addShipmentLine = function() {
    if (state.role !== 'dometic') return;
    const newLine = {
        id: 'line-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        qty: 0, outstanding_qty: 0, location: '', ship_date: '', eta: ''
    };
    editingLines.push(newLine);
    renderDrawerLines();
};

window.removeShipmentLine = function(lineId) {
    // Capture current top-level values before they potentially get unlocked
    const qtyEl = poForm.querySelector('[name="qty"]');
    const outEl = poForm.querySelector('[name="outstanding_qty"]');
    editingLines = editingLines.filter(l => l.id !== lineId);
    renderDrawerLines();
    // If all lines gone, restore the original top-level values from state
    if (editingLines.length === 0 && editingPOId) {
        const po = state.pos.find(p => p.id === editingPOId);
        if (po && qtyEl) qtyEl.value = po.qty ?? '';
        if (po && outEl) outEl.value = po.outstanding_qty ?? po.qty ?? '';
    }
};

window.updateEditingLine = function(lineId, field, value) {
    const line = editingLines.find(l => l.id === lineId);
    if (!line) return;
    line[field] = (field === 'qty' || field === 'outstanding_qty') ? (parseInt(value) || 0) : value;
    // Keep top-level totals in sync with lines as the user types
    _syncLineTotalsToForm();
};


function updateUIForRole() {
    const isZunPower = state.role === 'zunpower';
    if (createPOBtn) createPOBtn.style.display = isZunPower ? 'none' : 'flex';

    document.querySelectorAll('.role-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-role') === state.role);
    });
}

function updateSidebarUser() {
    const nameEl   = document.getElementById('sidebarUserName');
    const roleEl   = document.getElementById('sidebarUserRole');
    const avatarEl = document.getElementById('sidebarUserAvatar');
    if (!nameEl) return;
    const isZP = state.role === 'zunpower';
    nameEl.textContent   = isZP ? 'ZunPower' : 'Dometic';
    roleEl.textContent   = isZP ? 'Supplier Access' : 'Admin';
    avatarEl.textContent = isZP ? 'Z' : 'D';
    avatarEl.className   = 'sidebar-user-avatar ' + (isZP ? 'zp' : 'dom');
}

function openDrawer(mode = 'create') {
    const title       = document.querySelector('.drawer-header h3');
    const subtitle    = document.querySelector('.drawer-header .subtitle');
    const submitBtn   = document.querySelector('.btn-submit');
    const statusGroup = document.getElementById('statusFieldGroup');
    const deleteBtn   = document.getElementById('deletePOBtn');
    const specialBtn  = document.getElementById('specialRequestBtn');
    const poInput     = poForm.querySelector('[name="po_number"]');

    if (mode === 'edit' && editingPOId) {
        title.textContent    = 'Update Purchase Order';
        subtitle.textContent = state.role === 'zunpower' ? 'ZunPower Partner Update' : 'Dometic Admin Edit';
        submitBtn.textContent= 'Save Changes';
        statusGroup.classList.remove('hidden');
        specialBtn.classList.remove('hidden');
        // Role restrictions — ZunPower can only update logistics/status fields
        const restricted = ['po_number', 'sku', 'qty', 'order_date', 'description', 'dometic_remarks', 'ship_date', 'eta'];
        const isZP = state.role === 'zunpower';
        restricted.forEach(fname => {
            const el = poForm.querySelector(`[name="${fname}"]`);
            if (el) { el.readOnly = isZP; el.style.background = isZP ? 'var(--slate-50)' : 'white'; }
        });
        
        const zpRemEl = poForm.querySelector(`[name="zunpower_remarks"]`);
        if (zpRemEl) {
            zpRemEl.readOnly = !isZP;
            zpRemEl.style.background = !isZP ? 'var(--slate-50)' : 'white';
        }

        deleteBtn.classList.toggle('hidden', state.role !== 'dometic');

        // Close PO button — Dometic only, enabled only when outstanding_qty === 0
        const closePOBtn = document.getElementById('closePOBtn');
        if (closePOBtn) {
            const po = state.pos.find(p => p.id === editingPOId);
            const canClose = state.role === 'dometic' && po && po.status !== 'closed';
            closePOBtn.classList.toggle('hidden', !canClose);
            closePOBtn.disabled = !po || computeTotals(po).outstanding_qty > 0;
            closePOBtn.title = computeTotals(po).outstanding_qty > 0
                ? `Cannot close — ${computeTotals(po).outstanding_qty} units still outstanding`
                : 'Close this PO (outstanding qty is 0)';
        }
    } else {
        title.textContent    = 'New Purchase Order';
        subtitle.textContent = 'Supply Chain Execution';
        submitBtn.textContent= 'Commit Order';
        statusGroup.classList.add('hidden');
        deleteBtn.classList.add('hidden');
        specialBtn.classList.add('hidden');
        poInput.readOnly = false;
        editingPOId = null;
        setPriorityUI('normal');
        poForm.querySelector('[name="priority"]').value = 'normal';
        
        const zpRemEl = poForm.querySelector(`[name="zunpower_remarks"]`);
        if (zpRemEl) {
            zpRemEl.readOnly = true;
            zpRemEl.style.background = 'var(--slate-50)';
        }
    }

    sideDrawer.classList.add('open');
    drawerOverlay.classList.add('visible');
}

function closeDrawer() {
    sideDrawer.classList.remove('open');
    drawerOverlay.classList.remove('visible');
    poForm.reset();
    poForm.querySelectorAll('input, select, textarea').forEach(el => {
        el.readOnly = false;
        el.style.background = 'white';
    });
    document.getElementById('statusFieldGroup').classList.add('hidden');
    document.getElementById('deletePOBtn').classList.add('hidden');
    document.getElementById('specialRequestBtn').classList.add('hidden');
    const closePOBtn = document.getElementById('closePOBtn');
    if (closePOBtn) closePOBtn.classList.add('hidden');
    editingPOId = null;
    editingLines = [];
    setPriorityUI('normal');
}

// ---- Priority Selector ----
function setupPrioritySelector() {
    document.querySelectorAll('.priority-opt').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = btn.getAttribute('data-priority-val');
            document.querySelector('[name="priority"]').value = val;
            setPriorityUI(val);
        });
    });
}

// ---- Special Request Modal ----
let specialRequestPOId = null;
let selectedSRType     = 'split';

window.openSpecialRequestModal = function() {
    if (!editingPOId) return;
    specialRequestPOId = editingPOId;
    const po = state.pos.find(p => p.id === editingPOId);

    document.getElementById('specialRequestPOLabel').textContent = `${po ? po.id : ''} — ${po ? (po.description || po.desc || '') : ''}`;
    document.getElementById('srRequestedBy').value = state.role === 'zunpower' ? 'ZunPower' : 'Dometic';
    document.getElementById('srNotes').value = '';

    selectSRType('split');

    const modal = document.getElementById('specialRequestModal');
    modal.classList.add('active');
};

function setupSpecialRequestModal() {
    // Type selector
    document.querySelectorAll('.sr-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectSRType(btn.getAttribute('data-sr-type'));
        });
    });

    document.getElementById('closeSpecialRequestModal').addEventListener('click', closeSpecialRequestModal);
    document.getElementById('cancelSR').addEventListener('click', closeSpecialRequestModal);

    document.getElementById('submitSR').addEventListener('click', submitSpecialRequest);
}

function selectSRType(type) {
    selectedSRType = type;
    document.querySelectorAll('.sr-type-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-sr-type') === type));

    // Toggle panels
    document.getElementById('srSplitPanel').classList.toggle('hidden',   type !== 'split');
    document.getElementById('srExpeditePanel').classList.toggle('hidden', type !== 'expedite');
}

function closeSpecialRequestModal() {
    document.getElementById('specialRequestModal').classList.remove('active');
}

async function submitSpecialRequest() {
    const po = state.pos.find(p => p.id === specialRequestPOId);
    if (!po) return;

    const notes = document.getElementById('srNotes').value.trim();
    const by    = document.getElementById('srRequestedBy').value;

    const sr = {
        type:   selectedSRType,
        notes,
        by,
        date:   new Date().toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        status: 'open'
    };

    // Attach split details if applicable
    if (selectedSRType === 'split') {
        sr.split = [
            { qty: parseInt(document.getElementById('srSplit1Qty').value) || 0, eta: document.getElementById('srSplit1Date').value },
            { qty: parseInt(document.getElementById('srSplit2Qty').value) || 0, eta: document.getElementById('srSplit2Date').value }
        ];
    }
    if (selectedSRType === 'expedite') {
        sr.new_eta    = document.getElementById('srExpediteDate').value;
        sr.exp_reason = document.getElementById('srExpediteReason').value;
    }

    if (!po.special_requests) po.special_requests = [];
    po.special_requests.push(sr);

    const actionLabel = `Special Request: ${srTypeLabel(selectedSRType)}${notes ? ' — ' + notes.slice(0, 60) : ''}`;
    logHistory(po, actionLabel);

    persistState();
    await CloudService.updatePO(po.id, { special_requests: po.special_requests, history: po.history })
        .catch(err => console.warn('[SR] Could not sync special request:', err));

    closeSpecialRequestModal();
    renderAll();
    showToast(`✅ Special request submitted for ${po.id}`);
}

// ---- Toast Notification ----
function showToast(msg, type = 'success') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99999;display:flex;flex-direction:column;gap:8px';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('toast-visible'); }, 10);
    setTimeout(() => {
        toast.classList.remove('toast-visible');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ---- Events ----
function setupEventListeners() {
    // Search
    searchInput.addEventListener('input', sortAndFilterRenderTable);

    // Sort select
    const sortSel = document.getElementById('sortSelect');
    if (sortSel) {
        sortSel.addEventListener('change', () => {
            activeSortBy = sortSel.value;
            sortAndFilterRenderTable();
        });
    }

    // Role Toggle buttons
    document.querySelectorAll('.role-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const role = btn.getAttribute('data-role');
            if (role !== state.role) {
                openRoleSwitchOverlay(role);
            }
        });
    });

    // Sidebar switch button
    const sidebarSwitchBtn = document.getElementById('sidebarSwitchBtn');
    if (sidebarSwitchBtn) {
        sidebarSwitchBtn.addEventListener('click', () => {
            openRoleSwitchOverlay();
        });
    }

    // Mobile menu
    const mobileToggle = document.getElementById('mobileMenuToggle');
    if (mobileToggle) {
        mobileToggle.addEventListener('click', () => {
            document.querySelector('.sidebar').classList.toggle('mobile-open');
            drawerOverlay.classList.toggle('visible');
        });
    }

    // Nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', e => {
            e.preventDefault();
            switchView(item.getAttribute('data-view'));
            const sidebar = document.querySelector('.sidebar');
            if (sidebar.classList.contains('mobile-open')) {
                sidebar.classList.remove('mobile-open');
                drawerOverlay.classList.remove('visible');
            }
        });
    });

    // Status Filter buttons
    document.querySelectorAll('.filter-btn:not(.priority-filter-btn)').forEach(btn => {
        btn.addEventListener('click', () => {
            // Clear priority filter when status filter clicked
            document.querySelectorAll('.priority-filter-btn').forEach(b => b.classList.remove('active'));
            activePriorityFilter = null;

            document.querySelectorAll('.filter-btn:not(.priority-filter-btn)').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeStatusFilter = btn.getAttribute('data-status');
            sortAndFilterRenderTable();
        });
    });

    // Priority filter buttons
    document.querySelectorAll('.priority-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const p = btn.getAttribute('data-priority');
            if (activePriorityFilter === p) {
                // Toggle off
                activePriorityFilter = null;
                btn.classList.remove('active');
            } else {
                document.querySelectorAll('.priority-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activePriorityFilter = p;
            }
            sortAndFilterRenderTable();
        });
    });

    // Drawer controls
    createPOBtn.addEventListener('click', () => openDrawer('create'));
    closeModal.addEventListener('click', closeDrawer);
    cancelModal.addEventListener('click', closeDrawer);

    drawerOverlay.addEventListener('click', () => {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar.classList.contains('mobile-open')) {
            sidebar.classList.remove('mobile-open');
            drawerOverlay.classList.remove('visible');
        } else {
            closeDrawer();
        }
    });

    // Form submit
    poForm.addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(poForm);

        if (editingPOId) {
            const po = state.pos.find(p => p.id === editingPOId);
            if (!po) return;

            const changes = [];
            const cloudUpdates = {};
            const newStatus   = fd.get('status');
            const newShipDate = fd.get('ship_date');
            const newOutstanding = parseInt(fd.get('outstanding_qty'));
            const newPriority = fd.get('priority');

            if (newStatus && newStatus !== po.status) {
                changes.push(`Status → ${cap(newStatus)}`);
                po.status = newStatus;
                cloudUpdates.status = newStatus;
            }
            if (newShipDate && newShipDate !== po.ship_date) {
                changes.push(`Ship Date → ${newShipDate}`);
                po.ship_date = newShipDate;
                cloudUpdates.ship_date = newShipDate;
            }
            // Only update from the form field when NO lines are active.
            // When lines exist, outstanding_qty is derived from SUM(lines.outstanding_qty).
            if (editingLines.length === 0 && !isNaN(newOutstanding) && newOutstanding !== po.outstanding_qty) {
                changes.push(`Outstanding Qty → ${newOutstanding}`);
                po.outstanding_qty = newOutstanding;
                cloudUpdates.outstanding_qty = newOutstanding;
            }
            if (newPriority && newPriority !== po.priority) {
                changes.push(`Priority → ${cap(newPriority)}`);
                po.priority = newPriority;
                cloudUpdates.priority = newPriority;
            }

            const newPoId = fd.get('po_number');
            if (newPoId && newPoId !== po.id) {
                changes.push(`ID changed to ${newPoId}`);
                po.id = newPoId;
                cloudUpdates.id = newPoId;
            }

            const newDesc = fd.get('description') || po.description || po.desc;
            if (newDesc !== po.description) {
                po.description = newDesc;
                po.desc = newDesc;
                cloudUpdates.description = newDesc;
            }

            const newQty = parseInt(fd.get('qty'));
            // Only update top-level qty from the form field when NO lines are active.
            // When lines exist, qty is derived from SUM(lines.qty) — the form field is locked.
            if (editingLines.length === 0 && !isNaN(newQty) && newQty !== po.qty) {
                po.qty = newQty;
                cloudUpdates.qty = newQty;
            }
            
            // --- Remarks: always read directly from DOM and always send ---
            // state.role may be null after page refresh if loadLocalState didn't
            // restore it; reading directly from the editable textarea is reliable.
            const domRemEl = poForm.querySelector('[name="dometic_remarks"]');
            const zpRemEl  = poForm.querySelector('[name="zunpower_remarks"]');
            const domRemVal = domRemEl ? (domRemEl.value || '') : (po.dometic_remarks  || '');
            const zpRemVal  = zpRemEl  ? (zpRemEl.value  || '') : (po.zunpower_remarks || '');

            if (domRemVal !== (po.dometic_remarks || ''))  changes.push('Dometic Remarks updated');
            if (zpRemVal  !== (po.zunpower_remarks || '')) changes.push('ZunPower Remarks updated');

            po.dometic_remarks  = domRemVal;
            po.zunpower_remarks = zpRemVal;

            // Only send the remark the current role owns (surgical PATCH).
            // The other field is intentionally omitted so Supabase preserves it.
            if (state.role === 'dometic')  cloudUpdates.dometic_remarks  = domRemVal;
            if (state.role === 'zunpower') cloudUpdates.zunpower_remarks = zpRemVal;
            // Fallback: if role is somehow null, send both so nothing is lost.
            if (!state.role) {
                cloudUpdates.dometic_remarks  = domRemVal;
                cloudUpdates.zunpower_remarks = zpRemVal;
            }

            console.log('[Save] role:', state.role, '| domRem:', domRemVal, '| zpRem:', zpRemVal);
            
            const newEta = fd.get('eta');
            if (newEta && newEta !== po.eta) { po.eta = newEta; cloudUpdates.eta = newEta; }

            const newOrderDate = fd.get('order_date');
            if (newOrderDate && newOrderDate !== po.order_date) { po.order_date = newOrderDate; cloudUpdates.order_date = newOrderDate; }

            const newLoc = fd.get('location');
            if (newLoc && newLoc !== po.location) { po.location = newLoc; cloudUpdates.location = newLoc; }

            const newSku = fd.get('sku');
            if (newSku && newSku !== po.item_number) { po.item_number = newSku; cloudUpdates.item_number = newSku; }

            // Shipment lines (Dometic adds/manages, ZunPower updates outstanding per line)
            // Always sync lines from editingLines (even if unchanged) to keep them accurate.
            const cleanedLines = editingLines.map(l => ({
                id:              l.id,
                qty:             parseInt(l.qty)             || 0,
                outstanding_qty: parseInt(l.outstanding_qty) ?? (parseInt(l.qty) || 0),
                location:        l.location || '',
                ship_date:       l.ship_date || '',
                eta:             l.eta       || ''
            }));
            const prevLines = JSON.stringify(po.shipment_lines || []);
            const nextLines = JSON.stringify(cleanedLines);
            if (prevLines !== nextLines) {
                changes.push('Shipment lines updated');
            }
            po.shipment_lines = cleanedLines;
            cloudUpdates.shipment_lines = cleanedLines;
            // Sync top-level aggregates from lines if any exist
            if (cleanedLines.length > 0) {
                const lt = computeTotals(po);
                po.qty = lt.qty;                         cloudUpdates.qty             = lt.qty;
                po.outstanding_qty = lt.outstanding_qty; cloudUpdates.outstanding_qty = lt.outstanding_qty;
                if (lt.eta)       { po.eta       = lt.eta;       cloudUpdates.eta       = lt.eta; }
                if (lt.ship_date) { po.ship_date = lt.ship_date; cloudUpdates.ship_date = lt.ship_date; }
            }

            logHistory(po, changes.length > 0 ? changes.join(', ') : 'Updated via form');
            cloudUpdates.history = po.history;

            persistState();
            // PATCH only sends the columns in cloudUpdates — safe for cross-role saves
            // (never touches the other party's remarks). If the PO isn't in Supabase
            // yet (0 rows matched), updatePO falls back to a full createPO insert.
            try {
                await CloudService.updatePO(editingPOId, cloudUpdates, po);
            } catch (err) {
                console.error('[Save] Update failed:', err);
                showToast(`❌ Save failed — ${err.message}`, 'error');
                return; // Don't close drawer if save failed
            }

        } else {
            const newPO = {
                id:              fd.get('po_number'),
                item_number:     fd.get('sku'),
                description:     fd.get('description'),
                desc:            fd.get('description'),
                qty:             parseInt(fd.get('qty'))            || 0,
                outstanding_qty: parseInt(fd.get('outstanding_qty') || fd.get('qty')) || 0,
    shipment_lines:   [],
                dometic_remarks: fd.get('dometic_remarks') || '',
                zunpower_remarks: '',
                status:          'open',
                priority:        fd.get('priority') || 'normal',
                eta:             fd.get('eta')        || '',
                order_date:      fd.get('order_date') || today(),
                ship_date:       fd.get('ship_date')  || '',
                location:        fd.get('location')   || 'OTHERS',
                value:           (parseInt(fd.get('qty')) || 0) * (parseFloat(fd.get('unit_cost')) || 0),
                special_requests: [],
                history:         []
            };
            logHistory(newPO, 'Created PO');
            state.pos.unshift(newPO);
            persistState();
            await CloudService.createPO(newPO)
                .catch(err => console.warn('[Save] Create failed:', err));
        }

        renderAll();
        closeDrawer();
        showToast(`✅ PO saved successfully`);
    });
}

// ---- View Switching ----
function switchView(view) {
    state.currentView = view;
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-view') === view);
    });
    ['live-board-content', 'demand-planning-content'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', id !== `${view}-content`);
    });
}

// ---- Persistence / Sync ----

/** Persist current state to localStorage */
function persistState() {
    localStorage.setItem('gma_dash_state', JSON.stringify(state));
}

/** Load state from localStorage (called on startup before cloud sync) */
function loadLocalState() {
    try {
        const saved = localStorage.getItem('gma_dash_state');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed.pos) && parsed.pos.length > 0) {
                state.pos = parsed.pos;
            }
            // Restore role so the save handler's role checks work across page refreshes.
            // Authentication is still enforced via the HttpOnly cookie on every API call.
            if (parsed.role) state.role = parsed.role;
            state.authenticated = parsed.authenticated || false;
        }
    } catch (e) {
        console.warn('[State] Could not parse localStorage state:', e);
    }
}

/**
 * Sync with Supabase.
 * Strategy:
 *   - If cloud returns ≥1 records → use cloud as source of truth.
 *   - If cloud returns 0 records AND we have local data → seed Supabase with local data.
 *   - If cloud call fails → fall back to local data silently.
 */
async function syncWithCloud() {
    const badge = document.getElementById('syncIndicator');

    try {
        console.log('[Sync] Fetching from Supabase...');
        const cloudPOs = await CloudService.getPOs();

        if (Array.isArray(cloudPOs) && cloudPOs.length > 0) {
            // Ensure special_requests field exists on all POs
            state.pos = cloudPOs.map(po => {
                // The dometic_remarks / zunpower_remarks columns now exist in the DB.
                // Only fall back to the legacy reference-encoded format when the
                // column is UNDEFINED (i.e. not returned by the query at all).
                // A NULL or empty-string value means the column exists but has no
                // content yet — do NOT overwrite it with the reference field.
                let dRem = po.dometic_remarks;
                let zRem = po.zunpower_remarks;

                if (dRem === undefined) {
                    // Legacy path: column was never added to this DB instance.
                    let ref = po.reference || '';
                    const idx = ref.indexOf('|||ZP:');
                    if (idx !== -1) {
                        zRem = ref.substring(idx + 6);
                        dRem = ref.substring(0, idx);
                    } else {
                        dRem = ref;
                        zRem = zRem === undefined ? '' : zRem;
                    }
                }

                return {
                    ...po,
                    priority:         po.priority         || 'normal',
                    special_requests: po.special_requests || [],
                    dometic_remarks:  dRem  ?? '',
                    zunpower_remarks: zRem  ?? '',
                    shipment_lines:   po.shipment_lines   || []
                };
            });
            persistState();
            console.log(`[Sync] Loaded ${cloudPOs.length} POs from Supabase.`);
        } else if (!CloudService.isMock && state.pos.length > 0) {
            console.log('[Sync] Supabase table is empty. Seeding with local data...');
            for (const po of state.pos) {
                await CloudService.createPO(po).catch(err =>
                    console.warn(`[Seed] Could not seed ${po.id}:`, err)
                );
            }
            console.log('[Sync] Seed complete.');
        }

        if (badge) {
            const label = CloudService.isMock ? 'Demo Mode' : 'Cloud Connected';
            badge.innerHTML = `<span class="dot"></span> ${label}`;
            badge.classList.toggle('demo-mode', CloudService.isMock);
        }
    } catch (err) {
        console.warn('[Sync] Cloud sync failed — using local data.', err);
        if (badge) {
            badge.innerHTML = `<span class="dot"></span> Offline`;
            badge.classList.add('demo-mode');
        }
    }
}

// ---- Quick Field Update (ZunPower inline) ----
window.quickUpdateField = async function(id, field, value) {
    const po = state.pos.find(p => p.id === id);
    if (!po) return;

    po[field] = field === 'outstanding_qty' ? parseInt(value) : value;
    const label = { status: 'Status', ship_date: 'Ship Date', outstanding_qty: 'Outstanding Qty', location: 'Location', priority: 'Priority' }[field] || field;
    logHistory(po, `${label} → ${cap(value)}`);

    persistState();
    await CloudService.updatePO(id, { [field]: po[field], history: po.history })
        .catch(err => console.warn('[QuickUpdate] Failed:', err));

    renderAll();
};

// ---- Edit Drawer ----
window.openEditDrawer = function(id) {
    const po = state.pos.find(p => p.id === id);
    if (!po) return;
    editingPOId = id;
    fillForm(po);
    openDrawer('edit');
};

// ---- Delete ----
window.deletePO = async function() {
    if (!editingPOId || state.role !== 'dometic') return;
    const confirmed = confirm(`Permanently delete ${editingPOId}?\n\nThis cannot be undone.`);
    if (!confirmed) return;

    const idToDelete = editingPOId; // capture before closeDrawer clears it

    // Optimistic local removal
    state.pos = state.pos.filter(p => p.id !== idToDelete);
    persistState();
    closeDrawer();
    renderAll();

    try {
        await CloudService.deletePO(idToDelete);
        showToast(`🗑 PO ${idToDelete} deleted`, 'warning');
    } catch (err) {
        console.error('[Delete] Cloud delete failed:', err);
        showToast(`⚠️ Local delete succeeded but cloud sync failed — ${err.message}`, 'error');
    }
};

// ---- Close PO (Dometic only, outstanding_qty must be 0) ----
window.closePO = async function() {
    if (!editingPOId || state.role !== 'dometic') return;
    const po = state.pos.find(p => p.id === editingPOId);
    if (!po) return;

    const totalOutstanding = computeTotals(po).outstanding_qty;
    if (totalOutstanding > 0) {
        showToast(`⚠️ Cannot close — ${totalOutstanding} units still outstanding`, 'warning');
        return;
    }

    const confirmed = confirm(`Close PO ${editingPOId}?\n\nThis will mark it as closed and grey it out on the board.`);
    if (!confirmed) return;

    po.status = 'closed';
    logHistory(po, 'PO Closed by Dometic');
    persistState();

    await CloudService.updatePO(editingPOId, { status: 'closed', history: po.history })
        .catch(err => console.warn('[ClosePO] Failed:', err));

    closeDrawer();
    renderAll();
    showToast(`📬 PO ${editingPOId} closed`);
};


// ---- Audit Trail ----
function logHistory(po, action) {
    if (!po.history) po.history = [];
    const now  = new Date();
    const date = now.toISOString().slice(0, 10);
    const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const who  = state.role === 'zunpower' ? 'ZunPower' : 'Dometic';
    po.history.push({ by: who, action, date: `${date} ${time}` });
}


// ---- Login / Role Switch ----
function openRoleSwitchOverlay() {
    const overlay  = document.getElementById('loginOverlay');
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginError').classList.add('hidden');
    overlay.classList.add('active');
    setTimeout(() => document.getElementById('loginEmail').focus(), 250);
}

function setupLoginLogic() {
    const overlay   = document.getElementById('loginOverlay');
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;

    loginForm.addEventListener('submit', async e => {
        e.preventDefault();
        const email    = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        const errEl    = document.getElementById('loginError');

        try {
            const role = await CloudService.login(email, password);
            state.role          = role;
            state.authenticated = true;
            overlay.classList.remove('active');
            errEl.classList.add('hidden');
            localStorage.setItem('gma_last_auth', Date.now().toString());
            persistState();
            
            // Sync with secure backend now that cookies are set
            await syncWithCloud();
            
            renderAll();
            showToast(`👋 Welcome, ${role === 'dometic' ? 'Dometic Admin' : 'ZunPower'}`);
        } catch (err) {
            errEl.textContent = 'Invalid email or password.';
            errEl.classList.remove('hidden');
            document.getElementById('loginPassword').value = '';
            document.getElementById('loginPassword').focus();
        }
    });
}

// ---- Helpers ----
function cap(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}
function today() {
    return new Date().toISOString().split('T')[0];
}
