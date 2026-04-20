const Razorpay = require("razorpay");
const crypto = require("crypto");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Step 1: Create Order
exports.createOrder = async (req, res) => {
  const options = {
    amount: req.body.amount * 100, // Amount in paise (e.g., 500 INR = 50000)
    currency: "INR",
    receipt: `receipt_${Date.now()}`,
  };

  try {
    const order = await razorpay.orders.create(options);

    if (order.status === "created") {
      res.json({ status: true, order: order }); // Sends order_id to frontend
    } else {
      res.json({ status: false, errors: order });
    }
  } catch (err) {
    res.status(500).send(err);
  }
};

// Step 2: Verify Payment
exports.verifyPayment = async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
    req.body;

  const sign = razorpay_order_id + "|" + razorpay_payment_id;
  const expectedSign = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(sign.toString())
    .digest("hex");

  if (razorpay_signature === expectedSign) {
    // Payment is authentic - Update your DB here
    return res.status(200).json({ success: true, message: "Payment verified" });
  } else {
    return res
      .status(400)
      .json({ success: false, message: "Invalid signature" });
  }
};

exports.razorpayWebhook = async (req, res) => {
  // 1. The secret you set in Razorpay Dashboard -> Settings -> Webhooks
  const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

  // 2. Razorpay sends the signature in this header
  const signature = req.headers["x-razorpay-signature"];

  // 3. Verify the signature
  const shasum = crypto.createHmac("sha256", WEBHOOK_SECRET);
  shasum.update(JSON.stringify(req.body));
  const digest = shasum.digest("hex");

  if (signature === digest) {
    console.log("Webhook Verified!");
    const event = req.body.event;

    // 4. Handle specific events
    if (event === "payment.captured") {
      const paymentData = req.body.payload.payment.entity;
      const orderId = paymentData.order_id;

      // UPDATE YOUR DATABASE HERE
      // await db.query("UPDATE orders SET status = 'paid' WHERE razorpay_order_id = $1", [orderId]);
    }

    // Always respond with 200 OK to Razorpay
    res.status(200).json({ status: "ok" });
  } else {
    // If signature doesn't match, someone else is trying to call your API
    res.status(400).send("Invalid signature");
  }
};
