/**
 * CloudService.js
 * Powered by Supabase (PostgreSQL)
 * Provides high-performance, real-time data sync for Dometic & ZunPower.
 *
 * Table: 'purchase_orders'
 * Core columns: id (text PK), item_number, description, qty, outstanding_qty,
 *   unit_cost, currency, status, eta, order_date, ship_date, location,
 *   reference, value, history (jsonb)
 *
 * Extended columns (add via ALTER TABLE — see migration below):
 *   priority         text  DEFAULT 'normal'
 *   special_requests jsonb DEFAULT '[]'
 *   dometic_remarks  text  DEFAULT ''
 *   zunpower_remarks text  DEFAULT ''
 *   shipment_lines   jsonb DEFAULT '[]'
 *
 * -- SQL Migration (run once in Supabase SQL Editor):
 * ALTER TABLE purchase_orders
 *   ADD COLUMN IF NOT EXISTS priority         text    DEFAULT 'normal',
 *   ADD COLUMN IF NOT EXISTS special_requests jsonb   DEFAULT '[]',
 *   ADD COLUMN IF NOT EXISTS dometic_remarks  text    DEFAULT '',
 *   ADD COLUMN IF NOT EXISTS zunpower_remarks text    DEFAULT '',
 *   ADD COLUMN IF NOT EXISTS shipment_lines   jsonb   DEFAULT '[]';
 */

