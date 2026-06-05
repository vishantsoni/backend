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

// exports.razorpayWebhook = async (req, res) => {
//   console.log("\n--------- Received Razorpay Webhook:", req.body);
//   // 1. The secret you set in Razorpay Dashboard -> Settings -> Webhooks
//   const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;
//   console.log("Headers:", req.headers, "webhook secret:", WEBHOOK_SECRET);

//   // 2. Razorpay sends the signature in this header
//   const signature = req.headers["x-razorpay-signature"];

//   if (!signature) {
//     return res
//       .status(400)
//       .json({ status: false, message: "Missing signature" });
//   }

//   // 3. Verify the signature
//   const shasum = crypto.createHmac("sha256", WEBHOOK_SECRET);
//   shasum.update(JSON.stringify(req.body));
//   const digest = shasum.digest("hex");

//   if (signature === digest) {
//     console.log("Webhook Verified!");
//     const event = req.body.event;

//     // 4. Handle specific events
//     if (event === "payment.captured") {
//       const paymentData = req.body.payload.payment.entity;
//       // 3. Get the Payment ID (e.g., "pay_NklSdf839xjd")
//       const paymentId = paymentData.id;
//       const orderId = paymentData.order_id;
//       const myCustomDbOrderId = paymentData.notes.my_database_order_id;

//       // UPDATE YOUR DATABASE HERE
//       await db.query(
//         "UPDATE orders SET payment_status = 'paid', total_bv_points = $2 WHERE order_id = $1",
//         [myCustomDbOrderId, `paymentId : ${paymentId} | orderId : ${orderId}`],
//       );
//       console.log(`Order ${myCustomDbOrderId} marked as paid.`);

//       // add a transaction record
//       // await db.query(
//       //   `INSERT INTO transactions (user_id, amount, type, category, source_user_id, order_id, remarks, status)
//       //   VALUES ($1, $2, 'credit', 'purchase', $3, $4, 'Razorpay Payment for purchase order - ${orderId} / ${myCustomDbOrderId}', 'completed')`,
//       //   [
//       //     paymentData.notes.user_id,
//       //     paymentData.amount / 100,
//       //     paymentData.notes.user_id,
//       //     myCustomDbOrderId,
//       //   ],
//       // );
//       // console.log(`Transaction record created for order ${myCustomDbOrderId}.`);
//     }

//     // Always respond with 200 OK to Razorpay
//     res.status(200).json({ status: "ok" });
//   } else {
//     // If signature doesn't match, someone else is trying to call your API
//     res.status(400).send("Invalid signature");
//   }
// };

exports.razorpayWebhook = async (req, res) => {
  console.log("\n=======================================================");
  console.log("📥 NEW RAZORPAY WEBHOOK RECEIVED AT:", new Date().toISOString());
  console.log("=======================================================");

  // 1. Full payload aur headers ko deep-print karein taaki [Object] na dikhe
  console.log("\n[DEBUG] Full Headers Received:");
  console.dir(req.headers, { depth: null, colors: true });

  console.log("\n[DEBUG] Full Request Body Received:");
  console.dir(req.body, { depth: null, colors: true });

  const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers["x-razorpay-signature"];

  console.log(`\n[DEBUG] Configured Webhook Secret: "${WEBHOOK_SECRET}"`);
  console.log(`[DEBUG] Received X-Razorpay-Signature: "${signature}"`);

  if (!signature) {
    console.error(
      "❌ [ERROR] Webhook verification failed: Missing 'x-razorpay-signature' header.",
    );
    return res
      .status(400)
      .json({ status: false, message: "Missing signature" });
  }

  try {
    // 2. Signature Validation Details
    const shasum = crypto.createHmac("sha256", WEBHOOK_SECRET);

    // Razorpay signature raw request body bytes par based hoti hai.
    // express.raw middleware se req.body ek Buffer hota hai.
    // JSON.stringify(req.body) mat karo, warna bytes change ho jaate hain.
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body));
    shasum.update(rawBody);
    const digest = shasum.digest("hex");

    console.log(`[DEBUG] Generated Local Digest:       "${digest}"`);

    if (signature === digest) {
      console.log("✅ [SUCCESS] Webhook Signature Verified Successfully!");

      const event = req.body.event;
      console.log(`[DEBUG] Handling Event Type: ${event}`);

      if (event === "payment.captured") {
        const paymentData = req.body.payload?.payment?.entity;

        if (!paymentData) {
          console.error(
            "❌ [ERROR] Malformed webhook payload. 'payload.payment.entity' is missing.",
          );
          return res
            .status(400)
            .json({ status: false, message: "Invalid payload structure" });
        }

        const paymentId = paymentData.id;
        const orderId = paymentData.order_id;
        const myCustomDbOrderId = paymentData.notes?.my_database_order_id;
        const userId = paymentData.notes?.user_id;

        console.log("\n[DEBUG] Extracted Payment Variables:");
        console.log(`   - Razorpay Payment ID:  ${paymentId}`);
        console.log(`   - Razorpay Order ID:    ${orderId}`);
        console.log(`   - Your DB Order ID:     ${myCustomDbOrderId}`);
        console.log(`   - User ID from notes:   ${userId}`);

        if (!myCustomDbOrderId) {
          console.warn(
            "⚠️ [WARN] 'my_database_order_id' missing from notes! DB update might fail.",
          );
        }

        // DATABASE UPDATE 1: Order Status
        console.log(
          `[DB] Attempting to update order ${myCustomDbOrderId} status to 'paid'...`,
        );
        await db.query(
          "UPDATE orders SET payment_status = 'paid', total_bv_points = $2 WHERE order_id = $1",
          [
            myCustomDbOrderId,
            `paymentId : ${paymentId} | orderId : ${orderId}`,
          ],
        );
        console.log(
          `✅ [DB SUCCESS] Order ${myCustomDbOrderId} successfully marked as paid.`,
        );

        // DATABASE UPDATE 2: Transaction Record (If uncommented later)
        /*
        console.log(`[DB] Attempting to create transaction entry for User: ${userId}...`);
        await db.query(
          `INSERT INTO transactions (user_id, amount, type, category, source_user_id, order_id, remarks, status)
          VALUES ($1, $2, 'credit', 'purchase', $3, $4, 'Razorpay Payment for purchase order - ${orderId} / ${myCustomDbOrderId}', 'completed')`,
          [
            userId,
            paymentData.amount / 100,
            userId,
            myCustomDbOrderId,
          ],
        );
        console.log(`✅ [DB SUCCESS] Transaction record created.`);
        */
      } else {
        console.log(
          `ℹ️ [INFO] Received event "${event}", no database handling defined for this event.`,
        );
      }

      // Always respond with 200 OK to Razorpay
      return res.status(200).json({ status: "ok" });
    } else {
      console.error(
        "❌ [ERROR] Signature Mismatch! Calculated digest does not match incoming header.",
      );
      return res.status(400).send("Invalid signature");
    }
  } catch (error) {
    // Ye block pure webhook ko crash hone se bachayega agar DB error aata hai
    console.error(
      "💥 [CRITICAL ERROR] Exception caught inside webhook handler:",
      error,
    );
    return res.status(500).json({ status: false, error: error.message });
  }
};
