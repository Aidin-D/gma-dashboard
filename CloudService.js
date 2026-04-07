/**
 * CloudService.js
 * Powered by Supabase (PostgreSQL)
 * Provides high-performance, real-time data sync for Dometic & ZunPower.
 * 
 * To Use:
 * 1. Create a free account at supabase.com
 * 2. Create a new project called "GMA-Dashboard"
 * 3. Create a table named 'pos' with the columns listed in GMA-Cloud-Setup.md
 */

const CloudService = {
    supabaseUrl: 'https://hettdkznujeabmckkvni.supabase.co',
    supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhldHRka3pudWplYWJtY2trdm5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzMyNjksImV4cCI6MjA5MTE0OTI2OX0.byriabl_RZcELa6gnla6j5LZT7r6DFxkm2fW6e9QycQ',
    isMock: false, 

    async init(url, key) {
        if (url && key) {
            this.supabaseUrl = url;
            this.supabaseKey = key;
            // Sanity check for Supabase key format (should start with ey... JWT)
            this.isMock = !this.supabaseKey.startsWith('ey');
            if (this.isMock) {
                console.warn('[CloudService] Provided key does not look like a standard Supabase Key. Defaulting to Demo Mode.');
            }
        }
        console.log(`[CloudService] Initialized ${this.isMock ? '(MOCK MODE)' : '(LIVE MODE)'}`);
    },

    /**
     * Fetch all POs from the cloud database
     */
    async getPOs() {
        if (this.isMock) {
            return JSON.parse(localStorage.getItem('gma_dash_state'))?.pos || [];
        }

        const resp = await fetch(`${this.supabaseUrl}/rest/v1/pos?select=*`, {
            headers: {
                "apikey": this.supabaseKey,
                "Authorization": `Bearer ${this.supabaseKey}`
            }
        });
        return await resp.json();
    },

    /**
     * Create a new PO
     */
    async createPO(po) {
        if (this.isMock) return po;

        await fetch(`${this.supabaseUrl}/rest/v1/pos`, {
            method: 'POST',
            body: JSON.stringify(po),
            headers: {
                "apikey": this.supabaseKey,
                "Authorization": `Bearer ${this.supabaseKey}`,
                "Content-Type": "application/json",
                "Prefer": "return=representation"
            }
        });
    },

    /**
     * Update an existing PO
     */
    async updatePO(poId, updates) {
        if (this.isMock) return true;

        await fetch(`${this.supabaseUrl}/rest/v1/pos?id=eq.${poId}`, {
            method: 'PATCH',
            body: JSON.stringify(updates),
            headers: {
                "apikey": this.supabaseKey,
                "Authorization": `Bearer ${this.supabaseKey}`,
                "Content-Type": "application/json"
            }
        });
    },

    /**
     * Delete a PO
     */
    async deletePO(poId) {
        if (this.isMock) return true;

        await fetch(`${this.supabaseUrl}/rest/v1/pos?id=eq.${poId}`, {
            method: 'DELETE',
            headers: {
                "apikey": this.supabaseKey,
                "Authorization": `Bearer ${this.supabaseKey}`
            }
        });
    }
};
