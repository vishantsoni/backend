# TODO - Dashboard split (distributor vs ecom_user)

- [ ] Update `controllers/dashboardController.js`:

  - [ ] Add `getDashboardDataV2` function for testing (split)

- [x] Implement `distributor` and `ecom_user` sections in response under `data.distributor` and `data.ecom_user`

  - [ ] Keep existing `getDashboardData` unchanged for backward compatibility (option B)

- [x] Add/adjust route in `routes/dashboardRoutes.js` to expose `getDashboardDataV2` for testing

- [ ] Run a quick node lint/test command (or at least start server) to ensure no syntax errors
