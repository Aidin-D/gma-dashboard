// GMA Live Dashboard — App Logic

// ---- State ----
let state = {
    role: 'dometic',
    currentView: 'live-board',
    pos: [
        { id: 'PO-2024-001', item_number: '83356', desc: 'RV AC Unit - 15k BTU', qty: 150, status: 'shipped', eta: '2024-04-12', value: 125000, order_date: '2024-03-01', ship_date: '2024-04-05', outstanding_qty: 0, location: 'DCIN', currency: 'USD', unit_cost: 833.33, reference: 'Batch A-12', history: [
            { by: 'Dometic', action: 'Created PO', date: '2024-03-01 09:15' },
            { by: 'ZunPower', action: 'Status → Production', date: '2024-03-18 14:30' },
            { by: 'ZunPower', action: 'Ship Date set to 2024-04-05', date: '2024-04-02 10:00' },
            { by: 'ZunPower', action: 'Status → Shipped', date: '2024-04-05 16:45' }
        ]},
        { id: 'PO-2024-002', item_number: '91001', desc: 'Solar Panel 200W', qty: 300, status: 'production', eta: '2024-04-25', value: 98000, order_date: '2024-03-15', ship_date: '', outstanding_qty: 300, location: 'FTN', currency: 'USD', unit_cost: 326.66, reference: 'Urgent demand', history: [
            { by: 'Dometic', action: 'Created PO', date: '2024-03-15 11:00' },
            { by: 'ZunPower', action: 'Status → Production', date: '2024-03-22 08:20' }
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
    setupLoginLogic();
    switchView('live-board');
    
    // Load cloud config
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
    const totalValue = state.pos.reduce((sum, po) => sum + (po.qty * (po.unit_cost || 0)), 0);
    const inProd = state.pos.filter(po => po.status === 'production').length;
    const shipped = state.pos.filter(po => po.status === 'shipped').length;
    const atRisk = state.pos.filter(po => po.status === 'delayed').length;

    const valEl = document.getElementById('statTotalValue');
    if (valEl) valEl.textContent = `$${totalValue.toLocaleString()}`;
    const prodEl = document.getElementById('statInProduction');
    if (prodEl) prodEl.textContent = `${inProd} Orders`;
    const shipEl = document.getElementById('statShipped');
    if (shipEl) shipEl.textContent = `${shipped} Orders`;
    const riskEl = document.getElementById('statAtRisk');
    if (riskEl) riskEl.textContent = `${atRisk}`;
}

function filterAndRenderTable() {
    const query = searchInput.value.toLowerCase();
    const filtered = state.pos.filter(po => {
        const matchesQuery = (
            po.id.toLowerCase().includes(query) ||
            (po.item_number || '').toLowerCase().includes(query) ||
            (po.description || po.desc || '').toLowerCase().includes(query) ||
            (po.location || '').toLowerCase().includes(query) ||
            (po.reference || '').toLowerCase().includes(query)
        );
        const matchesStatus = (activeStatusFilter === 'all' || po.status === activeStatusFilter);
        return matchesQuery && matchesStatus;
    });
    renderPOTable(filtered);
}

function renderPOTable(data) {
    const isZunPower = state.role === 'zunpower';
    poTableBody.innerHTML = data.map(po => {
        const progress = Math.round(((po.qty - (po.outstanding_qty || 0)) / po.qty) * 100);
        const pulseClass = po.status === 'delayed' ? ' pulse' : '';
        const etaColor = po.status === 'delayed' ? 'color:#dc2626;font-weight:700' : '';
        
        const unitCost = po.unit_cost || 0;
        const totalCostOS = unitCost * (po.outstanding_qty || 0);
        const currencySymbol = po.currency === 'CNY' ? '¥' : po.currency === 'EUR' ? '€' : '$';

        // Role-aware action button
        const actionBtn = isZunPower
            ? `<button class="action-link update" onclick="event.stopPropagation(); openEditDrawer('${po.id}')">Update</button>`
            : `<button class="action-link" onclick="event.stopPropagation(); openEditDrawer('${po.id}')">Details</button>`;

        // ZunPower quick-actions
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
                </div>
            </div>
        ` : '';

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
                <td><span class="status-pill status-${po.status}${pulseClass}">${po.status}</span></td>
                <td class="hidden-md" style="text-align:right; font-weight:600">${currencySymbol}${unitCost.toLocaleString()}</td>
                <td class="hidden-lg" style="text-align:right; color:var(--blue-600); font-weight:700">${currencySymbol}${totalCostOS.toLocaleString()}</td>
                <td class="hidden-sm" style="${etaColor}">${po.eta || 'TBD'}</td>
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
                            <p class="detail-sub">Ordered: <span class="detail-val">${po.order_date || '-'}</span></p>
                            <p class="detail-sub">Shipped: <span class="detail-val">${po.ship_date || 'Pending'}</span></p>
                        </div>
                        <div>
                            <p class="detail-label">Quantity Summary</p>
                            <p class="detail-sub">Total: <span class="detail-val">${po.qty}</span></p>
                            <p class="detail-sub">Remaining: <span style="font-weight:700;color:#ea580c">${po.outstanding_qty}</span></p>
                        </div>
                        <div>
                            <p class="detail-label">Total Volume Cost</p>
                            <p style="font-size:1rem;font-weight:800;color:#2563eb">${currencySymbol}${(po.qty * unitCost).toLocaleString()}</p>
                        </div>
                        <div style="grid-column:1/-1">
                             <p class="detail-label">Notes / Reference</p>
                             <p class="detail-value" style="font-style:italic">${po.reference || 'No additional comments.'}</p>
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

// ---- Drawer ----
let editingPOId = null;

function fillForm(po) {
    poForm.querySelector('[name="po_number"]').value = po.id;
    poForm.querySelector('[name="sku"]').value = po.item_number;
    poForm.querySelector('[name="description"]').value = po.description || po.desc || '';
    poForm.querySelector('[name="qty"]').value = po.qty;
    poForm.querySelector('[name="outstanding_qty"]').value = po.outstanding_qty;
    poForm.querySelector('[name="unit_cost"]').value = po.unit_cost || 0;
    poForm.querySelector('[name="currency"]').value = po.currency || 'USD';
    poForm.querySelector('[name="location"]').value = po.location || '';
    poForm.querySelector('[name="order_date"]').value = po.order_date || '';
    poForm.querySelector('[name="eta"]').value = po.eta || '';
    poForm.querySelector('[name="ship_date"]').value = po.ship_date || '';
    poForm.querySelector('[name="status"]').value = po.status;
    poForm.querySelector('[name="reference"]').value = po.reference || '';
}

function updateUIForRole() {
    const isZunPower = state.role === 'zunpower';
    const isDometic = state.role === 'dometic';
    
    if (createPOBtn) createPOBtn.style.display = isZunPower ? 'none' : 'flex';
    
    document.querySelectorAll('.role-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-role') === state.role);
    });
}

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

        // Role Restrictions
        const isZunPower = state.role === 'zunpower';
        const restrictedFields = ['po_number', 'sku', 'qty', 'unit_cost', 'order_date', 'description'];
        
        restrictedFields.forEach(field => {
            const input = poForm.querySelector(`[name="${field}"]`);
            if (input) {
                input.readOnly = isZunPower;
                input.style.background = isZunPower ? 'var(--slate-50)' : 'white';
            }
        });

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
    updateFinancialSummary();
}

function closeDrawer() {
    sideDrawer.classList.remove('open');
    drawerOverlay.classList.remove('visible');
    poForm.reset();
    
    // Reset form states
    const allInputs = poForm.querySelectorAll('input, select, textarea');
    allInputs.forEach(input => {
        input.readOnly = false;
        input.style.background = 'white';
    });

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
            const role = btn.getAttribute('data-role');
            if (role === 'zunpower' && state.role !== 'zunpower') {
                document.getElementById('loginOverlay').classList.add('active');
            } else if (role === 'dometic' && state.role !== 'dometic') {
                const overlay = document.getElementById('loginOverlay');
                overlay.querySelector('.login-role-btn[data-target-role="dometic"]').click();
                overlay.classList.add('active');
            }
        });
    });

    // PO Form Inputs for Real-time calculations
    ['qty', 'unit_cost', 'outstanding_qty', 'currency'].forEach(field => {
        const input = poForm.querySelector(`[name="${field}"]`);
        if (input) input.addEventListener('input', updateFinancialSummary);
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
                po.description = fd.get('description') || po.description;
                po.qty = parseInt(fd.get('qty')) || po.qty;
                po.outstanding_qty = !isNaN(newOutstanding) ? newOutstanding : po.outstanding_qty;
                po.unit_cost = parseFloat(fd.get('unit_cost')) || po.unit_cost || 0;
                po.currency = fd.get('currency') || po.currency || 'USD';
                po.reference = fd.get('reference') || po.reference || '';
                po.eta = fd.get('eta') || po.eta;
                po.order_date = fd.get('order_date') || po.order_date;
                po.ship_date = fd.get('ship_date') || po.ship_date;
                po.location = fd.get('location') || po.location;
                po.item_number = fd.get('sku') || po.item_number;
                po.value = po.qty * (po.unit_cost || 0);

                const summary = changes.length > 0 ? changes.join(', ') : 'Updated via form';
                logHistory(po, summary);

                saveState({ id: po.id, updates: {
                    description: po.desc,
                    qty: po.qty,
                    outstanding_qty: po.outstanding_qty,
                    unit_cost: po.unit_cost,
                    currency: po.currency,
                    reference: po.reference,
                    eta: po.eta,
                    ship_date: po.ship_date,
                    location: po.location,
                    status: po.status
                }}, 'update');
            }
        } else {
            // Create new PO
            const newPO = {
                id: fd.get('po_number'),
                item_number: fd.get('sku'),
                desc: fd.get('description'),
                description: fd.get('description'),
                qty: parseInt(fd.get('qty')) || 0,
                unit_cost: parseFloat(fd.get('unit_cost')) || 0,
                currency: fd.get('currency') || 'USD',
                reference: fd.get('reference') || '',
                status: 'open',
                eta: fd.get('eta'),
                order_date: fd.get('order_date') || new Date().toISOString().split('T')[0],
                ship_date: fd.get('ship_date') || '',
                outstanding_qty: parseInt(fd.get('outstanding_qty') || fd.get('qty')) || 0,
                location: fd.get('location') || 'OTHERS',
                value: (parseInt(fd.get('qty')) || 0) * (parseFloat(fd.get('unit_cost')) || 0),
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

    // Build Supabase field mapping
    const fieldMap = { status: 'status', ship_date: 'ship_date', outstanding_qty: 'outstanding_qty', location: 'location' };
    const spField = fieldMap[field] || field;
    const spValue = field === 'status' ? value : value;

    saveState({ id, updates: { [spField]: spValue } }, 'update');
    renderAll();
};

window.openEditDrawer = function(id) {
    const po = state.pos.find(p => p.id === id);
    if (!po) return;

    editingPOId = id;

    // Pre-fill the form
    fillForm(po);

    openDrawer('edit');
};

window.deletePO = function() {
    if (!editingPOId) return;
    const po = state.pos.find(p => p.id === editingPOId);
    if (!po) return;

    if (state.role !== 'dometic') return;

    const confirmed = confirm(`Are you sure you want to permanently delete ${editingPOId}?\n\nThis action cannot be undone.`);
    if (!confirmed) return;

    state.pos = state.pos.filter(p => p.id !== editingPOId);
    saveState({ id: editingPOId }, 'delete');
    closeDrawer();
    renderAll();
};

function updateFinancialSummary() {
    const formData = new FormData(poForm);
    const qty = parseFloat(formData.get('qty')) || 0;
    const unitCost = parseFloat(formData.get('unit_cost')) || 0;
    const osQty = parseFloat(formData.get('outstanding_qty')) || 0;
    const currency = formData.get('currency');
    const symbol = currency === 'CNY' ? '¥' : currency === 'EUR' ? '€' : '$';

    const costOS = document.getElementById('costOS');
    const costAll = document.getElementById('costAll');
    if (costOS) costOS.textContent = `${symbol} ${(osQty * unitCost).toLocaleString()}`;
    if (costAll) costAll.textContent = `${symbol} ${(qty * unitCost).toLocaleString()}`;
}

function setupLoginLogic() {
    const overlay = document.getElementById('loginOverlay');
    const roleBtns = document.querySelectorAll('.login-role-btn');
    let selectedRole = 'dometic';

    roleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            roleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedRole = btn.dataset.targetRole;
        });
    });

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const passcode = document.getElementById('passcode').value;
            const correctCode = selectedRole === 'dometic' ? '7890' : '1234';

            if (passcode === correctCode) {
                state.role = selectedRole;
                overlay.classList.remove('active');
                document.getElementById('passcode').value = '';
                document.getElementById('loginError').classList.add('hidden');
                renderAll();
                localStorage.setItem('gma_dash_state', JSON.stringify(state));
            } else {
                document.getElementById('loginError').classList.remove('hidden');
            }
        });
    }
}
