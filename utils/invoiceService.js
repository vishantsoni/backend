const fs = require("fs/promises");
const path = require("path");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");

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

/**
 * Generates a structured Professional Tax Invoice from scratch with proper dynamic math bindings.
 */
async function getOrCreateInvoicePdf({ order, force = false }) {
  const appUrl = process.env.APP_URL || "";

  const orderIdStr = String(order.id);
  const u = safeSegment(order.user_id || order.distributor_id || "guest");
  const i = safeSegment(orderIdStr); // Invoice number is strictly the order_id

  // Format Date (YYYY-MM-DD)
  const orderDate = order.created_at
    ? new Date(order.created_at).toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];
  const d = safeSegment(orderDate);

  const invoiceKey = order.order_id ? safeSegment(order.order_id) : i;

  const uploadDir = path.join(
    process.cwd(),
    "uploads",
    "invoices",
    u,
    invoiceKey,
  );
  const destPdfPath = path.join(uploadDir, "invoice.pdf");
  const publicUrl = `${appUrl}/uploads/invoices/${u}/${encodeURIComponent(
    invoiceKey,
  )}/invoice.pdf`;

  const exists = await fileExists(destPdfPath);
  if (exists && !force) {
    return { created: false, url: publicUrl, filePath: destPdfPath };
  }

  await ensureDir(uploadDir);

  // --- 1. INITIALIZE BLANK CANVAS ---
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.27, 841.89]); // Standard A4 Dimensions

  const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Drawing Helpers
  const drawText = (
    text,
    x,
    y,
    size = 9,
    isBold = false,
    color = rgb(0, 0, 0),
  ) => {
    if (text !== undefined && text !== null) {
      page.drawText(String(text), {
        x,
        y,
        size,
        font: isBold ? fontHelveticaBold : fontHelvetica,
        color,
      });
    }
  };

  const drawLine = (x1, y1, x2, y2, thickness = 1, color = rgb(0, 0, 0)) => {
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness,
      color,
    });
  };

  // --- 2. HEADER BRANDING BLOCK ---
  drawText("Tax Invoice", 450, 790, 20, true);
  drawText("Original For Recipient", 450, 775, 9, true, rgb(0.4, 0.4, 0.4));

  // Company Details Branding
  drawText("Feel Safe Pvt. Ltd.", 40, 795, 14, true, rgb(0.05, 0.45, 0.2));
  drawText(
    "KharKhari Nahar, Near MCD School, Najafgarh,",
    40,
    782,
    8.5,
    false,
    rgb(0.3, 0.3, 0.3),
  );
  drawText(
    "South West, New Delhi, Delhi – 110043, INDIA",
    40,
    771,
    8.5,
    false,
    rgb(0.3, 0.3, 0.3),
  );
  drawText(
    "Phone: +91 9013499385  |  Email: support@feelsafeco.in",
    40,
    760,
    8.5,
    true,
    rgb(0.2, 0.2, 0.2),
  );

  drawLine(40, 745, 555, 745, 0.5, rgb(0.8, 0.8, 0.8));

  // --- 3. METADATA INFRASTRUCTURE GRID ---
  drawText("Invoice Number:", 40, 725, 9, false, rgb(0.4, 0.4, 0.4));
  drawText(order.order_id || orderIdStr, 120, 725, 10, true);

  drawText("Invoice Date:", 250, 725, 9, false, rgb(0.4, 0.4, 0.4));
  drawText(orderDate, 320, 725, 10, true);

  drawText("Payment Mode:", 430, 725, 9, false, rgb(0.4, 0.4, 0.4));
  drawText(
    String(order.payment_method || "Online").toUpperCase(),
    505,
    725,
    9,
    true,
  );

  drawLine(40, 710, 555, 710, 0.5, rgb(0.8, 0.8, 0.8));

  // --- 4. SHIPPING & BILLING ADDRESS DETAILS ---
  const shipping = order.shipping_address || {};

  // Left: Bill To
  drawText("BILL TO:", 40, 690, 9, true, rgb(0.4, 0.4, 0.4));
  drawText(
    order.user_name || shipping.full_name || "Customer",
    40,
    675,
    11,
    true,
  );
  drawText(shipping.address_line1 || "", 40, 660, 9);
  if (shipping.address_line2) drawText(shipping.address_line2, 40, 648, 9);
  drawText(
    `${shipping.city || ""}, ${shipping.state || ""} - ${
      shipping.pincode || ""
    }`,
    40,
    636,
    9,
  );
  drawText(`Phone: ${order.user_phone || shipping.phone || ""}`, 40, 624, 9);

  // Right: Ship To
  drawText("SHIP TO:", 320, 690, 9, true, rgb(0.4, 0.4, 0.4));
  drawText(
    shipping.full_name || order.user_name || "Customer",
    320,
    675,
    11,
    true,
  );
  drawText(shipping.address_line1 || "", 320, 660, 9);
  if (shipping.address_line2) drawText(shipping.address_line2, 320, 648, 9);
  drawText(
    `${shipping.city || ""}, ${shipping.state || ""} - ${
      shipping.pincode || ""
    }`,
    320,
    636,
    9,
  );
  drawText(`Phone: ${shipping.phone || order.user_phone || ""}`, 320, 624, 9);

  // --- 5. PRODUCTS GRID LAYOUT (FIXED COLUMN MAPPINGS) ---
  let tableY = 580;
  drawLine(40, tableY, 555, tableY, 1);

  // FIXED: Updated Grid Headers Order to exactly match cells structure
  drawText("SN.", 43, tableY - 14, 9, true);
  drawText("Description", 70, tableY - 14, 9, true);
  drawText("HSN", 215, tableY - 14, 9, true);
  drawText("MRP", 252, tableY - 14, 9, true);
  drawText("Qty.", 295, tableY - 14, 9, true);
  drawText("Gross Amt", 328, tableY - 14, 9, true);
  drawText("Taxable Val", 392, tableY - 14, 9, true);
  drawText("Taxes", 465, tableY - 14, 9, true);
  drawText("Total", 522, tableY - 14, 9, true);

  tableY -= 22;
  drawLine(40, tableY, 555, tableY, 1);

  const productsList = order.products || [];

  productsList.forEach((item, index) => {
    // Dynamic runtime casting to guarantee numbers are formatted safely
    const qty = Number(item.qty || 1);
    const price = Number(item.unit_price || item.price || 0);
    const itemTotal = Number(item.total_item_price || price * qty);

    // Handle variant json structure mapping with fallback protections
    const variant_details = item.variant_details || {};
    const tax_data = variant_details.tax_data || {};
    const percentage = Number(tax_data.percentage || 5); // Fallback standard to 5% if data layer lacks index

    // Reverse and straight tax values engineering
    const taxAmount = itemTotal * (percentage / 100);
    const taxableVal = itemTotal + taxAmount;
    const unit_mrp = price + price * (percentage / 100);

    // Drawing row contents perfectly inside their structural boundaries
    drawText(String(index + 1), 45, tableY - 14, 9);
    drawText(item.product_name || "Product Item", 70, tableY - 14, 8);
    drawText(String(item.variant_sku || "5407"), 215, tableY - 14, 8);
    drawText("₹" + unit_mrp.toFixed(2), 252, tableY - 14, 9);
    drawText(String(qty), 298, tableY - 14, 9);
    drawText(itemTotal.toFixed(2), 328, tableY - 14, 9);
    drawText("₹" + taxableVal.toFixed(2), 392, tableY - 14, 9);
    drawText("₹" + taxAmount.toFixed(2), 468, tableY - 14, 9);
    drawText("₹" + itemTotal.toFixed(2), 522, tableY - 14, 9);

    tableY -= 24;
  });

  drawLine(40, tableY, 555, tableY, 1);

  // FIXED: Adjusted lines coordinate mapping to perfectly box the recalculated layout
  const structureLines = [40, 65, 210, 248, 290, 325, 388, 455, 518, 555];
  structureLines.forEach((xCoord) => {
    drawLine(xCoord, 580, xCoord, tableY, 0.5, rgb(0.7, 0.7, 0.7));
  });

  // --- 6. CALCULATED TOTAL ROW ACCUMULATIONS ---
  // Using direct safe properties fallback checks
  const footerSubTotal = order.sub_total || order.subtotal || "0.00";
  const footerTaxAmount = order.tax_amount || order.total_tax || "0.00";
  const footerTotalAmount = order.total_amount || order.total || "0.00";

  drawText("Total", 45, tableY - 14, 10, true);
  drawText("₹" + String(footerSubTotal), 392, tableY - 14, 9, true);
  drawText("₹" + String(footerTaxAmount), 468, tableY - 14, 9, true);
  drawText("₹" + String(footerTotalAmount), 522, tableY - 14, 9, true);

  tableY -= 22;
  drawLine(40, tableY, 555, tableY, 1);
  drawLine(40, tableY + 22, 40, tableY, 0.5);
  drawLine(555, tableY + 22, 555, tableY, 0.5);

  // --- 7. STATIC TERMS & CONDITIONAL DECLARATION FOOTER ---
  tableY -= 35;
  drawText("Terms & Conditions:", 40, tableY, 10, true);
  tableY -= 15;
  drawText(
    `Sold by: ${
      order.distributor?.name || order.user_name || "Feel Safe Vendor"
    }`,
    40,
    tableY,
    9,
    true,
    rgb(0.2, 0.2, 0.2),
  );
  tableY -= 12;
  drawText(
    "Tax is not payable on reverse charge basis.",
    40,
    tableY,
    8.5,
    false,
    rgb(0.3, 0.3, 0.3),
  );
  tableY -= 12;
  drawText(
    "This is a computer generated invoice and does not require signature.",
    40,
    tableY,
    8.5,
    false,
    rgb(0.3, 0.3, 0.3),
  );

  const finalPdfBytes = await pdfDoc.save();
  await fs.writeFile(destPdfPath, finalPdfBytes);

  return {
    created: true,
    url: publicUrl,
    filePath: destPdfPath,
  };
}

module.exports = {
  getOrCreateInvoicePdf,
};
