function formatAssistantResponse({ context, intent, data, forbidden }) {
  // Refund flow / delivery tracking policy
  const text = (intent?.rawUserMessage || "").toLowerCase?.() || "";
  if (context.role === "ECOM_USER" && /refund/.test(text)) {
    return "Refund flow is not available yet.";
  }
  if (
    context.role === "ECOM_USER" &&
    /(delivery|track)/.test(text) &&
    !data?.order
  ) {
    return "I can only share order status right now (delivery tracking events are not available yet).";
  }

  if (forbidden) {
    return "You are not allowed to access that information.";
  }

  if (context.role === "ECOM_USER") {
    if (
      intent.toolName === "trackOrder" ||
      intent.toolName === "getOrderStatus"
    ) {
      const order = data?.order;
      if (!order)
        return "Order not found or not accessible. Please check your order ID.";
      return `Order ${order.order_id} is currently '${order.order_status}'. Payment: '${order.payment_status}'.`;
    }

    if (intent.toolName === "getMyAddresses") {
      const rows = Array.isArray(data) ? data : [];
      if (rows.length === 0) return "You have no saved addresses.";
      return `You have ${rows.length} saved address(es).`;
    }

    if (intent.toolName === "getMyWishlist") {
      const rows = Array.isArray(data) ? data : [];
      if (rows.length === 0) return "Your wishlist is empty.";
      return `Your wishlist has ${rows.length} item(s).`;
    }
  }

  if (context.role === "DISTRIBUTOR") {
    if (intent.toolName === "getWalletBalance") {
      if (!data) return "Wallet not found.";
      return `Wallet balance: ${data.total_amount}. Pending: ${data.pending_amount}.`;
    }

    if (intent.toolName === "getDownlineCount") {
      return `Your downline count is ${data.downlineCount}.`;
    }

    if (intent.toolName === "getLatestCommissions") {
      const rows = Array.isArray(data) ? data : [];
      if (rows.length === 0) return "No commission transactions found yet.";
      return `Latest commission entries (showing ${rows.length}): ready to display.`;
    }
  }

  return "I can help with order status (E-commerce) or wallet/commissions (Distributors).";
}

module.exports = { formatAssistantResponse };
