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
    notes: {
      my_database_order_id: req.body.order_id, // Or myDbOrder._id / myDbOrder.id
    },
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

exports.VerifyPaymentFunc = async (
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature,
) => {
  const sign = razorpay_order_id + "|" + razorpay_payment_id;
  const expectedSign = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(sign.toString())
    .digest("hex");

  return razorpay_signature === expectedSign;
};

exports.razorpayWebhook = async (req, res) => {
  console.log("\n--------- Received Razorpay Webhook:", req.body);
  // 1. The secret you set in Razorpay Dashboard -> Settings -> Webhooks
  const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

  // 2. Razorpay sends the signature in this header
  const signature = req.headers["x-razorpay-signature"];

  if (!signature) {
    return res
      .status(400)
      .json({ status: false, message: "Missing signature" });
  }

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
      // 3. Get the Payment ID (e.g., "pay_NklSdf839xjd")
      const paymentId = paymentData.id;
      const orderId = paymentData.order_id;
      const myCustomDbOrderId = paymentData.notes.my_database_order_id;

      // UPDATE YOUR DATABASE HERE
      await db.query(
        "UPDATE orders SET payment_status = 'paid', total_bv_points = $2 WHERE order_id = $1",
        [myCustomDbOrderId, `paymentId : ${paymentId} | orderId : ${orderId}`],
      );
      console.log(`Order ${myCustomDbOrderId} marked as paid.`);

      // add a transaction record
      // await db.query(
      //   `INSERT INTO transactions (user_id, amount, type, category, source_user_id, order_id, remarks, status)
      //   VALUES ($1, $2, 'credit', 'purchase', $3, $4, 'Razorpay Payment for purchase order - ${orderId} / ${myCustomDbOrderId}', 'completed')`,
      //   [
      //     paymentData.notes.user_id,
      //     paymentData.amount / 100,
      //     paymentData.notes.user_id,
      //     myCustomDbOrderId,
      //   ],
      // );
      // console.log(`Transaction record created for order ${myCustomDbOrderId}.`);
    }

    // Always respond with 200 OK to Razorpay
    res.status(200).json({ status: "ok" });
  } else {
    // If signature doesn't match, someone else is trying to call your API
    res.status(400).send("Invalid signature");
  }
};
