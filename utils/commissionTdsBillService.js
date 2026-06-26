const fs = require("fs/promises");
const path = require("path");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");

// Polyfill required by @pdf-lib/fontkit UMD build in some Node setups
require("regenerator-runtime/runtime");
const fontkit = require("@pdf-lib/fontkit");

function safeSegment(input) {
  const str = String(input ?? "");
  return str.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 120);
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function formatDateOnly(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toISOString().split("T")[0];
}

async function getOrCreateCommissionTdsBillPdf({
  userId,
  cycleKey,
  from,
  to,
  commissionSummary,
  tdsSummary,
  commissionTransactions = [], // Expected keys: { created_at, amount, remarks }
  cusInfo = {},
  force = false,
}) {
  // console.log("checking - ", tdsSummary, commissionSummary);

  const appUrl = process.env.APP_URL || "";

  const u = safeSegment(userId || "guest");
  const invoiceKey = safeSegment(
    cycleKey || `${formatDateOnly(from)}_${formatDateOnly(to)}`,
  );

  const uploadDir = path.join(
    process.cwd(),
    "uploads",
    "commission-tds-bills",
    u,
    invoiceKey,
  );
  const destPdfPath = path.join(uploadDir, "bill.pdf");
  const publicUrl = `${appUrl}/uploads/commission-tds-bills/${encodeURIComponent(
    u,
  )}/${encodeURIComponent(invoiceKey)}/bill.pdf`;

  const exists = await fileExists(destPdfPath);
  if (exists && !force) {
    return { created: false, url: publicUrl, filePath: destPdfPath };
  }

  await ensureDir(uploadDir);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  // 1. Load Custom Devanagari Font to handle '₹' & Hindi typography
  const fontPath = path.join(
    process.cwd(),
    "assets",
    "fonts",
    "NotoSansDevanagari-Regular.ttf",
  );
  const fontBytes = await fs.readFile(fontPath);
  const customHindiFont = await pdfDoc.embedFont(fontBytes);

  // 2. Load background Watermark PNG asset
  let embeddedWatermark = null;
  try {
    const watermarkPath = path.join(
      process.cwd(),
      "assets",
      "image",
      "image4.jpeg",
    );
    const watermarkBytes = await fs.readFile(watermarkPath);
    embeddedWatermark = await pdfDoc.embedPng(watermarkBytes);
  } catch (err) {
    console.warn("Watermark image missing at /assets/image/image4.jpeg");
  }

  const page = pdfDoc.addPage([595.27, 841.89]);
  const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // 3. Render Background Watermark Layer
  if (embeddedWatermark) {
    const watermarkWidth = 320;
    const watermarkHeight = 320;
    page.drawImage(embeddedWatermark, {
      x: (page.getWidth() - watermarkWidth) / 2,
      y: (page.getHeight() - watermarkHeight) / 2 + 30,
      width: watermarkWidth,
      height: watermarkHeight,
      opacity: 0.1,
    });
  }

  // --- DRAWING LAYOUT UTILITIES ---
  const drawText = (
    text,
    x,
    y,
    size = 8,
    isBold = false,
    color = rgb(0, 0, 0),
  ) => {
    if (text === undefined || text === null) return;
    let stringText = String(text);

    let chosenFont = isBold ? fontHelveticaBold : fontHelvetica;
    // Dynamic fallbacks mapping if text context embeds native Devanagari or Currency blocks
    if (/[\u0900-\u097F]/.test(stringText)) {
      chosenFont = customHindiFont;
    }

    // Replace rupee symbol with INR to avoid WinAnsi encoding errors
    stringText = stringText.replace(/₹/g, "INR");
    page.drawText(stringText, { x, y, size, font: chosenFont, color });
  };

  const drawLine = (x1, y1, x2, y2, thickness = 0.5, color = rgb(0, 0, 0)) => {
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness,
      color,
    });
  };

  const drawRect = (
    x,
    y,
    width,
    height,
    thickness = 0.5,
    borderColor = rgb(0, 0, 0),
  ) => {
    page.drawRectangle({
      x,
      y,
      width,
      height,
      borderWidth: thickness,
      borderColor,
      color: rgb(1, 1, 1, 0),
    });
  };

  // Outer Box Frame Container
  drawRect(30, 40, 535, 765, 0.75, rgb(0.2, 0.2, 0.2));

  // Avoid overwriting drawText helper name collisions and ensure cusInfo always exists
  cusInfo = cusInfo || {};

  // --- HEADER BRANDING ---
  const brandColor = rgb(0.42, 0.16, 0.54); // Purple Corporate Identity Accent
  drawText("FEEL SAFE PRIVATE LIMITED", 145, 780, 18, true, brandColor);
  drawText("Original For Recipient", 475, 782, 7.5, true);

  drawText(
    "OFFICE ADDRESS: Pole No.17, Kharkhari Nahar, Near MCD School,",
    155,
    768,
    8,
    true,
  );
  drawText(
    "Najafgarh, South West, New Delhi, Delhi – 110043.",
    200,
    757,
    8,
    true,
  );
  drawText(
    "27x7 Helpline no. +91 9013499385 | Email: support@feelsafeco.in | Website: feelsafeco.in",
    130,
    745,
    8,
    false,
    rgb(0, 0, 1),
  );

  drawText("CIN- U13996DL2026PTC465812", 440, 733, 8, true);
  drawText("TAX / COMMISSION STATEMENT", 185, 725, 12, true, brandColor);
  drawText("GSTIN:- 07AAHCF0020FIZA", 442, 721, 8, true);

  // --- METADATA SECTIONS ROW ---
  let metaY = 712;
  drawLine(30, metaY, 565, metaY, 0.5);
  drawLine(310, metaY, 310, metaY - 45, 0.5);

  drawText("Sakhi Distributor ID No.:", 35, metaY - 12, 8, true);
  drawText(cusInfo.referral_code, 170, metaY - 12, 8, true);
  drawLine(30, metaY - 17, 310, metaY - 17, 0.5);

  // Right Side Dates
  drawText("From Date:", 315, metaY - 12, 8, true);
  drawText(formatDateOnly(from), 415, metaY - 12, 8);
  drawLine(310, metaY - 17, 565, metaY - 17, 0.5);

  drawText("To Date:", 315, metaY - 33, 8, true);
  drawText(formatDateOnly(to), 415, metaY - 33, 8);

  metaY -= 45;
  drawLine(30, metaY, 565, metaY, 0.5);

  // --- SHIPPING & RESIDENTIAL ADDRESS GRID ROW ---
  drawLine(300, metaY, 300, metaY - 120, 0.5);

  drawText("Residential Address:", 35, metaY - 12, 9, true, rgb(0.2, 0.4, 0.6));
  drawText(
    "Bill & Shipping Address:",
    305,
    metaY - 12,
    9,
    true,
    rgb(0.2, 0.4, 0.6),
  );
  drawLine(30, metaY - 16, 565, metaY - 16, 0.5);

  const addressLabels = [
    "Name:",
    "Address:",
    "State:",
    "Pin code:",
    "Phone No:",
    "Email ID:",
    "GSTIN:",
  ];

  const addressValues = [
    cusInfo?.name || "",
    cusInfo?.address || "",
    cusInfo?.state || "",
    cusInfo?.pinCode || "",
    cusInfo?.phone || "",
    cusInfo?.email || "",
    cusInfo?.gstin || "",
  ];

  let addrLabelOffset = metaY - 26;

  for (let idx = 0; idx < addressLabels.length; idx++) {
    drawText(addressLabels[idx], 35, addrLabelOffset, 8);
    drawText(addressValues[idx], 170, addrLabelOffset, 8);

    drawText(addressLabels[idx], 305, addrLabelOffset, 8);
    drawText(addressValues[idx], 440, addrLabelOffset, 8);

    drawLine(
      30,
      addrLabelOffset - 3,
      565,
      addrLabelOffset - 3,
      0.25,
      rgb(0.8, 0.8, 0.8),
    );
    addrLabelOffset -= 13;
  }

  metaY -= 120;
  drawLine(30, metaY, 565, metaY, 0.5);

  // --- TRANSACTION SUMMARY CORE TABLE ---
  let tableY = metaY - 15;
  drawText("Transaction Summary", 240, tableY + 4, 10, true, brandColor);
  drawLine(30, tableY, 565, tableY, 0.5);

  const colCoordinates = [30, 75, 185, 335, 565];

  drawText("S. No.", 35, tableY - 14, 8, true);
  drawText("Date", 115, tableY - 14, 8, true);
  drawText("Net Amount", 230, tableY - 14, 8, true);
  drawText("Remarks", 420, tableY - 14, 8, true);

  tableY -= 20;
  drawLine(30, tableY, 565, tableY, 0.5);

  let totalCommissionAccumulated = Number(commissionSummary?.total_amount ?? 0);
  let totalTdsDeductedAccumulated = Number(tdsSummary?.total_amount ?? 0);

  const finalAmount = Number(
    totalCommissionAccumulated - totalTdsDeductedAccumulated,
  );

  if (commissionTransactions.length > 0 && totalCommissionAccumulated === 0) {
    commissionTransactions.forEach(
      (t) => (totalCommissionAccumulated += Number(t.amount || 0)),
    );
  }

  const renderedRows = commissionTransactions.slice(0, 7);

  renderedRows.forEach((item, index) => {
    drawText(String(index + 1), 45, tableY - 14, 8);
    drawText(formatDateOnly(item.created_at), 95, tableY - 14, 8);
    drawText(
      "₹ " + Number(item.amount ?? 0).toFixed(2),
      215,
      tableY - 14,
      8,
      true,
    );
    drawText(
      String(item.remarks || "Wallet Payout Statement").slice(0, 42),
      345,
      tableY - 14,
      7.5,
    );

    tableY -= 18;
    drawLine(30, tableY, 565, tableY, 0.25, rgb(0.8, 0.8, 0.8));
  });

  // Vertical Columns Dynamic Boundaries Drawing
  colCoordinates.forEach((xPos) => {
    drawLine(xPos, metaY - 15, xPos, tableY, 0.5);
  });

  // --- 1. Grand Total Row ---
  drawText("Grand Total", 95, tableY - 14, 8, true);
  drawText(
    "₹ " + totalCommissionAccumulated.toFixed(2),
    215,
    tableY - 14,
    8,
    true,
  );

  tableY -= 18;
  drawLine(30, tableY, 565, tableY, 0.5);
  drawLine(30, tableY + 18, 30, tableY, 0.5);
  drawLine(565, tableY + 18, 565, tableY, 0.5);

  // --- 2. TDS (2%) Row ---
  drawText("TDS (2%)", 95, tableY - 14, 8, true);
  drawText(
    "₹ " + totalTdsDeductedAccumulated.toFixed(2),
    215,
    tableY - 14,
    8,
    true,
  );

  tableY -= 18;
  drawLine(30, tableY, 565, tableY, 0.5);
  drawLine(30, tableY + 18, 30, tableY, 0.5);
  drawLine(565, tableY + 18, 565, tableY, 0.5);

  // --- 3. FINAL TALLY & STATEMENTS SUMMARY SECTION (Invoice Value Box) ---
  drawLine(255, tableY, 255, tableY - 32, 0.5);
  drawLine(385, tableY, 385, tableY - 32, 0.5);
  // drawLine(515, tableY, 515, tableY - 32, 0.5);
  // drawLine(30, tableY + 32, 30, tableY - 32, 0.5); // Outer bounding sync links
  // drawLine(565, tableY + 32, 565, tableY - 32, 0.5);

  drawText("Invoice Value (In Words)", 35, tableY - 18, 8, true);

  drawText("Total Commission", 262, tableY - 18, 8, true);
  // drawText("", 262, tableY - 22, 8, true);
  drawText("₹ " + finalAmount.toFixed(2), 392, tableY - 18, 8, true);

  // drawText("Total TDS", 520, tableY - 18, 7.5, true);

  // tableY -= 32;
  // drawLine(30, tableY, 565, tableY, 0.5);

  // Bottom localized total cell boundaries layout
  // drawLine(385, tableY, 385, tableY - 18, 0.5);
  // drawLine(515, tableY, 515, tableY - 18, 0.5);
  // drawLine(30, tableY, 30, tableY - 18, 0.5);
  // drawLine(565, tableY, 565, tableY - 18, 0.5);

  // drawText(
  //   "₹ " + totalTdsDeductedAccumulated.toFixed(2),
  //   520,
  //   tableY - 13,
  //   8,
  //   true,
  // );

  tableY -= 32;
  drawLine(30, tableY, 565, tableY, 0.5);

  // --- TERMS, COMPLIANCE & LEGAL DISCLAIMER ---
  const complianceClauses = [
    "Returns: Due to hygiene standards, goods once sold cannot be returned. Replacement is available only for manufacturing defects reported within 3 days of delivery.",
    "Video Proof: To claim a replacement, a clear and unedited unboxing video and photos of the package must be emailed to support@feelsafeco.in.",
    "Sakhi Buyback: Return and Buyback policies for registered Sakhis and Distributors are strictly applicable as per the terms on our official website feelsafeco.in.",
    "Support: For any product, delivery, support-related queries, email us at support@feelsafeco.in.",
    "Compliance: This invoice is fully subject to the guidelines of Feel Safe Sakhi Yojana and government direct selling regulations.",
    "Payments: Payments must be made only to the company's designated HDFC Bank account, official QR code, or Razorpay on feelsafeco.in. Company is not liable for any cash transactions.",
    "Jurisdiction: All legal disputes are subject to the exclusive jurisdiction of the courts near the Company's Registered Office in Najafgarh, New Delhi only.",
    "Digital Bill: This is a computer-generated document, so it is legally valid without any physical signature.",
  ];

  let disclaimerOffset = tableY - 15;
  complianceClauses.forEach((line) => {
    if (line.length > 130) {
      drawText(
        "• " + line.slice(0, 130),
        40,
        disclaimerOffset,
        6.5,
        false,
        rgb(0.2, 0.2, 0.2),
      );
      disclaimerOffset -= 9;
      drawText(
        line.slice(130),
        47,
        disclaimerOffset,
        6.5,
        false,
        rgb(0.2, 0.2, 0.2),
      );
    } else {
      drawText(
        "• " + line,
        40,
        disclaimerOffset,
        6.5,
        false,
        rgb(0.2, 0.2, 0.2),
      );
    }
    disclaimerOffset -= 9;
  });

  // --- FOOTER NOTIFICATION DIALOG ---
  drawRect(40, 50, 515, 26, 0.5);
  drawText(
    "Note: Please save/print this receipt for future reference. For assistance under the Feel Safe Sakhi Yojana, visit feelsafeco.in",
    45,
    64,
    7.5,
    true,
    rgb(0.7, 0.1, 0.1),
  );
  drawText(
    "or mail us at support@feelsafeco.in +91 9013499385",
    45,
    54,
    7.5,
    true,
    rgb(0, 0, 1),
  );

  drawText(
    "This is a computer generated document. No signature is required.",
    195,
    14,
    8,
    true,
  );

  const finalPdfBytes = await pdfDoc.save();
  await fs.writeFile(destPdfPath, finalPdfBytes);

  return { created: true, url: publicUrl, filePath: destPdfPath };
}

module.exports = { getOrCreateCommissionTdsBillPdf };
