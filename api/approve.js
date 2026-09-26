const crypto = require("crypto");

function signToken(email, secret) {
  return crypto.createHmac("sha256", secret).update(email).digest("hex");
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a || "", "utf8");
  const bufB = Buffer.from(b || "", "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function page(title, message, ok) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  body{background:#0c0b0a;color:#f3ede0;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
  .box{text-align:center;padding:40px;border:1px solid #3a332c;max-width:420px;}
  h1{color:${ok ? "#7fae52" : "#c9482f"};font-size:22px;}
  p{color:#c9c0ac;}
</style>
</head>
<body>
  <div class="box">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

module.exports = async (req, res) => {
  try {
    const { email, token } = req.query || {};
    const { APPROVE_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, APP_URL } = process.env;

    if (!email || !token) {
      res.status(400).setHeader("Content-Type", "text/html").send(page("Falta información", "El link no incluye los datos necesarios.", false));
      return;
    }

    if (!APPROVE_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      res.status(500).setHeader("Content-Type", "text/html").send(page("Error de configuración", "El servidor no tiene las variables de entorno configuradas.", false));
      return;
    }

    const expected = signToken(email, APPROVE_SECRET);
    if (!timingSafeEqual(token, expected)) {
      res.status(403).setHeader("Content-Type", "text/html").send(page("Link inválido", "Este link de aprobación no es válido.", false));
      return;
    }

    const updateResp = await fetch(`${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ approved: true }),
    });

    if (!updateResp.ok) {
      const errText = await updateResp.text();
      res.status(502).setHeader("Content-Type", "text/html").send(page("Error al aprobar", `No se pudo actualizar el usuario: ${errText}`, false));
      return;
    }

    if (RESEND_API_KEY) {
      const baseUrl = APP_URL || `https://${req.headers.host}`;
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Circuitos <onboarding@resend.dev>",
            to: email,
            subject: "Tu cuenta en Circuitos ya fue aprobada",
            html: `
              <div style="font-family: Arial, sans-serif; padding: 20px;">
                <h2>¡Tu cuenta ya está aprobada!</h2>
                <p>Ya podés entrar a Circuitos con tu email <b>${email}</b>.</p>
                <p>
                  <a href="${baseUrl}" style="background:#ff5a1f; color:#0c0b0a; padding:14px 24px; text-decoration:none; font-weight:bold; display:inline-block; border-radius:4px;">
                    Entrar a Circuitos
                  </a>
                </p>
              </div>
            `,
          }),
        });
      } catch (emailErr) {
        console.error("No se pudo notificar al usuario aprobado:", emailErr);
      }
    }

    res.status(200).setHeader("Content-Type", "text/html").send(page("Usuario aprobado ✅", "Ya puede iniciar sesión en Circuitos con normalidad.", true));
  } catch (err) {
    res.status(500).setHeader("Content-Type", "text/html").send(page("Error", err.message || "Ocurrió un error inesperado.", false));
  }
};
