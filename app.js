// GMA Live Dashboard — App Logic v2.1
// Supabase-backed · Role-Aware · Audit Trail

// ---- Seed Data (fallback when cloud is empty) ----
const SEED_POS = [
    {
        id: 'PO-2024-001', item_number: '83356', desc: 'RV AC Unit - 15k BTU',
        description: 'RV AC Unit - 15k BTU',
        qty: 150, status: 'shipped', eta: '2024-04-12', value: 125000,
        order_date: '2024-03-01', ship_date: '2024-04-05', outstanding_qty: 0,
        location: 'DCIN', currency: 'USD', unit_cost: 833.33, reference: 'Batch A-12',
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
        history: [
            { by: 'Dometic',  action: 'Created PO',          date: '2024-03-15 11:00' },
            { by: 'ZunPower', action: 'Status → Production',  date: '2024-03-22 08:20' }
        ]
    }
];

// ---- State ----
let state = {
    role: 'dometic',
    currentView: 'live-board',
    pos: [...SEED_POS]
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

let activeStatusFilter = 'all';

// ---- Init ----
document.addEventListener('DOMContentLoaded', async () => {
    loadLocalState();
    setupEventListeners();
    setupLoginLogic();
    switchView('live-board');
    renderAll();

    // Connect to Supabase and sync
    const cloudUrl = localStorage.getItem('gma_cloud_url') || CloudService.supabaseUrl;
    const cloudKey = localStorage.getItem('gma_cloud_key') || CloudService.supabaseKey;
    await CloudService.init(cloudUrl, cloudKey);
    await syncWithCloud();
    renderAll();
});

// ---- Render ----
function renderAll() {
    renderStats();
    filterAndRenderTable();
    updateUIForRole();
}

function renderStats() {
    const totalValue = state.pos.reduce((sum, po) => sum + (po.qty * (po.unit_cost || 0)), 0);
    const inProd  = state.pos.filter(po => po.status === 'production').length;
    const shipped = state.pos.filter(po => po.status === 'shipped').length;
    const atRisk  = state.pos.filter(po => po.status === 'delayed').length;

    setText('statTotalValue',   `$${totalValue.toLocaleString()}`);
    setText('statInProduction', `${inProd} Orders`);
    setText('statShipped',      `${shipped} Orders`);
    setText('statAtRisk',       `${atRisk}`);
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function filterAndRenderTable() {
    const query = (searchInput.value || '').toLowerCase();
    const filtered = state.pos.filter(po => {
        const matchesQuery = (
            po.id.toLowerCase().includes(query) ||
            (po.item_number   || '').toLowerCase().includes(query) ||
            (po.description   || po.desc || '').toLowerCase().includes(query) ||
            (po.location      || '').toLowerCase().includes(query) ||
            (po.reference     || '').toLowerCase().includes(query)
        );
        const matchesStatus = (activeStatusFilter === 'all' || po.status === activeStatusFilter);
        return matchesQuery && matchesStatus;
    });
    renderPOTable(filtered);
}

function renderPOTable(data) {
    const isZunPower = state.role === 'zunpower';

    poTableBody.innerHTML = data.map(po => {
        const unitCost     = po.unit_cost || 0;
        const costOS       = unitCost * (po.outstanding_qty || 0);
        const pulseClass   = po.status === 'delayed' ? ' pulse' : '';
        const etaStyle     = po.status === 'delayed' ? 'color:#dc2626;font-weight:700' : '';
        const currSym      = '$';

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
        const historyLog  = (po.history || []).slice().reverse();
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

        return `
            <tr class="expandable-row" onclick="toggleRow('${po.id}')">
                <td style="width:36px;padding-left:20px">
                    <svg id="icon-${po.id}" style="width:14px;height:14px;transition:transform 0.2s;color:#94a3b8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </td>
                <td style="font-weight:700;color:#1e293b">${po.id}</td>
                <td style="font-weight:600">${po.item_number || '—'}</td>
                <td class="hidden-md" style="text-align:right;font-weight:600">${currSym}${unitCost.toLocaleString()}</td>
                <td><span class="status-pill status-${po.status}${pulseClass}">${po.status}</span></td>
                <td class="hidden-lg" style="text-align:right;color:#2563eb;font-weight:700">${currSym}${costOS.toLocaleString()}</td>
                <td class="hidden-sm" style="${etaStyle}">${po.eta || 'TBD'}</td>
                <td style="text-align:right">${actionBtn}</td>
            </tr>
            <tr id="details-${po.id}" class="details-row hidden">
                <td colspan="8" style="padding:0 20px">
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
                            <p class="detail-label">Total Volume Cost</p>
                            <p style="font-size:1rem;font-weight:800;color:#2563eb">${currSym}${(po.qty * unitCost).toLocaleString()}</p>
                        </div>
                        <div style="grid-column:1/-1">
                            <p class="detail-label">Notes / Reference</p>
                            <p class="detail-value" style="font-style:italic">${po.reference || 'No additional comments.'}</p>
                        </div>
                        ${zunPowerPanel}
                        ${historyPanel}
                    </div>
                </td>
            </tr>`;
    }).join('');
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

function fillForm(po) {
    const f = poForm;
    f.querySelector('[name="po_number"]').value      = po.id;
    f.querySelector('[name="sku"]').value            = po.item_number || '';
    f.querySelector('[name="description"]').value    = po.description || po.desc || '';
    f.querySelector('[name="qty"]').value            = po.qty;
    f.querySelector('[name="outstanding_qty"]').value= po.outstanding_qty ?? po.qty;
    f.querySelector('[name="unit_cost"]').value      = po.unit_cost || 0;
    f.querySelector('[name="currency"]').value       = po.currency || 'USD';
    f.querySelector('[name="location"]').value       = po.location || '';
    f.querySelector('[name="order_date"]').value     = po.order_date || '';
    f.querySelector('[name="eta"]').value            = po.eta || '';
    f.querySelector('[name="ship_date"]').value      = po.ship_date || '';
    f.querySelector('[name="status"]').value         = po.status || 'open';
    f.querySelector('[name="reference"]').value      = po.reference || '';
    updateFinancialSummary();
}

function updateUIForRole() {
    const isZunPower = state.role === 'zunpower';
    if (createPOBtn) createPOBtn.style.display = isZunPower ? 'none' : 'flex';

    document.querySelectorAll('.role-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-role') === state.role);
    });
}

