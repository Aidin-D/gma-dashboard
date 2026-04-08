/**
 * CloudService.js
 * Powered by Supabase (PostgreSQL)
 * Provides high-performance, real-time data sync for Dometic & ZunPower.
 *
 * Table: 'purchase_orders'
 * Required columns: id (text PK), item_number, description, qty, outstanding_qty,
 *   unit_cost, currency, status, eta, order_date, ship_date, location,
 *   reference, value, history (jsonb)
 */

const CloudService = {
    supabaseUrl: 'https://hettdkznujeabmckkvni.supabase.co',
    supabaseKey: 'sb_publishable_PbTN8cRWOk69utvQNgBuYg_Y2ITb5Zx',
    isMock: false,
    _table: 'purchase_orders',

    // ---- Helpers ----

    _headers(extra = {}) {
        return {
            'apikey': this.supabaseKey,
            'Authorization': `Bearer ${this.supabaseKey}`,
            'Content-Type': 'application/json',
            ...extra
        };
    },

    async _request(url, options = {}) {
        const resp = await fetch(url, {
            ...options,
            headers: this._headers(options.headers || {})
        });

        if (!resp.ok) {
            let detail = '';
            try { detail = JSON.stringify(await resp.json()); } catch (_) {}
            throw new Error(`[CloudService] HTTP ${resp.status} — ${resp.statusText}. ${detail}`);
        }

        // 204 No Content (DELETE / PATCH) — return true
        if (resp.status === 204) return true;

        return resp.json();
    },

    // ---- Init ----

    async init(url, key) {
        if (url && key) {
            this.supabaseUrl = url.trim().replace(/\/$/, '');
            this.supabaseKey = key.trim();
        }

        // A valid Supabase anon key is always a JWT starting with "eyJ"
        this.isMock = !this.supabaseKey.startsWith('eyJ');

        if (this.isMock) {
            console.warn('[CloudService] Key does not look like a Supabase JWT — running in Demo Mode.');
        }

        console.log(`[CloudService] Initialized — ${this.isMock ? 'DEMO MODE (local only)' : 'LIVE MODE (Supabase)'}`);
    },

    // ---- CRUD ----

    /**
     * Fetch all POs from Supabase, ordered newest first.
     * Returns [] on empty table (not null).
     */
    async getPOs() {
        if (this.isMock) {
            const cached = localStorage.getItem('gma_dash_state');
            return (cached ? JSON.parse(cached).pos : null) || [];
        }

        const url = `${this.supabaseUrl}/rest/v1/${this._table}?select=*&order=order_date.desc`;
        const data = await this._request(url);
        return Array.isArray(data) ? data : [];
    },

    /**
     * Insert a new PO row.
     * Maps app state fields → DB columns.
     */
    async createPO(po) {
        if (this.isMock) return po;

        const row = this._toRow(po);
        const url = `${this.supabaseUrl}/rest/v1/${this._table}`;
        return this._request(url, {
            method: 'POST',
            body: JSON.stringify(row),
            headers: { 'Prefer': 'return=representation' }
        });
    },

    /**
     * Patch specific fields on an existing PO.
     * @param {string} poId  — the PO id (primary key)
     * @param {object} updates — partial field map
     */
    async updatePO(poId, updates) {
        if (this.isMock) return true;

        const url = `${this.supabaseUrl}/rest/v1/${this._table}?id=eq.${encodeURIComponent(poId)}`;
        return this._request(url, {
            method: 'PATCH',
            body: JSON.stringify(updates),
            headers: { 'Prefer': 'return=minimal' }
        });
    },

    /**
     * Delete a PO by id.
     */
    async deletePO(poId) {
        if (this.isMock) return true;

        const url = `${this.supabaseUrl}/rest/v1/${this._table}?id=eq.${encodeURIComponent(poId)}`;
        return this._request(url, { method: 'DELETE' });
    },

    /**
     * Upsert the full history JSON for a PO.
     * Called after logHistory so audit trail stays in sync.
     */
    async updateHistory(poId, history) {
        return this.updatePO(poId, { history });
    },

    // ---- Field Mapping ----

    /** Convert the in-memory PO object to a flat DB row */
    _toRow(po) {
        return {
            id:              po.id,
            item_number:     po.item_number || '',
            description:     po.description || po.desc || '',
            qty:             po.qty          || 0,
            outstanding_qty: po.outstanding_qty ?? po.qty ?? 0,
            unit_cost:       po.unit_cost    || 0,
            currency:        po.currency     || 'USD',
            status:          po.status       || 'open',
            eta:             po.eta          || null,
            order_date:      po.order_date   || null,
            ship_date:       po.ship_date    || null,
            location:        po.location     || 'OTHERS',
            reference:       po.reference    || '',
            value:           (po.qty || 0) * (po.unit_cost || 0),
            history:         po.history      || []
        };
    }
};
