# Chatbot Integration (Frontend)

This document explains how to connect your frontend UI to the backend chatbot API in **mlm-project-feel**.

---

## 1) What the backend provides

### Endpoint

- **POST** `/api/chatbot/message`

### Purpose

The backend chatbot classifies the user’s message (very lightweight intent rules) and calls an internal “tool” set depending on the authenticated user role:

- **E-commerce user** (`role: ECOM_USER` / `ecom_user`):
  - `trackOrder`
  - `getOrderStatus`
  - `getMyAddresses`
  - `getMyWishlist`
- **Distributor** (`role: Distributor`):
  - `getWalletBalance`
  - `getDownlineCount`
  - `getLatestCommissions`

The endpoint returns a JSON payload containing:

- `reply` (assistant text)
- `intent` (classified intent object)
- `data` (tool result or additional info)

---

## 2) Authentication (required)

The chatbot route uses `authMiddleware`, which expects a JWT in the header:

### Header

- `x-auth-token: <JWT>

### JWT expectations

`authMiddleware` verifies the JWT using `process.env.JWT_SECRET` and sets:

- `req.user.id`
- `req.user.role`
- also checks `req.user.kyc_status === true`

If `kyc_status !== true`, the backend responds with HTTP **202** and `{ status: false, message: "KYC not completed" }`.

> Note: The chatbot controller currently builds its internal context differently based on `req.user.role`:
>
> - `Distributor` -> `{ role: "DISTRIBUTOR", distributorId: Number(userId) }`
> - `admin` / `super_admin` -> treated as `DISTRIBUTOR`
> - `ECOM_USER` / `ecom_user` -> `{ role: "ECOM_USER", ecomUserId: String(userId) }`

So your frontend must send the correct JWT for the correct user type.

---

## 3) Request format

### Body

Send JSON with the user message:

```json
{
  "message": "Where is my order ORD-2024-1001?"
}
```

### Full example (curl)

```bash
curl -X POST http://localhost:5000/api/chatbot/message \
  -H "Content-Type: application/json" \
  -H "x-auth-token: YOUR_JWT_HERE" \
  -d "{\"message\":\"Where is my order ORD-2024-1001?\"}"
```

---

## 4) Response format

### Success (HTTP 200)

Typical response:

```json
{
  "reply": "Order ORD-2024-1001 is currently 'Delivered'. Payment: 'Paid'.",
  "intent": {
    "toolName": "trackOrder",
    "params": { "orderId": "ORD-2024-1001" }
  },
  "data": {
    "order": { "order_id": "ORD-2024-1001", "order_status": "Delivered" },
    "items": [],
    "payment": null
  }
}
```

### Common error cases

- **400** `{ message: "message is required" }`

  - You did not provide `message` or it wasn’t a string.

- **401** `{ message: "No token, authorization denied" }` or `{ message: "Unauthorized" }`

  - Missing/invalid JWT.

- **202** `{ status: false, message: "KYC not completed" }`

  - JWT is valid but KYC is not complete.

- **403** `{ message: "Forbidden role" }`

  - `req.user.role` doesn’t match supported roles.

- **500** `{ message: "Chatbot error" }`
  - Unexpected runtime error.

---

## 5) Frontend integration steps

### Step A — Create a chat UI

- Maintain a local state array like:
  - `[{ role: "user"|"assistant", text: string, timestamp }]`

### Step B — On send, call the API

1. Validate input (`message` not empty)
2. Attach JWT header `x-auth-token`
3. POST `/api/chatbot/message`
4. Append user message to chat history
5. Append `reply` from API to chat history

### Step C — Handle KYC response (HTTP 202)

If you receive status **202**:

- Display message from server.
- Disable further chat requests until the user completes KYC.

---

## 6) API endpoints (for frontend)

### Chatbot

- **POST** `/api/chatbot/message`
  - Auth header: `x-auth-token: <JWT>`
  - Body: `{ "message": "..." }`
  - Response: `{ reply, intent, data }`

### Notes for `ecom_user` vs `Distributor`

- The chatbot endpoint uses the same route but behavior depends on `req.user.role` inside `authMiddleware`.
- For `ecom_user` tokens, backend context is set to:
  - `{ role: "ECOM_USER", ecomUserId: String(req.user.id) }`
- For distributor/admin tokens, backend context is set to:
  - `{ role: "DISTRIBUTOR", distributorId: Number(req.user.id) }`

Supported chatbot tools for **ecom_user** (intent → tool → data):

- `trackOrder` → `data.order + data.items + data.payment`
- `getOrderStatus` → `data.order`
- `getMyAddresses` → `data` (array of addresses)
- `getMyWishlist` → `data` (array of wishlist rows)

---

## 7) Reference frontend code

### JavaScript (fetch)

```js
async function sendChatMessage({ message, jwt, baseUrl }) {
  const res = await fetch(`${baseUrl}/api/chatbot/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-auth-token": jwt,
    },
    body: JSON.stringify({ message }),
  });

  // Handle special 202 flow
  if (res.status === 202) {
    const data = await res.json();
    throw new Error(data.message || "KYC not completed");
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Chatbot request failed: ${res.status}`);
  }

  return res.json();
}
```

### Example usage

```js
try {
  const payload = await sendChatMessage({
    message: "Track my order ORD-2024-1001",
    jwt: userToken,
    baseUrl: "http://localhost:5000",
  });

  // payload.reply is the assistant text
  console.log(payload.reply);
} catch (e) {
  console.error(e.message);
}
```

---

## 7) Supported query patterns (practical tips)

The intent classifier is rule-based. For best results, send messages containing keywords:

### E-commerce user

- Order status / tracking:
  - include an order id token like `ORD-2024-1001`
  - include words: `track`, `tracking`, `status`, `delivery`
- Addresses:
  - include: `address`, `delivery address`, `my address`
- Wishlist:
  - include: `wishlist`, `save for later`

### Distributor

- Wallet/balance:
  - include: `wallet`, `balance`, `pending`, `company fund`
- Downline/team count:
  - include: `downline`, `team count`, `my team`, `binary`
- Latest commissions:
  - include: `commission`, `earnings`, `income`, `ref bonus`, `latest`

---

## 8) Notes / gotchas

1. **Token header name is `x-auth-token`** (not `Authorization`).
2. **KYC gating exists**: token must belong to a user with `kyc_status === true`.
3. **Delivery tracking events may be limited**: the formatter includes a guard that may respond with a generic message when tracking events aren’t available yet.
4. Role handling assumes backend JWT role strings match those checked in `chatbotController.js`.

---

## 9) Contract summary (quick checklist)

- [ ] Frontend sends **POST** `/api/chatbot/message`
- [ ] Header `x-auth-token` is present and valid JWT
- [ ] Body is `{ "message": "..." }`
- [ ] Frontend displays `reply` from response JSON
- [ ] Frontend handles **202** for KYC not completed

---

If you want, I can also generate a small ready-to-drop React component (chat widget) wired to this endpoint.
