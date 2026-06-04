# TODO: Feel Safe Chatbot Q&A update

- [x] Step 1: Extend chatbot intent/response to support FAQ matching (English + Hindi) from the provided document.

- [x] Step 2: Update `services/chatbot/responseFormatter.js` to return official answers when FAQ matched.

- [x] Step 3: Enhance DB/tool-based answers:

  - [ ] Distributor: wallet + latest commission transactions formatting
  - [ ] ECOM_USER: order status + order items summary + payment transaction details + addresses/wishlist counts

- [ ] Step 4: Update `services/chatbot/intentClassifier.js` so raw message is available to formatter (language detection + FAQ matching).
- [ ] Step 5: Run a quick node lint/test (or start server) to ensure no syntax errors.
