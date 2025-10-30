const express = require("express");
const Razorpay = require("razorpay");
const admin = require("firebase-admin");
const cors = require("cors");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});
const db = admin.firestore();

// ✅ Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ✅ Create Razorpay order
app.post("/payment/create-order", async (req, res) => {
  try {
    const { amount, userId } = req.body;

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: "receipt_" + Date.now(),
      notes: { userId },
    });

    await db.collection("payments").add({
      userId,
      orderId: order.id,
      amount,
      status: "created",
      createdAt: new Date(),
    });

    res.json({ success: true, order });
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ Webhook for Razorpay verification
app.post("/payment/verify", async (req, res) => {
  try {
    const webhookSignature = req.headers["x-razorpay-signature"];
    const expectedSignature = crypto
      .createHmac("sha256", process.env.WEBHOOK_SECRET)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (webhookSignature !== expectedSignature) {
      return res.status(400).json({ success: false, message: "Invalid webhook signature" });
    }

    const payment = req.body.payload?.payment?.entity;
    if (payment && payment.status === "captured") {
      const userId = payment.notes?.userId;
      if (userId) {
        await db.collection("users").doc(userId).set({ proStatus: true }, { merge: true });
        await db.collection("payments").doc(payment.id).set(payment);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ Root route for test
app.get("/", (req, res) => {
  res.send("🚀 AIBlend Razorpay backend is live and running!");
});

// ✅ Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
