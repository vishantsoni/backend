-- Create order return workflow table
-- This enables: return request (customer), admin approve/reject, warehouse received (restore inventory), and refund (wallet + transactions log)

CREATE TABLE IF NOT EXISTS order_returns (
  id SERIAL PRIMARY KEY,

  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,

  -- requested by customer/distributor
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- lifecycle statuses
  return_status VARCHAR(30) NOT NULL DEFAULT 'requested',
  refund_status VARCHAR(30) NOT NULL DEFAULT 'not_initiated',

  return_reason TEXT,
  admin_remarks TEXT,

  -- when warehouse confirms returned items received
  received_at TIMESTAMP WITH TIME ZONE,

  -- refund details
  refund_amount DECIMAL(15,2) DEFAULT 0,
  refunded_at TIMESTAMP WITH TIME ZONE,

  -- audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Useful indexes
CREATE INDEX IF NOT EXISTS idx_order_returns_order_id ON order_returns(order_id);
CREATE INDEX IF NOT EXISTS idx_order_returns_user_id ON order_returns(user_id);
CREATE INDEX IF NOT EXISTS idx_order_returns_return_status ON order_returns(return_status);
CREATE INDEX IF NOT EXISTS idx_order_returns_refund_status ON order_returns(refund_status);

-- Optional: keep updated_at fresh (only if trigger exists; safest to omit trigger here)

