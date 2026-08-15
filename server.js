const express = require("express");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// نخلي Express يحتفظ بالطلب الخام حتى نتحقق من توقيع سلة
app.use(
  express.json({
    limit: "2mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  })
);

const stores = {};

function hideSecret(value) {
  if (!value) return null;

  const text = String(value);

  if (text.length <= 8) {
    return "********";
  }

  return text.slice(0, 4) + "..." + text.slice(-4);
}

function verifySallaSignature(req) {
  const secret = process.env.SALLA_WEBHOOK_SECRET;
  const signature = req.get("X-Salla-Signature");

  if (!secret || !signature || !req.rawBody) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(req.rawBody)
    .digest("hex");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);

  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(a, b);
}

app.get("/", (req, res) => {
  res.json({
    app: "Matjar IQ",
    status: "running"
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    app: "Matjar IQ"
  });
});

app.post("/notifications", (req, res) => {
  const strategy = req.get("X-Salla-Security-Strategy");

  if (strategy === "Signature" && !verifySallaSignature(req)) {
    console.log("❌ Invalid Salla webhook signature");
    return res.status(401).json({
      success: false,
      message: "Invalid signature"
    });
  }

  const body = req.body || {};
  const data = body.data || body;

  console.log("=================================");
  console.log("SALLA WEBHOOK RECEIVED");
  console.log("Event:", body.event || "unknown");
  console.log("=================================");

  const storeId =
    data.store_id ||
    data.merchant_id ||
    data.store?.id ||
    "unknown";

  const accessToken =
    data.access_token ||
    data.accessToken ||
    null;

  const refreshToken =
    data.refresh_token ||
    data.refreshToken ||
    null;

  if (accessToken || refreshToken) {
    stores[String(storeId)] = {
      accessToken,
      refreshToken,
      updatedAt: new Date().toISOString()
    };

    console.log("Store:", storeId);
    console.log("Access Token:", hideSecret(accessToken));
    console.log("Refresh Token:", hideSecret(refreshToken));
  }

  res.status(200).json({
    success: true
  });
});

app.listen(PORT, () => {
  console.log(`Matjar IQ is running on port ${PORT}`);
});