function openDrawer(mode = 'create') {
    const title       = document.querySelector('.drawer-header h3');
    const subtitle    = document.querySelector('.drawer-header .subtitle');
    const submitBtn   = document.querySelector('.btn-submit');
    const statusGroup = document.getElementById('statusFieldGroup');
    const deleteBtn   = document.getElementById('deletePOBtn');
    const poInput     = poForm.querySelector('[name="po_number"]');

    if (mode === 'edit' && editingPOId) {
        title.textContent    = 'Update Purchase Order';
        subtitle.textContent = state.role === 'zunpower' ? 'ZunPower Partner Update' : 'Dometic Admin Edit';
        submitBtn.textContent= 'Save Changes';
        statusGroup.classList.remove('hidden');
        // Role restrictions — ZunPower can only update logistics/status fields
        const restricted = ['po_number', 'sku', 'qty', 'unit_cost', 'order_date', 'description'];
        const isZP = state.role === 'zunpower';
        restricted.forEach(fname => {
            const el = poForm.querySelector(`[name="${fname}"]`);
            if (el) { el.readOnly = isZP; el.style.background = isZP ? 'var(--slate-50)' : 'white'; }
        });

        deleteBtn.classList.toggle('hidden', state.role !== 'dometic');
    } else {
        title.textContent    = 'New Purchase Order';
        subtitle.textContent = 'Supply Chain Execution';
        submitBtn.textContent= 'Commit Order';
        statusGroup.classList.add('hidden');
        deleteBtn.classList.add('hidden');
        poInput.readOnly = false;
        editingPOId = null;
    }

    sideDrawer.classList.add('open');
    drawerOverlay.classList.add('visible');
    updateFinancialSummary();
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
    editingPOId = null;
}

