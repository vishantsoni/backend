# TODO - Apply coupon flow to placeOrder

## Plan

- [x] Update `controllers/orderController.js` to validate `coupon_code` during `placeOrder`.

- [ ] Use existing coupon rules from `controllers/couponController.js` (status/date/min order/products/users/anti-abuse/usage limits) by duplicating validation logic inside `placeOrder` (to avoid HTTP call during checkout).
- [ ] Apply `discount_amount` to the order total using:
  - `coupon_base_total = subTotal + taxAmount + shippingCharges`
  - `finalTotalAmount = max(0, coupon_base_total - discount_amount)`
- [ ] Insert order with reduced `total_amount`.
- [ ] Ensure validation happens before inserting order items and deducting inventory.
- [ ] Optional: store coupon fields on `orders` if schema supports them.

## Testing

- [ ] Place order without coupon (should succeed unchanged).
- [ ] Place order with valid coupon (should succeed and reduce total).
- [ ] Place order with invalid/expired coupon (should fail and not deduct inventory).
