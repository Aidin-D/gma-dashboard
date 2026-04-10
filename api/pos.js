export const config = {
  runtime: 'edge', // Edge functions are faster (Vercel)
};

// Hidden from the browser/frontend!
const SUPABASE_URL = 'https://hettdkznujeabmckkvni.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhldHRka3pudWplYWJtY2trdm5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzMyNjksImV4cCI6MjA5MTE0OTI2OX0.byriabl_RZcELa6gnla6j5LZT7r6DFxkm2fW6e9QycQ';
const COOKIE_SECRET = 'gma_secure_session_token_58442';

export default async function handler(req) {
  // 1. Verify the secure authentication cookie
  const cookieHeader = req.headers.get('cookie') || '';
  if (!cookieHeader.includes(COOKIE_SECRET)) {
    return new Response(JSON.stringify({ error: 'Unauthorized: missing or invalid secure cookie' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Determine target URL for Supabase based on querystring or path
    // We expect the frontend to pass the target query parameters as ?q=...
    const url = new URL(req.url);
    const query = url.searchParams.get('q') || '?select=*&order=order_date.desc';
    const targetUrl = `${SUPABASE_URL}/rest/v1/purchase_orders${query}`;

    // Pass the body along if it exists (for POST/PATCH)
    let body = null;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = await req.text();
    }

    const preferHeader = req.headers.get('Prefer') || 'return=minimal';

    // 2. Perform server-to-server request to Supabase
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

    if (!supabaseResp.ok) {
      if (supabaseResp.status === 204) {
        return new Response('', { status: 204 });
      }
      return new Response(await supabaseResp.text(), { 
        status: supabaseResp.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Return 204 No Content if valid
    if (supabaseResp.status === 204) {
      return new Response(null, { status: 204 });
    }

    const data = await supabaseResp.text();
    return new Response(data, {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
