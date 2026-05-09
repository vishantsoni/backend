CREATE TABLE IF NOT EXISTS ticket_reads (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE NOT NULL,
    viewer_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    viewer_user_type VARCHAR(20) NOT NULL, -- ECOM_USER / DISTRIBUTOR / STAFF / ADMIN
    last_read_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ticket_id, viewer_user_id, viewer_user_type)
);

CREATE INDEX IF NOT EXISTS idx_ticket_reads_ticket_id ON ticket_reads(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_reads_viewer ON ticket_reads(viewer_user_id, viewer_user_type);
