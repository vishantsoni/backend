# TODO - Wallet payment purchase transaction

- [x] Add wallet payment_method logic in `controllers/distributor_OrderController.js` within `exports.d_p_o`:
  - If `payment_method === 'wallet'`, lock wallet row
  - Check `wallets.total_amount >= orders.total_amount`
  - Deduct `wallets.total_amount` by `totalAmount`
  - Insert `transactions` with:
    - `type='debit'`
    - `category='purchase'`
    - `status='completed'`
    - `remarks` referencing the order
  - Ensure all happens inside the existing DB transaction
- [ ] Quick manual test: place a wallet order and verify wallet decreased + transaction row exists.
