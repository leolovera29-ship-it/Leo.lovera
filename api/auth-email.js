const crypto = require("crypto");

function signToken(email, secret) {
  return crypto.createHmac("sha256", secret).update(email).digest("hex");
}

async function sendApprovalEmail({ email, req, env }) {
  const { RESEND_API_KEY, APPROVE_SECRET, ADMIN_EMAIL, APP_URL } = env;
  const token = signToken(email, APPROVE_SECRET);
  const baseUrl = APP_URL || `https://${req.headers.host}`;
  const approveUrl = `${baseUrl}/api/approve?email=${encodeURIComponent(email)}&token=${token}`;
  const adminEmail = ADMIN_EMAIL || "leolovera29@gmail.com";

  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Circuitos <onboarding@resend.dev>",
      to: adminEmail,
      subject: `Nuevo registro en Circuitos: ${email}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Nuevo registro en Circuitos</h2>
          <p>Se registró: <b>${email}</b></p>
          <p>
            <a href="${approveUrl}" style="background:#ff5a1f; color:#0c0b0a; padding:14px 24px; text-decoration:none; font-weight:bold; display:inline-block; border-radius:4px;">
              Aprobar usuario
            </a>
          </p>
          <p style="color:#888; font-size:12px;">Si no reconocés este registro, ignorá este mail.</p>
        </div>
      `,
    }),
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { email, resend } = req.body || {};
    if (!email) {
      res.status(400).json({ error: "Missing email" });
      return;
    }

    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, APPROVE_SECRET } = process.env;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY || !APPROVE_SECRET) {
      res.status(500).json({ error: "Server not configured" });
      return;
    }

    const dbHeaders = {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    };

    const lookupResp = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=approved`,
      { headers: dbHeaders }
    );
    if (!lookupResp.ok) {
      const errText = await lookupResp.text();
      res.status(502).json({ error: "No se pudo consultar el registro", detail: errText });
      return;
    }
    const rows = await lookupResp.json();

    if (rows.length > 0) {
      const approved = !!rows[0].approved;

      if (resend && !approved) {
        const emailResp = await sendApprovalEmail({ email, req, env: process.env });
        if (!emailResp.ok) {
          const errText = await emailResp.text();
          res.status(502).json({ error: "Failed to resend email", detail: errText });
          return;
        }
        res.status(200).json({ approved: false, resent: true });
        return;
      }

      res.status(200).json({ approved });
      return;
    }

    const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
      method: "POST",
      headers: { ...dbHeaders, Prefer: "return=minimal" },
      body: JSON.stringify({ email, approved: false }),
    });
    if (!insertResp.ok) {
      const errText = await insertResp.text();
      res.status(502).json({ error: "No se pudo registrar el email", detail: errText });
      return;
    }

    const emailResp = await sendApprovalEmail({ email, req, env: process.env });
    if (!emailResp.ok) {
      const errText = await emailResp.text();
      res.status(502).json({ error: "Failed to send email", detail: errText });
      return;
    }

    res.status(200).json({ approved: false, pending: true });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unexpected error" });
  }
};
