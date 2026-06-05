# TODO

## SMS OTP via Edumarc (edumarcsms.com)

- [x] Implement Edumarc SMS OTP sending in `utils/otpService.js` using API `POST https://smsapi.edumarcsms.com/api/v1/sendsms`.
- [x] Use templateId `1707168926925165526` and senderId `EDUMRC`.
- [x] Read API key from env var `EDUMARC_SMS_APIKEY`.
- [x] Replace current `// TODO: SMS via Twilio` branch with real SMS sending.
- [x] Sanity check for missing env var (fail fast with clear error).
