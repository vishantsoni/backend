# Login Attempt Protection Feature

## Steps:

- [x] 1. Update migrations/migration.sql - add failed_attempts, locked_until to users table
- [x] 2. Update controllers/authController.js - fix login query bug, add sendLoginOtp, update login logic with attempts/lock/OTP
- [x] 3. Update routes/authRoutes.js - add POST /send-login-otp route
- [ ] 4. Test: Run migration, simulate 3 failed logins, send OTP, login with OTP
- [ ] 5. Optional: Extend userController.js OTP for username + 'login' purpose if needed
- [ ] 6. Complete

Current: Starting step 1
