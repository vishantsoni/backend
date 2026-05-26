function extractOrderId(text) {
  // Matches common patterns: ORD-2024-1001, order: ORD-...
  const m = /\border\s*(?:id)?\s*[:#-]?\s*([A-Za-z0-9-]{4,})/i.exec(text);
  if (m && m[1]) return m[1];

  // Or standalone order-like token
  const t = /\b([A-Za-z]{2,}[0-9][A-Za-z0-9-]{3,})\b/.exec(text);
  return t ? t[1] : null;
}

function classifyIntent({ context, userMessage }) {
  const text = (userMessage || "").toLowerCase();

  if (context.role === "ECOM_USER") {
    const orderId = extractOrderId(userMessage);

    if (/(track|tracking|where is|status|delivery)/.test(text)) {
      return {
        toolName: orderId ? "trackOrder" : "getOrderStatus",
        params: { orderId },
      };
    }

    if (/(address|delivery address|my address)/.test(text)) {
      return { toolName: "getMyAddresses", params: {} };
    }

    if (/(wishlist|save for later)/.test(text)) {
      return { toolName: "getMyWishlist", params: {} };
    }

    return { toolName: "getOrderStatus", params: { orderId } };
  }

  if (context.role === "DISTRIBUTOR") {
    if (/(wallet|balance|pending|company fund)/.test(text)) {
      return { toolName: "getWalletBalance", params: {} };
    }

    if (/(downline|team count|my team|binary)/.test(text)) {
      return { toolName: "getDownlineCount", params: {} };
    }

    if (/(commission|earnings|income|ref bonus|latest)/.test(text)) {
      return { toolName: "getLatestCommissions", params: {} };
    }

    // default
    return { toolName: "getWalletBalance", params: {} };
  }

  return { toolName: null, params: {} };
}

module.exports = { classifyIntent };
