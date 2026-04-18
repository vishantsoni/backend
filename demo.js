const bcrypt = require("bcrypt");

(async () => {
  const password = "12345678"; // Define password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);
  console.log("Hashed: ", hashedPassword);
})();