// ---- Events ----
function setupEventListeners() {
    // Search
    searchInput.addEventListener('input', filterAndRenderTable);

    // Role Toggle buttons
    document.querySelectorAll('.role-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const role = btn.getAttribute('data-role');
            if (role !== state.role) {
                // Pre-select the right tab in the login overlay
                const overlay = document.getElementById('loginOverlay');
                const targetBtn = overlay.querySelector(`.login-role-btn[data-target-role="${role}"]`);
                if (targetBtn) {
                    overlay.querySelectorAll('.login-role-btn').forEach(b => b.classList.remove('active'));
                    targetBtn.classList.add('active');
                }
                overlay.classList.add('active');
                document.getElementById('passcode').value = '';
                document.getElementById('loginError').classList.add('hidden');
            }
        });
    });

    // Financial live recalc
    ['qty', 'unit_cost', 'outstanding_qty', 'currency'].forEach(field => {
        const el = poForm.querySelector(`[name="${field}"]`);
        if (el) el.addEventListener('input', updateFinancialSummary);
    });

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

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeStatusFilter = btn.getAttribute('data-status');
            filterAndRenderTable();
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
            const newStatus   = fd.get('status');
            const newShipDate = fd.get('ship_date');
            const newOutstanding = parseInt(fd.get('outstanding_qty'));

            if (newStatus && newStatus !== po.status) {
                changes.push(`Status → ${cap(newStatus)}`);
                po.status = newStatus;
            }
            if (newShipDate && newShipDate !== po.ship_date) {
                changes.push(`Ship Date → ${newShipDate}`);
                po.ship_date = newShipDate;
            }
            if (!isNaN(newOutstanding) && newOutstanding !== po.outstanding_qty) {
                changes.push(`Outstanding Qty → ${newOutstanding}`);
                po.outstanding_qty = newOutstanding;
            }

            const newPoId    = fd.get('po_number');
            if (newPoId && newPoId !== po.id) {
                changes.push(`ID changed to ${newPoId}`);
                po.id = newPoId;
            }

            po.description   = fd.get('description') || po.description || po.desc;
            po.desc          = po.description;
            po.qty           = parseInt(fd.get('qty'))         || po.qty;
            po.unit_cost     = parseFloat(fd.get('unit_cost')) || po.unit_cost || 0;
            po.currency      = fd.get('currency')  || po.currency || 'USD';
            po.reference     = fd.get('reference') ?? po.reference;
            po.eta           = fd.get('eta')        || po.eta;
            po.order_date    = fd.get('order_date') || po.order_date;
            po.location      = fd.get('location')   || po.location;
            po.item_number   = fd.get('sku')        || po.item_number;
            po.value         = po.qty * (po.unit_cost || 0);

            logHistory(po, changes.length > 0 ? changes.join(', ') : 'Updated via form');
            persistState();
            await CloudService.updatePO(editingPOId, {
                id:             po.id,
                description:    po.description,
                qty:            po.qty,
                outstanding_qty:po.outstanding_qty,
                unit_cost:      po.unit_cost,
                currency:       po.currency,
                reference:      po.reference,
                eta:            po.eta,
                ship_date:      po.ship_date,
                order_date:     po.order_date,
                location:       po.location,
                status:         po.status,
                item_number:    po.item_number,
                value:          po.value,
                history:        po.history
            }).catch(err => console.warn('[Save] Update failed:', err));

        } else {
            const newPO = {
                id:             fd.get('po_number'),
                item_number:    fd.get('sku'),
                description:    fd.get('description'),
                desc:           fd.get('description'),
                qty:            parseInt(fd.get('qty'))            || 0,
                outstanding_qty:parseInt(fd.get('outstanding_qty') || fd.get('qty')) || 0,
                unit_cost:      parseFloat(fd.get('unit_cost'))    || 0,
                currency:       fd.get('currency')  || 'USD',
                reference:      fd.get('reference') || '',
                status:         'open',
                eta:            fd.get('eta')        || '',
                order_date:     fd.get('order_date') || today(),
                ship_date:      fd.get('ship_date')  || '',
                location:       fd.get('location')   || 'OTHERS',
                value:          (parseInt(fd.get('qty')) || 0) * (parseFloat(fd.get('unit_cost')) || 0),
                history:        []
            };
            logHistory(newPO, 'Created PO');
            state.pos.unshift(newPO);
            persistState();
            await CloudService.createPO(newPO)
                .catch(err => console.warn('[Save] Create failed:', err));
        }

        renderAll();
        closeDrawer();
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
            // Only restore pos if we have records saved locally
            if (Array.isArray(parsed.pos) && parsed.pos.length > 0) {
                state.pos = parsed.pos;
            }
            state.role = parsed.role || 'dometic';
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
            // Cloud has data — use it
            state.pos = cloudPOs;
            persistState();
            console.log(`[Sync] Loaded ${cloudPOs.length} POs from Supabase.`);
        } else if (!CloudService.isMock && state.pos.length > 0) {
            // Cloud table is empty but we have local data — seed it
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
    const label = { status: 'Status', ship_date: 'Ship Date', outstanding_qty: 'Outstanding Qty', location: 'Location' }[field] || field;
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

    state.pos = state.pos.filter(p => p.id !== editingPOId);
    persistState();
    await CloudService.deletePO(editingPOId)
        .catch(err => console.warn('[Delete] Failed:', err));

    closeDrawer();
    renderAll();
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

// ---- Financial Summary (live) ----
function updateFinancialSummary() {
    const fd      = new FormData(poForm);
    const qty     = parseFloat(fd.get('qty'))             || 0;
    const cost    = parseFloat(fd.get('unit_cost'))        || 0;
    const osQty   = parseFloat(fd.get('outstanding_qty'))  || 0;

    const costOS  = document.getElementById('costOS');
    const costAll = document.getElementById('costAll');
    if (costOS)  costOS.textContent  = `$ ${(osQty * cost).toLocaleString()}`;
    if (costAll) costAll.textContent = `$ ${(qty   * cost).toLocaleString()}`;
}

// ---- Login / Role Switch ----
function setupLoginLogic() {
    const overlay    = document.getElementById('loginOverlay');
    const roleBtns   = document.querySelectorAll('.login-role-btn');
    let   selectedRole = 'dometic';

    roleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            roleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedRole = btn.dataset.targetRole;
        });
    });

    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;

    loginForm.addEventListener('submit', e => {
        e.preventDefault();
        const passcode = document.getElementById('passcode').value.trim();
        // Passcodes: Dometic = 7890 · ZunPower = 1234
        const correct  = selectedRole === 'dometic' ? '7890' : '1234';
        const errEl    = document.getElementById('loginError');

        if (passcode === correct) {
            state.role = selectedRole;
            overlay.classList.remove('active');
            document.getElementById('passcode').value = '';
            errEl.classList.add('hidden');
            persistState();
            renderAll();
        } else {
            errEl.classList.remove('hidden');
            document.getElementById('passcode').value = '';
            document.getElementById('passcode').focus();
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
