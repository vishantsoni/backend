# TODO

## Razorpay webhook notes/order_id troubleshooting

- [ ] Update `controllers/razorPayController.js` `createOrder` to validate `req.body.order_id` and add debug logs for `req.body.order_id` and `options.notes`.
- [ ] Update `controllers/razorPayController.js` webhook handler to log `paymentData.notes` (type + keys) when `payment.captured` arrives.
- [ ] Add a safe fallback: if `notes` is empty, log helpful context including `paymentData` keys.
- [x] Restart backend server and trigger `/create-order` + payment.
- [ ] Confirm webhook payload now contains `notes.my_database_order_id` and DB update uses correct order_id.
