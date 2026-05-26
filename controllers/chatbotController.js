const { runChatbotAgent } = require("../services/chatbot/runChatbotAgent");

async function chatbotMessage(req, res) {
  try {
    const userMessage = req.body?.message;
    if (!userMessage || typeof userMessage !== "string") {
      return res.status(400).json({ message: "message is required" });
    }

    // authMiddleware verifies JWT from x-auth-token and sets req.user.
    // req.user typically includes: { id, role, kyc_status, ... }
    const jwtUser = req.user || {};
    const role = jwtUser.role;
    const userId = jwtUser.id;

    if (!role || typeof userId === "undefined" || userId === null) {
      return res
        .status(401)
        .json({ message: "Unauthorized", error: { role, userId } });
    }

    // IMPORTANT:
    // This chatbot endpoint uses the distributor JWT authMiddleware.
    // E-commerce users normally authenticate via ecomAuth (Authorization: Bearer ...).
    // If you want a combined endpoint for ecom JWT too, create a separate route with ecomAuth.

    let context;

    if (role === "Distributor") {
      context = { role: "DISTRIBUTOR", distributorId: Number(userId) };
    } else if (role === "admin" || role === "super_admin") {
      // Safety: admins get MLM tools only.
      context = { role: "DISTRIBUTOR", distributorId: Number(userId) };
    } else if (role === "ECOM_USER" || role === "ecom_user") {
      // Only works if your x-auth-token JWT for ecom users is compatible.
      context = { role: "ECOM_USER", ecomUserId: String(userId) };
    } else {
      return res.status(403).json({ message: "Forbidden role" });
    }

    const result = await runChatbotAgent({ context, userMessage });
    return res.json({ ...result, status: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Chatbot error" });
  }
}

module.exports = { chatbotMessage };
