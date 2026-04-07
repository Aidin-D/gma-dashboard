// GMA Live Dashboard — App Logic

// ---- State ----
let state = {
    role: 'dometic',
    currentView: 'live-board',
    pos: [
        { id: 'PO-2024-001', item_number: '83356', desc: 'RV AC Unit - 15k BTU', qty: 150, status: 'shipped', eta: '2024-04-12', value: 125000, order_date: '2024-03-01', ship_date: '2024-04-05', outstanding_qty: 0, location: 'DCIN', history: [
            { by: 'Dometic', action: 'Created PO', date: '2024-03-01 09:15' },
            { by: 'ZunPower', action: 'Status → Production', date: '2024-03-18 14:30' },
            { by: 'ZunPower', action: 'Ship Date set to 2024-04-05', date: '2024-04-02 10:00' },
            { by: 'ZunPower', action: 'Status → Shipped', date: '2024-04-05 16:45' }
        ]},
        { id: 'PO-2024-002', item_number: '91001', desc: 'Solar Panel 200W', qty: 300, status: 'production', eta: '2024-04-25', value: 98000, order_date: '2024-03-15', ship_date: '', outstanding_qty: 300, location: 'FTN', history: [
            { by: 'Dometic', action: 'Created PO', date: '2024-03-15 11:00' },
            { by: 'ZunPower', action: 'Status → Production', date: '2024-03-22 08:20' }
        ]},
        { id: 'PO-2024-003', item_number: '83356', desc: 'RV AC Unit - 15k BTU', qty: 80, status: 'open', eta: '2024-05-02', value: 68000, order_date: '2024-04-01', ship_date: '', outstanding_qty: 80, location: 'REMCO', history: [
            { by: 'Dometic', action: 'Created PO', date: '2024-04-01 10:30' }
        ]},
        { id: 'PO-2024-004', item_number: '75200', desc: 'Power Inverter 2000W', qty: 200, status: 'delayed', eta: '2024-04-10', value: 85000, order_date: '2024-03-05', ship_date: '', outstanding_qty: 200, location: 'OTHERS', history: [
            { by: 'Dometic', action: 'Created PO', date: '2024-03-05 15:10' },
            { by: 'ZunPower', action: 'Status → Delayed', date: '2024-04-08 09:45' }
        ]}
    ]
};

// ---- DOM ----
const poTableBody = document.getElementById('poTableBody');
const poForm = document.getElementById('poForm');
const createPOBtn = document.getElementById('createPOBtn');
const sideDrawer = document.getElementById('sideDrawer');
const drawerOverlay = document.getElementById('drawerOverlay');
const closeModal = document.getElementById('closeModal');
const cancelModal = document.getElementById('cancelModal');
const searchInput = document.getElementById('searchInput');

let activeStatusFilter = 'all';

