# TODO - Dashboard ecom/me metrics

- [ ] Implement new dashboard metrics function "dashboard" in controllers/dashboardController.js
  - Total Orders (COUNT from orders)
  - Open Tickets (COUNT from tickets with non-closed status)
  - Total Order Value (SUM total_amount from orders)
- [ ] Wire route /ecom/me to the new function in routes/dashboardRoutes.js
- [ ] Add/verify required SQL column names for tickets and orders
- [ ] Run lint/tests or start server to validate endpoint response shape
