# TODO

- [x] Implement `exports.addTransaction` in `controllers/transactionController.js`.
  - [x] Validate request body fields (user_id, amount, deduction_from, type, category, status, remarks).
  - [x] Use DB transaction (`BEGIN/COMMIT/ROLLBACK`).
  - [x] Lock wallet row with `SELECT ... FOR UPDATE`.
  - [x] Update `wallets.total_amount` / `wallets.pending_amount` / `wallets.company_fund` based on `deduction_from` and `type`.
  - [x] Insert a row into `transactions` using existing column pattern used elsewhere in this controller.
  - [x] Return success response with `txnId` and updated wallet balances.
