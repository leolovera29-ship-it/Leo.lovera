const crypto = require("crypto");

function signToken(uid, secret) {
  return crypto.createHmac("sha256", secret).update(uid).digest("hex");
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { email, uid } = req.body || {};
    if (!email || !uid) {
      res.status(400).json({ error: "Missing email or uid" });
      return;
    }

    const { RESEND_API_KEY, APPROVE_SECRET, ADMIN_EMAIL, APP_URL } = process.env;
    if (!RESEND_API_KEY || !APPROVE_SECRET) {
      res.status(500).json({ error: "Server not configured" });
      return;
    }

    const token = signToken(uid, APPROVE_SECRET);
    const baseUrl = APP_URL || `https://${req.headers.host}`;
    const approveUrl = `${baseUrl}/api/approve?uid=${encodeURIComponent(uid)}&token=${token}`;
    const adminEmail = ADMIN_EMAIL || "leolovera29@gmail.com";

    const emailResp = await fetch("https://api.resend.com/emails", {
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

    if (!emailResp.ok) {
      const errText = await emailResp.text();
      res.status(502).json({ error: "Failed to send email", detail: errText });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unexpected error" });
  }
};
