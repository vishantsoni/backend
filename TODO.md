# TODO

- [ ] Add Issue Date + Join Date + 1 year range text overlay to ID card front (demo)
  - [ ] Update `routes/idCardRoutes.js` to fetch join date from DB (users.created_at) and pass to `generateAndSaveIdCard`
  - [ ] Update `utils/idCardService.js` to compute date range and render it on the front card using canvas
  - [ ] Ensure re-render happens even if front.jpg/back.jpg already exist (remove/adjust early-return)
  - [ ] Quick runtime test: call `/idcard/generate` and verify front image has date range