// ---- Init ----
document.addEventListener('DOMContentLoaded', async () => {
    loadState();
    setupEventListeners();
    switchView('live-board');
    // Load config from localStorage if set, otherwise use mock
    const cloudUrl = localStorage.getItem('gma_cloud_url');
    const cloudKey = localStorage.getItem('gma_cloud_key');
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
    const totalValue = state.pos.reduce((sum, po) => sum + po.value, 0);
    const inProd = state.pos.filter(po => po.status === 'production').length;
    const shipped = state.pos.filter(po => po.status === 'shipped').length;
    const atRisk = state.pos.filter(po => po.status === 'delayed').length;

    document.getElementById('statTotalValue').textContent = `$${totalValue.toLocaleString()}`;
    document.getElementById('statInProduction').textContent = `${inProd} Orders`;
    document.getElementById('statShipped').textContent = `${shipped} Orders`;
    document.getElementById('statAtRisk').textContent = `${atRisk}`;
}

function filterAndRenderTable() {
    const query = searchInput.value.toLowerCase();
    const filtered = state.pos.filter(po => {
        const matchesQuery = (
            po.id.toLowerCase().includes(query) ||
            po.item_number.toLowerCase().includes(query) ||
            po.desc.toLowerCase().includes(query) ||
            po.location.toLowerCase().includes(query)
        );
        const matchesStatus = (activeStatusFilter === 'all' || po.status === activeStatusFilter);
        return matchesQuery && matchesStatus;
    });
    renderPOTable(filtered);
}

function renderPOTable(data) {
    const isZunPower = state.role === 'zunpower';
    poTableBody.innerHTML = data.map(po => {
        const progress = Math.round(((po.qty - po.outstanding_qty) / po.qty) * 100);
        const pulseClass = po.status === 'delayed' ? ' pulse' : '';
        const etaColor = po.status === 'delayed' ? 'color:#dc2626;font-weight:700' : '';

        // Role-aware action button
        const actionBtn = isZunPower
            ? `<button class="action-link update" onclick="event.stopPropagation(); openEditDrawer('${po.id}')">Update</button>`
            : `<button class="action-link" onclick="event.stopPropagation(); openEditDrawer('${po.id}')">Details</button>`;

        // ZunPower quick-actions in the detail row
        const zunPowerActions = isZunPower ? `
            <div style="grid-column:1/-1;border-top:1px solid #e2e8f0;padding-top:16px;margin-top:8px">
                <p class="detail-label" style="margin-bottom:10px;color:#2563eb">Quick Update</p>
                <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
                    <div style="flex:1;min-width:140px">
                        <label class="detail-label">Status</label>
                        <select class="form-input" onchange="quickUpdateField('${po.id}','status',this.value)" style="padding:8px 10px">
                            <option value="open" ${po.status==='open'?'selected':''}>Open</option>
                            <option value="production" ${po.status==='production'?'selected':''}>Production</option>
                            <option value="shipped" ${po.status==='shipped'?'selected':''}>Shipped</option>
                            <option value="delayed" ${po.status==='delayed'?'selected':''}>Delayed</option>
                        </select>
                    </div>
                    <div style="flex:1;min-width:140px">
                        <label class="detail-label">Ship Date</label>
                        <input type="date" class="form-input" value="${po.ship_date}" onchange="quickUpdateField('${po.id}','ship_date',this.value)" style="padding:8px 10px">
                    </div>
                    <div style="flex:1;min-width:120px">
                        <label class="detail-label">Outstanding Qty</label>
                        <input type="number" class="form-input" value="${po.outstanding_qty}" onchange="quickUpdateField('${po.id}','outstanding_qty',parseInt(this.value))" style="padding:8px 10px">
                    </div>
                </div>
            </div>
        ` : '';

        // Update history timeline
        const historyLog = (po.history || []).slice().reverse();
        const historyHtml = historyLog.length > 0 ? `
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
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : '';

        return `
            <tr class="expandable-row" onclick="toggleRow('${po.id}')">
                <td style="width:36px;padding-left:20px">
                    <svg id="icon-${po.id}" style="width:14px;height:14px;transition:transform 0.2s;color:#94a3b8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </td>
                <td style="font-weight:700;color:#1e293b">${po.id}</td>
                <td style="font-weight:600">${po.item_number}</td>
                <td class="hidden-md" style="color:#64748b;max-width:200px;overflow:hidden;text-overflow:ellipsis">${po.desc}</td>
                <td><span class="status-pill status-${po.status}${pulseClass}">${po.status}</span></td>
                <td class="hidden-lg">
                    <div style="display:flex;align-items:center;gap:10px">
                        <div class="progress-container"><div class="progress-fill" style="width:${progress}%"></div></div>
                        <span style="font-size:0.7rem;font-weight:700;color:#94a3b8">${progress}%</span>
                    </div>
                </td>
                <td class="hidden-sm" style="${etaColor}">${po.eta}</td>
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
                            <p class="detail-sub">Ordered: <span class="detail-val">${po.order_date}</span></p>
                            <p class="detail-sub">Shipped: <span class="detail-val">${po.ship_date || 'Pending'}</span></p>
                        </div>
                        <div>
                            <p class="detail-label">Quantity Breakdown</p>
                            <p class="detail-sub">Total: <span class="detail-val">${po.qty}</span></p>
                            <p class="detail-sub">Outstanding: <span style="font-weight:700;color:#ea580c">${po.outstanding_qty}</span></p>
                        </div>
                        <div>
                            <p class="detail-label">Estimated Value</p>
                            <p style="font-size:1rem;font-weight:800;color:#2563eb">$${po.value.toLocaleString()}</p>
                        </div>
                        ${zunPowerActions}
                        ${historyHtml}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ---- Row Expand ----
window.toggleRow = function(id) {
    const detailRow = document.getElementById(`details-${id}`);
    const icon = document.getElementById(`icon-${id}`);
    if (!detailRow) return;

    if (detailRow.classList.contains('hidden')) {
        detailRow.classList.remove('hidden');
        icon.style.transform = 'rotate(90deg)';
    } else {
        detailRow.classList.add('hidden');
        icon.style.transform = 'rotate(0deg)';
    }
};

// ---- Role ----
function updateUIForRole() {
    const isDometic = state.role === 'dometic';
    createPOBtn.classList.toggle('hidden', !isDometic);
    document.querySelectorAll('.role-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-role') === state.role);
    });
}

// ---- Drawer ----
let editingPOId = null;

function openDrawer(mode = 'create') {
    const title = document.querySelector('.drawer-header h3');
    const subtitle = document.querySelector('.drawer-header .subtitle');
    const submitBtn = document.querySelector('.btn-submit');
    const statusGroup = document.getElementById('statusFieldGroup');
    const deleteBtn = document.getElementById('deletePOBtn');
    const poNumberInput = poForm.querySelector('[name="po_number"]');

    if (mode === 'edit' && editingPOId) {
        title.textContent = 'Update Purchase Order';
        subtitle.textContent = state.role === 'zunpower' ? 'ZunPower Partner Update' : 'Dometic Admin Edit';
        submitBtn.textContent = 'Save Changes';
        statusGroup.classList.remove('hidden');
        poNumberInput.readOnly = true;
        // Show delete only for Dometic
        if (state.role === 'dometic') {
            deleteBtn.classList.remove('hidden');
        } else {
            deleteBtn.classList.add('hidden');
        }
    } else {
        title.textContent = 'New Purchase Order';
        subtitle.textContent = 'Supply Chain Execution';
        submitBtn.textContent = 'Commit Order';
        statusGroup.classList.add('hidden');
        deleteBtn.classList.add('hidden');
        poNumberInput.readOnly = false;
        editingPOId = null;
    }

    sideDrawer.classList.add('open');
    drawerOverlay.classList.add('visible');
}

function closeDrawer() {
    sideDrawer.classList.remove('open');
    drawerOverlay.classList.remove('visible');
    poForm.reset();
    poForm.querySelector('[name="po_number"]').readOnly = false;
    document.getElementById('statusFieldGroup').classList.add('hidden');
    document.getElementById('deletePOBtn').classList.add('hidden');
    editingPOId = null;
}

// ---- Events ----
function setupEventListeners() {
    // Search
    searchInput.addEventListener('input', filterAndRenderTable);

    // Role Toggle
    document.querySelectorAll('.role-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.role = btn.getAttribute('data-role');
            updateUIForRole();
            renderAll();
        });
    });

    // Mobile Menu Toggle
    const mobileToggle = document.getElementById('mobileMenuToggle');
    if (mobileToggle) {
        mobileToggle.addEventListener('click', () => {
            const sidebar = document.querySelector('.sidebar');
            const overlay = document.getElementById('drawerOverlay');
            sidebar.classList.toggle('mobile-open');
            overlay.classList.toggle('visible');
            overlay.classList.toggle('mobile-overlay');
        });
    }

    // Nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            switchView(item.getAttribute('data-view'));
            // Close mobile sidebar on nav
            const sidebar = document.querySelector('.sidebar');
            if (sidebar.classList.contains('mobile-open')) {
                sidebar.classList.remove('mobile-open');
                document.getElementById('drawerOverlay').classList.remove('visible', 'mobile-overlay');
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

    // Drawer
    createPOBtn.addEventListener('click', () => openDrawer('create'));
    closeModal.addEventListener('click', closeDrawer);
    cancelModal.addEventListener('click', closeDrawer);
    
    // Updated Overlay Click
    drawerOverlay.addEventListener('click', () => {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar.classList.contains('mobile-open')) {
            sidebar.classList.remove('mobile-open');
            drawerOverlay.classList.remove('visible', 'mobile-overlay');
        } else {
            closeDrawer();
        }
    });

    // Form Submit
    poForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(poForm);

        if (editingPOId) {
            // Update existing PO
            const po = state.pos.find(p => p.id === editingPOId);
            if (po) {
                // Track what changed for history
                const changes = [];
                const newStatus = fd.get('status');
                if (newStatus && newStatus !== po.status) {
                    changes.push(`Status → ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`);
                    po.status = newStatus;
                }
                const newShipDate = fd.get('ship_date');
                if (newShipDate && newShipDate !== po.ship_date) {
                    changes.push(`Ship Date → ${newShipDate}`);
                }
                const newOutstanding = parseInt(fd.get('outstanding_qty'));
                if (!isNaN(newOutstanding) && newOutstanding !== po.outstanding_qty) {
                    changes.push(`Outstanding Qty → ${newOutstanding}`);
                }

                po.desc = fd.get('description') || po.desc;
                po.qty = parseInt(fd.get('qty')) || po.qty;
                po.outstanding_qty = !isNaN(newOutstanding) ? newOutstanding : po.outstanding_qty;
                po.eta = fd.get('eta') || po.eta;
                po.order_date = fd.get('order_date') || po.order_date;
                po.ship_date = fd.get('ship_date') || po.ship_date;
                po.location = fd.get('location') || po.location;
                po.item_number = fd.get('sku') || po.item_number;

                const summary = changes.length > 0 ? changes.join(', ') : 'Updated via form';
                logHistory(po, summary);

                saveState({ id: po.id, updates: {
                    Description: po.desc,
                    Quantity: po.qty,
                    OutstandingQty: po.outstanding_qty,
                    ETA: po.eta,
                    ShipDate: po.ship_date,
                    Location: po.location,
                    Status: po.status.charAt(0).toUpperCase() + po.status.slice(1)
                }}, 'update');
            }
        } else {
            // Create new PO
            const newPO = {
                id: fd.get('po_number'),
                item_number: fd.get('sku'),
                desc: fd.get('description'),
                qty: parseInt(fd.get('qty')),
                status: 'open',
                eta: fd.get('eta'),
                order_date: fd.get('order_date') || new Date().toISOString().split('T')[0],
                ship_date: fd.get('ship_date') || '',
                outstanding_qty: parseInt(fd.get('outstanding_qty') || fd.get('qty')),
                location: fd.get('location') || 'OTHERS',
                value: Math.floor(Math.random() * 50000) + 10000,
                history: []
            };
            logHistory(newPO, 'Created PO');
            state.pos.unshift(newPO);
            saveState(newPO, 'create');
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

    // Hide all views
    ['live-board-content', 'demand-planning-content'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    // Show target
    const target = document.getElementById(`${view}-content`);
    if (target) target.classList.remove('hidden');
}

// ---- Persistence ----
async function saveState(data, action) {
    localStorage.setItem('gma_dash_state', JSON.stringify(state));
    if (action === 'create') {
        await CloudService.createPO(data);
    } else if (action === 'update') {
        await CloudService.updatePO(data.id, data.updates);
    } else if (action === 'delete') {
        await CloudService.deletePO(data.id);
    }
}

async function syncWithCloud() {
    console.log('[App] Syncing with Cloud...');
    const cloudPOs = await CloudService.getPOs();
    if (cloudPOs && cloudPOs.length > 0) {
        state.pos = cloudPOs;
        localStorage.setItem('gma_dash_state', JSON.stringify(state));
    }
    
    // Update Connection Badge
    const badge = document.getElementById('syncIndicator');
    if (badge) {
        badge.innerHTML = `<span class="dot"></span> ${CloudService.isMock ? 'Demo Mode' : 'Cloud Connected'}`;
        badge.classList.toggle('demo-mode', CloudService.isMock);
    }
    console.log('[App] Cloud Sync Complete.');
}

function loadState() {
    const saved = localStorage.getItem('gma_dash_state');
    if (saved) {
        const parsed = JSON.parse(saved);
        state.pos = parsed.pos || state.pos;
        state.role = parsed.role || 'dometic';
    }
}

// ---- Audit Trail ----
function logHistory(po, action) {
    if (!po.history) po.history = [];
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const who = state.role === 'zunpower' ? 'ZunPower' : 'Dometic';
    po.history.push({ by: who, action, date: `${date} ${time}` });
}

// ---- Global Actions ----
window.quickUpdateField = function(id, field, value) {
    const po = state.pos.find(p => p.id === id);
    if (!po) return;

    const oldValue = po[field];
    po[field] = value;

    // Log history
    const fieldLabels = { status: 'Status', ship_date: 'Ship Date', outstanding_qty: 'Outstanding Qty', location: 'Location' };
    const label = fieldLabels[field] || field;
    const displayVal = field === 'status' ? value.charAt(0).toUpperCase() + value.slice(1) : value;
    logHistory(po, `${label} → ${displayVal}`);

    // Build SP field mapping
    const fieldMap = { status: 'Status', ship_date: 'ShipDate', outstanding_qty: 'OutstandingQty', location: 'Location' };
    const spField = fieldMap[field] || field;
    const spValue = field === 'status' ? value.charAt(0).toUpperCase() + value.slice(1) : value;

    saveState({ id, updates: { [spField]: spValue } }, 'update');
    renderAll();
};

window.openEditDrawer = function(id) {
    const po = state.pos.find(p => p.id === id);
    if (!po) return;

    editingPOId = id;

    // Pre-fill the form
    const form = poForm;
    form.querySelector('[name="po_number"]').value = po.id;
    form.querySelector('[name="sku"]').value = po.item_number;
    form.querySelector('[name="description"]').value = po.desc;
    form.querySelector('[name="qty"]').value = po.qty;
    form.querySelector('[name="outstanding_qty"]').value = po.outstanding_qty;
    form.querySelector('[name="location"]').value = po.location;
    form.querySelector('[name="order_date"]').value = po.order_date;
    form.querySelector('[name="eta"]').value = po.eta;
    form.querySelector('[name="ship_date"]').value = po.ship_date;
    form.querySelector('[name="status"]').value = po.status;

    openDrawer('edit');
};

window.deletePO = function() {
    if (!editingPOId) return;
    const po = state.pos.find(p => p.id === editingPOId);
    if (!po) return;

    const confirmed = confirm(`Are you sure you want to permanently delete ${editingPOId}?\n\nThis action cannot be undone.`);
    if (!confirmed) return;

    state.pos = state.pos.filter(p => p.id !== editingPOId);
    saveState();
    closeDrawer();
    renderAll();
};
