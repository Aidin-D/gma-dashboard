export const config = {
  runtime: 'edge',
};

const SUPABASE_URL = 'https://hettdkznujeabmckkvni.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhldHRka3pudWplYWJtY2trdm5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzMyNjksImV4cCI6MjA5MTE0OTI2OX0.byriabl_RZcELa6gnla6j5LZT7r6DFxkm2fW6e9QycQ';
const COOKIE_SECRET = 'gma_secure_session_token_58442';

export default async function handler(req) {
  // 1. Verify the secure authentication cookie
  const cookieHeader = req.headers.get('cookie') || '';
  if (!cookieHeader.includes(COOKIE_SECRET)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const url = new URL(req.url);
    const targetUrl = `${SUPABASE_URL}/rest/v1/purchase_orders${url.search}`;

    // Read body for mutating methods — undefined (not null) avoids edge-runtime issues
    let body = undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const text = await req.text();
      if (text) body = text;
    }

    const preferHeader = req.headers.get('Prefer') || 'return=minimal';

    // 2. Forward to Supabase
    const supabaseResp = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': preferHeader
      },
      body
    });

    // 204 No Content = success for PATCH / DELETE — check BEFORE !ok
    if (supabaseResp.status === 204) {
      return new Response(null, { status: 204 });
    }

    // Propagate any other non-ok response as an error
    if (!supabaseResp.ok) {
      const errBody = await supabaseResp.text();
      return new Response(errBody, {
        status: supabaseResp.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await supabaseResp.text();
    return new Response(data, {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal Server Error', detail: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
