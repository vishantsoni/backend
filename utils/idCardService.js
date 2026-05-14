const fs = require("fs/promises");
const path = require("path");
const QRCode = require("qrcode");

// Image rendering
// https://www.npmjs.com/package/canvas
const { createCanvas, loadImage } = require("canvas");

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function getTemplates() {
  const frontTemplate = path.join(
    __dirname,
    "..",
    "id_card",
    "id_card_front.jpg",
  );
  const backTemplate = path.join(
    __dirname,
    "..",
    "id_card",
    "id_card_back.jpg",
  );
  return { frontTemplate, backTemplate };
}

async function copyTemplateToUserCard(userId) {
  const { frontTemplate, backTemplate } = getTemplates();
  const userDir = path.join(
    process.cwd(),
    "uploads",
    "id-cards",
    String(userId),
  );

  const frontDest = path.join(userDir, "front.jpg");
  const backDest = path.join(userDir, "back.jpg");

  // Copy templates each time so it always has the latest QR if/when we overlay later.
  await fs.copyFile(frontTemplate, frontDest);
  await fs.copyFile(backTemplate, backDest);

  return { frontDest, backDest, userDir };
}

async function generateIdCardQr({ userId, businessLevel }) {
  const appUrl = process.env.APP_URL || "http://localhost:5000";

  // QR points to a verify endpoint that should read latest level from DB.
  // Backend must expose: GET /id/verify?userId=<id>
  const qrPayload = `${appUrl.replace(
    /\/$/,
    "",
  )}/id/verify?userId=${encodeURIComponent(userId)}&level=${encodeURIComponent(
    businessLevel ?? "",
  )}`;

  const userDir = path.join(
    process.cwd(),
    "uploads",
    "id-cards",
    String(userId),
  );
  const qrPath = path.join(userDir, "qr.png");

  await QRCode.toFile(qrPath, qrPayload, {
    color: { dark: "#000000", light: "#FFFFFF" },
    width: 500,
    margin: 1,
  });

  return { qrPath, qrPayload };
}

/**
 * Generate/refresh ID card files for a user after level change.
 *
 * @param {number} userId
 * @param {number} businessLevel
 */
async function generateAndSaveIdCard({
  userId,
  businessLevel,
  fullName,
  referralCode,
  phone,
}) {
  const userDir = path.join(
    process.cwd(),
    "uploads",
    "id-cards",
    String(userId),
  );

  const frontCard = path.join(userDir, "front.jpg");
  const backCard = path.join(userDir, "back.jpg");
  const qrCodePath = path.join(userDir, "qr.png");

  // --- NEW LOGIC: CHECK IF ALREADY EXISTS ---
  try {
    // We check for front.jpg as the indicator that the card set exists
    await fs.access(frontCard);

    // If access succeeds, file exists. Return the paths/URLs immediately.
    return {
      frontUrl: `${
        process.env.APP_URL || ""
      }/uploads/id-cards/${userId}/front.jpg`,
      backUrl: `${
        process.env.APP_URL || ""
      }/uploads/id-cards/${userId}/back.jpg`,
      qrUrl: `${process.env.APP_URL || ""}/uploads/id-cards/${userId}/qr.png`,
      frontPath: frontCard,
      backPath: backCard,
      qrPath: qrCodePath,
      alreadyExisted: true, // Optional flag for debugging
    };
  } catch (err) {
    // throw new Error(
    //   `ID card already exists for user ${userId}. To refresh, delete existing card first.`,
    // ); // Or handle as needed
  }

  await ensureDir(userDir);

  // Create deterministic front/back images from templates.
  // (Text/QR overlay upgrade requires canvas/sharp.)
  const { frontDest, backDest } = await copyTemplateToUserCard(userId);
  const { qrPath } = await generateIdCardQr({ userId, businessLevel });

  if (fullName || referralCode) {
    const frontImg = await loadImage(frontDest);
    const canvas = createCanvas(frontImg.width, frontImg.height);
    const ctx = canvas.getContext("2d");
    const qrImg = await loadImage(qrPath); // Load the generated QR code

    // draw template
    ctx.drawImage(frontImg, 0, 0);
    ctx.drawImage(qrImg, 50, 850, 155, 155);

    ctx.fillStyle = "#000000";
    // NOTE: set a reasonably bold font. Adjust size if template differs.
    ctx.font = "bold 28px Arial";
    ctx.textBaseline = "top";
    ctx.textAlign = "center";

    // Name: PRIYA VATS (top text)
    // Approx placement based on demo: (x ~ 70, y ~ 170)
    if (fullName) {
      ctx.font = "bold 48px Arial";
      ctx.fillText(String(fullName).toUpperCase(), 320, 530);
    }

    if (phone) {
      ctx.font = "bold 25px Arial";
      ctx.fillText("M." + String(phone).toUpperCase(), 320, 640);
    }

    // Referral code: IR NO: FS26040001 (below name)
    // Approx: (x ~ 70, y ~ 260)
    if (businessLevel) {
      ctx.fillStyle = "#FFFFFF"; // White text for the green ribbon
      ctx.font = "bold 33px Arial";
      ctx.fillText(String(businessLevel).toUpperCase(), 320, 690); // Placed inside the green ribbon
    }

    // 3. Referral Code (e.g., IR NO: FS26040001)
    if (referralCode) {
      ctx.fillStyle = "#1A1A1B"; // Reset to dark color
      ctx.font = "bold 32px Arial";
      ctx.fillText(`IR NO: ${String(referralCode)}`, 320, 760); // Placed below the ribbon
    }

    // ACTIVE level text is already embedded in template only if you use the demo.
    // We only regenerate QR + re-render the same fields. If your real front.jpg also needs level,
    // add it here similarly.

    const out = canvas.toBuffer("image/jpeg", { quality: 0.95 });
    await fs.writeFile(frontDest, out);
  }

  return {
    frontUrl: `${
      process.env.APP_URL || ""
    }/uploads/id-cards/${userId}/front.jpg`,
    backUrl: `${process.env.APP_URL || ""}/uploads/id-cards/${userId}/back.jpg`,
    qrUrl: `${process.env.APP_URL || ""}/uploads/id-cards/${userId}/qr.png`,
    frontPath: frontDest,
    backPath: backDest,
    qrPath,
  };
}

module.exports = {
  generateAndSaveIdCard,
};
