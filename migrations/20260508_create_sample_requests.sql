-- Create sample_requests table
-- Run via scripts/run-migration.js

CREATE TABLE IF NOT EXISTS sample_requests (
  id SERIAL PRIMARY KEY,

  name VARCHAR(100) NOT NULL,
  phone VARCHAR(15) NOT NULL,
  email VARCHAR(150),
  gender VARCHAR(10),
  dob DATE,

  address TEXT,
  state VARCHAR(100),
  city VARCHAR(100),
  pincode VARCHAR(10),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sample_requests_phone ON sample_requests(phone);
CREATE INDEX IF NOT EXISTS idx_sample_requests_email ON sample_requests(email);
CREATE INDEX IF NOT EXISTS idx_sample_requests_created_at ON sample_requests(created_at);

-- If you expect email/phone to be unique, uncomment these:
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_sample_requests_phone ON sample_requests(phone);
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_sample_requests_email ON sample_requests(email);


