DO $$ 
DECLARE 
    admin_id INT;
    admin_username TEXT := 'admin8888'; -- Aap apna pasandida username rakhein
    admin_email TEXT := 'admin@ganeshtech.com'; -- Business email
    -- Password 'Admin@123' ka hashed version (bcrypt rounds: 10)
    admin_password_hash TEXT := '$2b$10$ZEsys8X0OcX4ddlILo1QUeyPMEU7HgpMGjnOqZbPa.bEPFk0OXanW'; 
BEGIN
    -- 1. Insert Super Admin into Users Table
    INSERT INTO public.users (
        full_name, email, phone, username, password_hash, 
        node_path, binary_path, is_active, business_level, 
        kyc_status, agreed_to_terms, referral_code, role
    ) VALUES (
        'Super Admin', 
        admin_email, 
        '9999999999', 
        admin_username, 
        admin_password_hash, 
        admin_username::ltree, -- node_path 'admin8888'
        '1'::ltree,            -- binary_path '1' (The absolute Root)
        true,                  -- Direct active
        1,                     -- Business Level 1
        true,                  -- KYC Verified
        true,                  -- Terms Agreed
        'ADMIN001',             -- Referral Code
        'Super Admin'
    ) 
    RETURNING id INTO admin_id;

    -- 2. Initialize Wallet for Super Admin
    INSERT INTO public.wallets (
        user_id, total_amount, pending_amount, 
        left_count, right_count, paid_pairs
    ) VALUES (
        admin_id, 0, 0, 0, 0, 0
    );

    RAISE NOTICE 'Super Admin created with ID: %', admin_id;
END $$;