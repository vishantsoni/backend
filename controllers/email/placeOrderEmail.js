// const nodemailer = require("nodemailer");
const emailTemplates = require("./EmailTemplate.json");
const { transporter } = require("../../utils/otpService");
// const transporter = nodemailer.createTransport({
//   host: process.env.EMAIL_HOST,
//   port: Number(process.env.EMAIL_PORT || 587),
//   secure: false,
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASS,
//   },
// });

// A simple function to build a clean HTML table for the cart products
function generateHtmlItemList(items) {
  let tableHtml = `
    <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #334155;">
      <thead>
        <tr style="border-bottom: 2px solid #e2e8f0; text-align: left; font-weight: bold;">
          <th style="padding: 8px 0;">Product</th>
          <th style="padding: 8px 0; text-align: center;">Qty</th>
          <th style="padding: 8px 0; text-align: right;">Price</th>
        </tr>
      </thead>
      <tbody>
  `;

  items.forEach((item) => {
    tableHtml += `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 10px 0; font-weight: 500;">${item.name}</td>
        <td style="padding: 10px 0; text-align: center; color: #64748b;">${
          item.quantity
        }</td>
        <td style="padding: 10px 0; text-align: right; font-weight: bold;">$${(
          item.price * item.quantity
        ).toFixed(2)}</td>
      </tr>
    `;
  });

  tableHtml += "</tbody></table>";
  return tableHtml;
}

// A simple function to generate a text fallback version for older e-mail applications
function generatePlainTextItems(items) {
  return items
    .map(
      (i) =>
        `- ${i.name} (x${i.quantity}): $${(i.price * i.quantity).toFixed(2)}`,
    )
    .join("\n");
}

function compileOrderEmail(orderData, templateKey = "order_placed") {
  console.log(
    " \n\n Compiling email for order:",
    orderData.order_id,
    "with status key:",
    templateKey,
  );
  const template =
    emailTemplates.templates[templateKey] ||
    emailTemplates.templates.order_placed;

  if (!template) {
    throw new Error(`Email template not found for key: ${templateKey}`);
  }

  let subject = template.subject;
  let text = template.plainTextMessage;
  let html = template.htmlContent;

  const items = orderData?.items || [];
  const htmlItemsTable = generateHtmlItemList(items);
  const plainTextItems = generatePlainTextItems(items);

  const invoiceUrl = `https://feelsafeco.in/dashboard/invoices/${orderData.order_id}`;

  const templateVariables = {
    "{{order_id}}": String(orderData.order_id),
    "{{customer_name}}": String(orderData.customer_name),
    "{{invoice_url}}": invoiceUrl,
    "{{itemList}}": htmlItemsTable,
  };

  // Replace placeholders in subject/html
  Object.keys(templateVariables).forEach((key) => {
    subject = subject.replaceAll(key, templateVariables[key]);
    html = html.replaceAll(key, templateVariables[key]);
  });

  // Replace placeholders in text + append items
  text = text
    .replaceAll("{{order_id}}", templateVariables["{{order_id}}"])
    .replaceAll("{{customer_name}}", templateVariables["{{customer_name}}"])
    .replaceAll("{{invoice_url}}", templateVariables["{{invoice_url}}"])
    .concat(`\n\nItems Ordered:\n${plainTextItems}`);

  return { subject, text, html };
}

// Main mail wrapper compiler function
async function sendPlacedOrderEmail(userEmail, orderData) {
  const { subject, text, html } = compileOrderEmail(orderData);

  await transporter.sendMail({
    from: '"Feel Safe" <no-reply@feelsafeco.in>',
    to: userEmail,
    subject,
    text,
    html,
  });
}

// order status update (currently using same template key: order_placed)
async function sendOrderStatusUpdateEmail(userEmail, orderData) {
  const { subject, text, html } = compileOrderEmail(
    orderData,
    orderData.status,
  );

  await transporter.sendMail({
    from: '"Feel Safe" <no-reply@feelsafeco.in>',
    to: userEmail,
    subject,
    text,
    html,
  });
}

module.exports = { sendPlacedOrderEmail, sendOrderStatusUpdateEmail };
