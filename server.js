const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "2mb" }));

// تخزين مؤقت أثناء تشغيل السيرفر
const stores = {};

function hideSecret(value) {
  if (!value) return null;

  const text = String(value);

  if (text.length <= 8) {
    return "********";
  }

  return text.slice(0, 4) + "..." + text.slice(-4);
}

// الصفحة الرئيسية
app.get("/", (req, res) => {
  res.json({
    app: "Matjar IQ",
    status: "running"
  });
});

// فحص حالة السيرفر
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    app: "Matjar IQ"
  });
});

// استقبال تنبيهات سلة
app.post("/notifications", (req, res) => {
  const body = req.body || {};

  console.log("=================================");
  console.log("SALLA WEBHOOK RECEIVED");
  console.log("Event:", body.event || body.event_name || "unknown");
  console.log("Data:", JSON.stringify(body, null, 2));
  console.log("=================================");

  const data = body.data || body;

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

// رابط إعادة التوجيه
app.get("/callback", (req, res) => {
  res.json({
    success: true,
    message: "Matjar IQ callback received"
  });
});

// تشغيل السيرفر
app.listen(PORT, () => {
  console.log(`Matjar IQ is running on port ${PORT}`);
});
