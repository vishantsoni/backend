const fs = require("fs/promises");
const path = require("path");

// Image rendering using canvas
const { createCanvas, loadImage } = require("canvas");

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function getTemplates() {
  const frontTemplate = path.join(
    __dirname,
    "..",
    "id_card",
    "welcome_letter_pdf.jpg",
  );
  return { frontTemplate };
}

function dateformate(date) {
  // --- POSTGRESQL DATE CONVERSION LOGIC ---
  let formattedDate = "";
  try {
    // Parse the date passed from Postgres. If missing, fall back to current time.
    const parsedDate = date ? new Date(date) : new Date();

    // Check if the parsed date is valid, if not use current date as fallback
    const finalDate = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

    // Convert to DD/MM/YYYY using the Indian locale structure
    formattedDate = finalDate.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch (error) {
    // Safe ultimate fallback string if anything goes wrong
    formattedDate = new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  return formattedDate;
}

async function copyTemplateToUserCard(userId) {
  const { frontTemplate } = getTemplates();
  const userDir = path.join(
    process.cwd(),
    "uploads",
    "welcome-letter",
    String(userId),
  );

  const frontDest = path.join(userDir, "welcome_letter.jpg");
  await fs.copyFile(frontTemplate, frontDest);
  return { frontDest, userDir };
}

/**
 * Generate/refresh Welcome Letter for a user with responsive text positioning.
 *
 * @param {number} userId
 * @param {string} fullName
 * @param {string} referralCode
 */
async function generateAndSaveWelcomeLetter({
  date,
  userId,
  fullName,
  referralCode,
}) {
  const userDir = path.join(
    process.cwd(),
    "uploads",
    "welcome-letter",
    String(userId),
  );
  const frontCard = path.join(userDir, "welcome_letter.jpg");

  try {
    await fs.access(frontCard);
    return {
      frontUrl: `${
        process.env.APP_URL || ""
      }/uploads/welcome-letter/${userId}/welcome_letter.jpg`,
      frontPath: frontCard,
      alreadyExisted: true,
    };
  } catch (err) {
    // File doesn't exist, proceed to build
  }

  await ensureDir(userDir);
  const { frontDest } = await copyTemplateToUserCard(userId);

  const f_data = dateformate(date);

  const frontImg = await loadImage(frontDest);
  const canvas = createCanvas(frontImg.width, frontImg.height);
  const ctx = canvas.getContext("2d");

  ctx.drawImage(frontImg, 0, 0);

  // --- DYNAMIC PERCENTAGE POSITIONING ---
  // We use fractions of the real width/height so it scales perfectly regardless of high-res image sizes
  const W = frontImg.width;
  const H = frontImg.height;

  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  // Base scaling factors for font sizing dynamically linked to document size
  const baseFontSize = Math.round(W * 0.022); // Scaling factor for standard text (~54px on print layouts)

  // 1. Draw Date (Next to "Date: ")
  ctx.fillStyle = "#000000";
  ctx.font = `${baseFontSize}px Arial`;
  // X: ~16.5% from left margin, Y: ~24.1% from top
  ctx.fillText(f_data, W * 0.165, H * 0.241);

  // 2. Draw Dear [Name] (Next to "Dear ")
  if (fullName) {
    ctx.fillStyle = "#D32F2F"; // Matching the pink/red color profile theme
    ctx.font = `bold ${baseFontSize + 2}px Arial`;
    // X: ~16.5% from left margin, Y: ~27.1% from top
    ctx.fillText(String(fullName).toUpperCase(), W * 0.165, H * 0.27);
  }

  // 3. Draw Unique Sakhi ID (Below "Your unique Sakhi ID is:")
  if (referralCode) {
    ctx.fillStyle = "#D32F2F";
    ctx.font = `bold ${Math.round(baseFontSize * 1.2)}px Arial`; // Slightly bigger accent font
    // X: ~11.5% from left margin, Y: ~34.8% from top
    ctx.fillText(String(referralCode).toUpperCase(), W * 0.35, H * 0.348);
  }

  const out = canvas.toBuffer("image/jpeg", { quality: 0.95 });
  await fs.writeFile(frontDest, out);

  return {
    frontUrl: `${
      process.env.APP_URL || ""
    }/uploads/welcome-letter/${userId}/welcome_letter.jpg`,
    frontPath: frontDest,
  };
}

module.exports = {
  generateAndSaveWelcomeLetter,
};
