CREATE UNIQUE INDEX uq_pair_match
ON pair_matches
(
    upline_id,
    left_order_id,
    right_order_id
);