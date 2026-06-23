# TODO

- [ ] Identify where level_milestones.reward_cash and cash_com are used during milestone payout.
- [ ] Change milestone payout logic to treat reward_cash and cash_com as percentage values: compute actual reward_amount and cash_comission_amount first, then update wallet/transactions.
- [ ] Ensure queries/transactions still store computed rupee amounts (not percentages).
- [ ] Add basic guards for missing/invalid percentage values.
- [ ] Run a quick Node syntax check (and/or unit-like execution) if available.
