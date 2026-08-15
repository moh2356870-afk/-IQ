const express = require("express");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

const SALLA_API_BASE = "https://api.salla.dev/admin/v2";

// الاحتفاظ بالـ raw body للتحقق من توقيع سلة
app.use(
  express.json({
    limit: "2mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  })
);

// تخزين مؤقت للتوكنات أثناء تشغيل السيرفر
const stores = {};

function hideSecret(value) {
  if (!value) return null;

  const text = String(value);

  if (text.length <= 8) {
    return "********";
  }

  return text.slice(0, 4) + "..." + text.slice(-4);
}

// التحقق من توقيع Salla
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

// جلب تفاصيل منتج من Salla
async function getSallaProduct(accessToken, productId) {
  const response = await fetch(
    `${SALLA_API_BASE}/products/${encodeURIComponent(productId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    }
  );

  const text = await response.text();

  let result;

  try {
    result = JSON.parse(text);
  } catch {
    result = {
      raw: text
    };
  }

  if (!response.ok) {
    throw new Error(
      `Salla API ${response.status}: ${JSON.stringify(result)}`
    );
  }

  return result;
}

// الصفحة الرئيسية
app.get("/", (req, res) => {
  res.json({
    app: "Matjar IQ",
    status: "running"
  });
});

// فحص السيرفر
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    app: "Matjar IQ"
  });
});

// Webhook Salla
app.post("/notifications", async (req, res) => {
  try {
    const strategy = req.get("X-Salla-Security-Strategy");

    // التحقق من التوقيع
    if (strategy === "Signature" && !verifySallaSignature(req)) {
      console.log("❌ Invalid Salla webhook signature");

      return res.status(401).json({
        success: false,
        message: "Invalid signature"
      });
    }

    const body = req.body || {};
    const data = body.data || {};

    const event = body.event || "unknown";

    // مهم:
    // Salla ترسل merchant في أعلى مستوى من payload
    const merchantId =
      body.merchant ||
      data.store_id ||
      data.merchant_id ||
      data.store?.id ||
      "unknown";

    console.log("=================================");
    console.log("SALLA WEBHOOK RECEIVED");
    console.log("Event:", event);
    console.log("Merchant:", merchantId);
    console.log("=================================");

    // =========================================
    // تفويض المتجر
    // =========================================

    if (event === "app.store.authorize") {
      const accessToken =
        data.access_token ||
        data.accessToken ||
        null;

      const refreshToken =
        data.refresh_token ||
        data.refreshToken ||
        null;

      const expires =
        data.expires ||
        null;

      const scope =
        data.scope ||
        null;

      const tokenType =
        data.token_type ||
        null;

      if (!accessToken) {
        console.log("⚠️ app.store.authorize وصل بدون Access Token");
      } else {
        stores[String(merchantId)] = {
          accessToken,
          refreshToken,
          expires,
          scope,
          tokenType,
          updatedAt: new Date().toISOString()
        };

        console.log("✅ Store authorization saved");
        console.log("Merchant:", merchantId);
        console.log("Access Token:", hideSecret(accessToken));
        console.log("Refresh Token:", hideSecret(refreshToken));
        console.log("Expires:", expires);
        console.log("Scope:", scope);
      }
    }

    // =========================================
    // تحديث / إنشاء المنتج
    // =========================================

    if (
      event === "product.updated" ||
      event === "product.created" ||
      event === "product.price.updated" ||
      event === "product.status.updated" ||
      event === "product.image.updated" ||
      event === "product.category.updated" ||
      event === "product.brand.updated" ||
      event === "product.tags.updated"
    ) {
      const store = stores[String(merchantId)];

      if (!store || !store.accessToken) {
        console.log(
          "⚠️ No Access Token found for merchant:",
          merchantId
        );
      } else {
        const productId =
          data.id ||
          data.product_id ||
          data.product?.id ||
          null;

        console.log("Product ID:", productId);

        if (!productId) {
          console.log("⚠️ Product ID not found in webhook");
        } else {
          try {
            const productResponse = await getSallaProduct(
              store.accessToken,
              productId
            );

            const product =
              productResponse.data || productResponse;

            console.log("✅ Product fetched from Salla");
            console.log("Product ID:", product.id);
            console.log("Product Name:", product.name);

            console.log(
              "Product Price:",
              product.price?.amount,
              product.price?.currency
            );

            console.log(
              "Product SKU:",
              product.sku || null
            );

            console.log(
              "Product Quantity:",
              product.quantity
            );
          } catch (error) {
            console.log("❌ Failed to fetch product");
            console.log(error.message);
          }
        }
      }
    }

    return res.status(200).json({
      success: true
    });

  } catch (error) {
    console.log("❌ Webhook processing error");
    console.log(error.message);

    return res.status(500).json({
      success: false,
      message: "Webhook processing error"
    });
  }
});

app.listen(PORT, () => {
  console.log(`Matjar IQ is running on port ${PORT}`);
});
