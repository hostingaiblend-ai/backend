// index.js
const express = require("express");
const Razorpay = require("razorpay");
const cors = require("cors");
const crypto = require("crypto");
const admin = require("firebase-admin");
require("dotenv").config();

// Initialize Express
const app = express();
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ✅ Create Razorpay order
app.post("/payment/create-order", async (req, res) => {
  try {
    const { amount, currency = "INR", userId } = req.body;

    const order = await razorpay.orders.create({
      amount: amount * 100, // amount in paise
      currency,
      receipt: `receipt_${Date.now()}`,
    });

    // Log order in Firestore
    await db.collection("payments").add({
      userId,
      orderId: order.id,
      amount,
      currency,
      status: "created",
      createdAt: new Date(),
    });

    res.json({ success: true, order });
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ Verify Razorpay payment
app.post("/payment/verify", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      userId,
    } = req.body;

    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generatedSignature === razorpay_signature) {
      // Update user’s Pro status
      await db.collection("users").doc(userId).set(
        {
          proStatus: true,
          lastPaymentId: razorpay_payment_id,
          upgradedAt: new Date(),
        },
        { merge: true }
      );

      res.json({
        success: true,
        message: "Payment verified successfully. User upgraded to Pro.",
      });
    } else {
      res.status(400).json({ success: false, message: "Invalid signature" });
    }
  } catch (err) {
    console.error("Verify error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ Test route
app.get("/", (req, res) => {
  res.send("🚀 AIBlend Razorpay backend is live and running!");
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
