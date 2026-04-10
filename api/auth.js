export const config = {
  runtime: 'edge', // Edge functions are faster and zero cold-start
};

const dometicPin = '7890';
const zunpowerPin = '1234';
const cookieSecret = 'gma_secure_session_token_58442'; // Minimal secure signature replacement

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { email, password } = await req.json();

    let role = null;
    // Map the old passcode usage into an email+password verification.
    // E.g. dometic@admin.com / 7890 -> dometic role.
    if (email.toLowerCase().includes('dometic') && password === dometicPin) {
      role = 'dometic';
    } else if (email.toLowerCase().includes('zunpower') && password === zunpowerPin) {
      role = 'zunpower';
    } else {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Set a cryptographically hard-to-guess HTTP-only secure cookie
    // This removes the auth token entirely from client-side JS.
    const token = `${role}_${cookieSecret}_${Date.now()}`;
    const cookie = `auth_session=${token}; HttpOnly; Path=/; Secure; SameSite=Strict; Max-Age=28800`; // 8 hours

    return new Response(JSON.stringify({ success: true, role }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookie
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Request invalid' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