const CloudService = {
    // Traffic routed through secure Vercel API backend
    apiUrl: '/api/pos',
    authUrl: '/api/auth',
    isMock: false,
    _table: 'purchase_orders',

    /**
     * Core columns guaranteed to exist in the DB schema.
     * Extended columns (priority, special_requests) are tried first;
     * if Supabase returns a column-not-found error we fall back to CORE_COLUMNS only.
     */
    /**
     * Columns guaranteed to exist in the base DB schema.
     * shipment_lines is an EXTENDED column — it is NOT in this set so the
     * fallback strip can remove it when the column has not been migrated yet.
     */
    CORE_COLUMNS: new Set([
        'id', 'item_number', 'description', 'qty', 'outstanding_qty',
        'unit_cost', 'currency', 'status', 'eta', 'order_date',
        'ship_date', 'location', 'reference', 'value', 'history',
        'dometic_remarks', 'zunpower_remarks',
        'priority', 'special_requests'
    ]),

    /**
     * Tracks whether the shipment_lines column exists in the live schema.
     * null = not yet tested, true = confirmed, false = not migrated yet.
     */
    _shipmentLinesAvailable: null,

    /**
     * Tracks whether the general extended columns (priority, special_requests, remarks)
     * have been confirmed available.
     * null = not yet tested, true = available, false = not available
     */
    _extendedColumnsAvailable: null,

    // ---- Helpers ----

    _headers(extra = {}) {
        return {
            'Content-Type': 'application/json',
            ...extra
        };
    },

    async _request(url, options = {}) {
        const resp = await fetch(url, {
            ...options,
            credentials: 'include',
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

    /** Returns true if the error is a Supabase "column not found" error */
    _isMissingColumnError(err) {
        return err && err.message && (
            err.message.includes('PGRST204') ||
            err.message.includes('42703') ||
            err.message.includes('column') && err.message.includes('does not exist') ||
            err.message.includes('could not find') && err.message.includes('column')
        );
    },

    /** Filter an update payload to only include CORE_COLUMNS (drops shipment_lines too) */
    _stripExtendedColumns(updates) {
        return Object.fromEntries(
            Object.entries(updates).filter(([k]) => this.CORE_COLUMNS.has(k))
        );
    },

    /** Filter an update payload to remove only the shipment_lines key */
    _stripShipmentLines(updates) {
        const { shipment_lines, ...rest } = updates;
        return rest;
    },

    // ---- Init & Auth ----

    async init() {
        console.log(`[CloudService] Initialized — Secure API Proxy Mode`);
    },

    async login(email, password) {
        const resp = await fetch(this.authUrl, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        if (!resp.ok) throw new Error('Invalid credentials');
        const data = await resp.json();
        return data.role;
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

        const url = `${this.apiUrl}?select=*&order=order_date.desc`;
        const data = await this._request(url);
        return Array.isArray(data) ? data : [];
    },

    /**
     * Insert a new PO row.
     * Tries with all columns; falls back to core-only if extended columns missing.
     */
    async createPO(po) {
        if (this.isMock) return po;

        const url = this.apiUrl;
        const opts = { method: 'POST', headers: { 'Prefer': 'return=representation' } };

        // Try with full row (includes priority + special_requests if available)
        if (this._extendedColumnsAvailable !== false) {
            try {
                const row = this._toRow(po);
                const result = await this._request(url, { ...opts, body: JSON.stringify(row) });
                this._extendedColumnsAvailable = true;
                return result;
            } catch (err) {
                if (this._isMissingColumnError(err)) {
                    console.warn('[CloudService] Extended columns not in DB yet. Using core columns only. Run the SQL migration to enable full feature persistence.');
                    this._extendedColumnsAvailable = false;
                } else {
                    throw err;
                }
            }
        }

        // Fallback: core columns only
        const coreRow = this._stripExtendedColumns(this._toRow(po));
        return this._request(url, { ...opts, body: JSON.stringify(coreRow) });
    },

    /**
     * Patch specific fields on an existing PO.
     * Uses return=representation so we can detect 0-row updates (PO not in DB yet)
     * and fall back to a full createPO insert automatically.
     *
     * Retry strategy (two-level):
     *   1. If shipment_lines column is missing → retry without it.
     *   2. If other extended columns are missing → retry with core-only payload.
     *
     * @param {string} poId    — the PO id (primary key)
     * @param {object} updates — partial field map  (only columns you want to change)
     * @param {object} fullPO  — full PO object from state (used for fallback insert)
     */
    async updatePO(poId, updates, fullPO = null) {
        if (this.isMock) return true;

        const url = `${this.apiUrl}?id=eq.${encodeURIComponent(poId)}`;
        const opts = { method: 'PATCH', headers: { 'Prefer': 'return=representation' } };

        // Build the payload — strip columns we already know are missing
        let payload = updates;
        if (this._shipmentLinesAvailable === false) {
            payload = this._stripShipmentLines(payload);
        }
        if (this._extendedColumnsAvailable === false) {
            payload = this._stripExtendedColumns(payload);
        }

        try {
            const result = await this._request(url, { ...opts, body: JSON.stringify(payload) });
            // Mark columns as available on first success
            if (payload.shipment_lines !== undefined) this._shipmentLinesAvailable = true;
            this._extendedColumnsAvailable = true;

            // Empty array = PATCH matched 0 rows → PO doesn't exist in Supabase yet.
            if (Array.isArray(result) && result.length === 0 && fullPO) {
                console.warn(`[CloudService] PATCH matched 0 rows for ${poId} — inserting now.`);
                return this.createPO(fullPO);
            }
            return result;
        } catch (err) {
            if (this._isMissingColumnError(err)) {
                // Determine which column triggered the error
                const isShipmentLinesErr =
                    err.message.includes('shipment_lines');

                if (isShipmentLinesErr && this._shipmentLinesAvailable !== false) {
                    console.warn('[CloudService] shipment_lines column not in DB yet — retrying without it. Run the SQL migration to enable split-shipment persistence.');
                    this._shipmentLinesAvailable = false;
                    const safePayload = this._stripShipmentLines(payload);
                    const result2 = await this._request(url, { ...opts, body: JSON.stringify(safePayload) });
                    if (Array.isArray(result2) && result2.length === 0 && fullPO) {
                        return this.createPO(fullPO);
                    }
                    return result2;
                }

                console.warn('[CloudService] Retrying PATCH without extended columns.');
                this._extendedColumnsAvailable = false;
                const safeUpdates = this._stripExtendedColumns(updates);
                return this._request(url, { ...opts, body: JSON.stringify(safeUpdates) });
            }
            throw err;
        }
    },

    /**
     * Delete a PO by id.
     */
    async deletePO(poId) {
        if (this.isMock) return true;

        const url = `${this.apiUrl}?id=eq.${encodeURIComponent(poId)}`;
        return this._request(url, { method: 'DELETE' });
    },

    /**
     * Upsert the full history JSON for a PO.
     */
    async updateHistory(poId, history) {
        return this.updatePO(poId, { history });
    },

    // ---- Field Mapping ----

    /** Convert the in-memory PO object to a flat DB row (all columns) */
    _toRow(po) {
        const row = {
            id:               po.id,
            item_number:      po.item_number      || '',
            description:      po.description      || po.desc || '',
            qty:              po.qty               || 0,
            outstanding_qty:  po.outstanding_qty  ?? po.qty ?? 0,
            unit_cost:        po.unit_cost         || 0,
            currency:         po.currency          || 'USD',
            status:           po.status            || 'open',
            eta:              po.eta               || null,
            order_date:       po.order_date        || null,
            ship_date:        po.ship_date         || null,
            location:         po.location          || 'OTHERS',
            reference:        po.reference         || '',
            value:            (po.qty || 0) * (po.unit_cost || 0),
            priority:         po.priority          || 'normal',
            special_requests: po.special_requests  || [],
            dometic_remarks:  po.dometic_remarks   || '',
            zunpower_remarks: po.zunpower_remarks  || '',
            history:          po.history           || []
        };
        // Only include shipment_lines if we know the column exists (or haven't tested yet)
        if (this._shipmentLinesAvailable !== false) {
            row.shipment_lines = po.shipment_lines || [];
        }
        return row;
    }
};
