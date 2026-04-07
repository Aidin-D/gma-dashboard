/**
 * SharePointService.js
 * Handles real-time communication with Microsoft SharePoint/Microsoft Lists.
 * 
 * Note: For this to work without complex OAuth, host index.html on the same 
 * SharePoint site where the list resides.
 */

const SharePointService = {
    siteUrl: '', 
    listTitle: 'GMA_OpenPOs',
    isMock: false, 
    isLocalServer: false, // New flag for X-drive/Local Server mode

    /**
     * Initialize the connection
     */
    async init(siteUrl) {
        // Detect if we're running from the Portable PowerShell Server (Local Network Mode)
        if (window.location.port === '8080' || window.location.hostname === 'localhost') {
            try {
                const check = await fetch('/api/data');
                if (check.ok) {
                    this.isLocalServer = true;
                    console.info('[SharePointService] Portable Server Detected (Local Network Mode)');
                    return;
                }
            } catch (e) { /* Fallback to standard logic */ }
        }

        // Compatibility Mode: Detect if we're in a restricted SharePoint preview or being served via download
        if (!siteUrl && typeof _spPageContextInfo !== 'undefined') {
            siteUrl = _spPageContextInfo.webAbsoluteUrl;
        }
        
        // Fallback: Guess site URL from current location if hosted in shared docs
        if (!siteUrl && window.location.href.includes('.sharepoint.com')) {
            const parts = window.location.href.split('/Shared%20Documents');
            if (parts.length > 1) siteUrl = parts[0];
            else {
                const siteParts = window.location.href.split('/sites/');
                if (siteParts.length > 1) siteUrl = siteParts[0] + '/sites/' + siteParts[1].split('/')[0];
            }
        }

        if (siteUrl) {
            this.siteUrl = siteUrl;
            this.isMock = false;
        }
        console.log(`[SharePoint] Initialized ${this.isMock ? '(MOCK MODE)' : '(LIVE MODE)'}`);
    },

    /**
     * Fetch all POs from the list
     */
    async getPOs() {
        if (this.isLocalServer) {
            const resp = await fetch('/api/data');
            return await resp.json();
        }
        
        if (this.isMock) {
            return JSON.parse(localStorage.getItem('gma_dash_state'))?.pos || [];
        }

        try {
            const response = await fetch(`${this.siteUrl}/_api/web/lists/getbytitle('${this.listTitle}')/items`, {
                headers: { "Accept": "application/json; odata=verbose" }
            });
            const data = await response.json();
            return data.d.results.map(item => this.mapFromSP(item));
        } catch (err) {
            console.error("Failed to fetch POs from SharePoint:", err);
            return [];
        }
    },

    /**
     * Create a new PO in the list
     */
    async createPO(po) {
        if (this.isLocalServer) return true; // Handled by saveState in app.js for now
        if (this.isMock) return po;

        const digest = await this.getRequestDigest();
        try {
            const response = await fetch(`${this.siteUrl}/_api/web/lists/getbytitle('${this.listTitle}')/items`, {
                method: "POST",
                body: JSON.stringify(this.mapToSP(po)),
                headers: {
                    "Accept": "application/json; odata=verbose",
                    "Content-Type": "application/json; odata=verbose",
                    "X-RequestDigest": digest
                }
            });
            return await response.json();
        } catch (err) {
            console.error("Failed to create PO in SharePoint:", err);
        }
    },

    /**
     * Update an existing PO status
     */
    async updatePO(poId, updates) {
        if (this.isLocalServer) return true; // Handled by saveState in app.js
        if (this.isMock) return true;

        // Note: In real SP, we need the internal ID, not the PO string ID
        const digest = await this.getRequestDigest();
        try {
            // First find the item ID
            const item = await this.getItemByPO(poId);
            if (!item) throw new Error("PO not found in SharePoint list");

            await fetch(`${this.siteUrl}/_api/web/lists/getbytitle('${this.listTitle}')/items(${item.Id})`, {
                method: "POST",
                body: JSON.stringify(updates),
                headers: {
                    "Accept": "application/json; odata=verbose",
                    "Content-Type": "application/json; odata=verbose",
                    "X-RequestDigest": digest,
                    "X-HTTP-Method": "MERGE",
                    "IF-MATCH": "*"
                }
            });
            return true;
        } catch (err) {
            console.error("Failed to update PO in SharePoint:", err);
            return false;
        }
    },

    /**
     * Delete a PO from the list
     */
    async deletePO(poId) {
        if (this.isLocalServer) return true; // Handled by saveState in app.js
        if (this.isMock) return true;

        const digest = await this.getRequestDigest();
        try {
            const item = await this.getItemByPO(poId);
            if (!item) throw new Error("PO not found in SharePoint list");

            await fetch(`${this.siteUrl}/_api/web/lists/getbytitle('${this.listTitle}')/items(${item.Id})`, {
                method: "POST",
                headers: {
                    "X-RequestDigest": digest,
                    "X-HTTP-Method": "DELETE",
                    "IF-MATCH": "*"
                }
            });
            return true;
        } catch (err) {
            console.error("Failed to delete PO in SharePoint:", err);
            return false;
        }
    },

    /**
     * Helper: Get Request Digest for POST/PATCH operations
     */
    async getRequestDigest() {
        if (this.isMock) return "mock-digest";
        try {
            const response = await fetch(`${this.siteUrl}/_api/contextinfo`, {
                method: "POST",
                headers: { "Accept": "application/json; odata=verbose" }
            });
            const data = await response.json();
            return data.d.GetContextWebInformation.FormDigestValue;
        } catch (err) {
            console.warn("Could not get security digest. This is normal if hosting locally.");
            return null;
        }
    },

    /**
     * Helper: Map SharePoint item fields to App PO fields
     */
    mapFromSP(item) {
        return {
            id: item.Title, 
            item_number: item.ItemNumber,
            desc: item.Description,
            qty: item.Quantity,
            outstanding_qty: item.OutstandingQty,
            order_date: item.OrderDate,
            ship_date: item.ShipDate,
            location: item.Location,
            status: item.Status.toLowerCase(),
            eta: item.ETA,
            value: item.TotalValue,
            spId: item.Id 
        };
    },

    /**
     * Helper: Map App PO fields to SharePoint item fields
     */
    mapToSP(po) {
        return {
            '__metadata': { 'type': `SP.Data.${this.listTitle}ListItem` },
            Title: po.id,
            ItemNumber: po.item_number,
            Description: po.desc,
            Quantity: po.qty,
            OutstandingQty: po.outstanding_qty,
            OrderDate: po.order_date,
            ShipDate: po.ship_date,
            Location: po.location,
            Status: po.status.charAt(0).toUpperCase() + po.status.slice(1),
            ETA: po.eta,
            TotalValue: po.value
        };
    },

    async getItemByPO(poId) {
        const response = await fetch(`${this.siteUrl}/_api/web/lists/getbytitle('${this.listTitle}')/items?$filter=Title eq '${poId}'`, {
            headers: { "Accept": "application/json; odata=verbose" }
        });
        const data = await response.json();
        return data.d.results[0];
    },

    /**
     * Local Persistence: Save state to Portable Server
     */
    async saveLocal(pos) {
        if (!this.isLocalServer) return;
        try {
            await fetch('/api/save', {
                method: 'POST',
                body: JSON.stringify(pos),
                headers: { 'Content-Type': 'application/json' }
            });
            console.info('[SharePointService] Local Sync Successful');
        } catch (e) {
            console.error('[SharePointService] Local Sync Failed:', e);
        }
    }
};
