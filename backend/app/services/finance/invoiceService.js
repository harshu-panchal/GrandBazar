import PDFDocument from "pdfkit";
import Order from "../../models/order.js";
import Store from "../../models/store.js";
import Customer from "../../models/customer.js";
import Invoice from "../../models/invoice.js";
import Counter from "../../models/counter.js";
import Setting from "../../models/setting.js";
import { INVOICE_TYPE } from "../../constants/finance.js";
import { uploadRawToCloudinary, getSignedRawUrl } from "../../utils/cloudinary.js";
import { roundCurrency } from "../../utils/money.js";

function currentFinancialYearLabel(date = new Date()) {
  // Indian financial year: April 1 - March 31.
  const year = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  const shortNext = String((year + 1) % 100).padStart(2, "0");
  return `${year}-${shortNext}`;
}

async function nextInvoiceNumber(type, date = new Date()) {
  const fy = currentFinancialYearLabel(date);
  const prefix = type === INVOICE_TYPE.SELLER ? "INVS" : "INV";
  const counterKey = `invoice:${type}:${fy}`;
  const seq = await Counter.next(counterKey);
  return `${prefix}-${fy}-${String(seq).padStart(6, "0")}`;
}

function drawInvoiceHeader(doc, { title, invoiceNumber, generatedAt, billedFrom, billedTo, taxJurisdiction }) {
  doc.fontSize(18).text(title, { align: "left" });
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor("#555").text(`Invoice #: ${invoiceNumber}`);
  doc.text(`Date: ${new Date(generatedAt).toLocaleDateString("en-IN")}`);
  doc.text(`Tax jurisdiction: ${taxJurisdiction === "inter_state" ? "Inter-state (IGST)" : "Intra-state (CGST + SGST)"}`);
  doc.moveDown(0.8);

  const colY = doc.y;
  doc.fillColor("#111").fontSize(11).text("Billed From", 50, colY);
  doc.fillColor("#111").fontSize(11).text("Billed To", 320, colY);
  doc.fontSize(9).fillColor("#333");
  doc.text(
    [billedFrom.name, billedFrom.address, [billedFrom.city, billedFrom.state, billedFrom.pincode].filter(Boolean).join(", "), billedFrom.gstin ? `GSTIN: ${billedFrom.gstin}` : ""]
      .filter(Boolean)
      .join("\n"),
    50,
    colY + 16,
    { width: 240 },
  );
  doc.text(
    [billedTo.name, billedTo.address, [billedTo.city, billedTo.state, billedTo.pincode].filter(Boolean).join(", ")]
      .filter(Boolean)
      .join("\n"),
    320,
    colY + 16,
    { width: 220 },
  );
  doc.moveDown(4);
  doc.fillColor("#111");
}

function drawLineItemsTable(doc, lineItems, jurisdiction) {
  const startX = 50;
  let y = doc.y + 10;
  const showSplit = jurisdiction !== "inter_state";
  const headers = showSplit
    ? ["Item", "Qty", "Rate", "GST%", "CGST", "SGST", "Total"]
    : ["Item", "Qty", "Rate", "GST%", "IGST", "Total"];
  const widths = showSplit ? [140, 35, 55, 40, 55, 55, 70] : [160, 40, 60, 45, 65, 80];

  doc.fontSize(9).fillColor("#fff").rect(startX, y, widths.reduce((a, b) => a + b, 0), 18).fill("#334155");
  let x = startX;
  doc.fillColor("#fff");
  headers.forEach((h, i) => {
    doc.text(h, x + 4, y + 5, { width: widths[i] - 4 });
    x += widths[i];
  });
  y += 18;
  doc.fillColor("#111");

  lineItems.forEach((item, idx) => {
    if (y > 700) {
      doc.addPage();
      y = 50;
    }
    const rowBg = idx % 2 === 0 ? "#f8fafc" : "#ffffff";
    doc.rect(startX, y, widths.reduce((a, b) => a + b, 0), 16).fill(rowBg);
    doc.fillColor("#111").fontSize(8);
    x = startX;
    const cells = showSplit
      ? [item.name, String(item.quantity), `Rs.${item.unitPrice}`, `${item.gstSlab}%`, `Rs.${item.cgst}`, `Rs.${item.sgst}`, `Rs.${item.lineTotal}`]
      : [item.name, String(item.quantity), `Rs.${item.unitPrice}`, `${item.gstSlab}%`, `Rs.${item.igst}`, `Rs.${item.lineTotal}`];
    cells.forEach((c, i) => {
      doc.text(String(c).slice(0, 40), x + 4, y + 4, { width: widths[i] - 4 });
      x += widths[i];
    });
    y += 16;
  });

  doc.y = y + 10;
}

function drawTotals(doc, breakdown) {
  const startX = 350;
  doc.fontSize(10).fillColor("#111");
  const charges = breakdown.charges || {};
  const rows = [
    ["Subtotal", breakdown.subtotal],
    // Each non-tax charge gets its own labeled row — only when actually
    // charged, so a zero-charge order's invoice doesn't grow a wall of
    // "Rs. 0.00" rows.
    charges.deliveryFee > 0 ? ["Delivery Fee", charges.deliveryFee] : null,
    charges.handlingFee > 0 ? ["Handling Fee", charges.handlingFee] : null,
    charges.packingFee > 0 ? ["Packing Fee", charges.packingFee] : null,
    charges.packagingCharge > 0 ? ["Packaging Charge", charges.packagingCharge] : null,
    charges.oddHourSurcharge > 0 ? ["Odd-Hour Surcharge", charges.oddHourSurcharge] : null,
    charges.weatherSurcharge > 0 ? ["Weather Surcharge", charges.weatherSurcharge] : null,
    charges.platformSurcharge > 0
      ? [charges.platformSurchargeReason ? `Platform Charge (${charges.platformSurchargeReason})` : "Platform Charge", charges.platformSurcharge]
      : null,
    breakdown.taxJurisdiction === "inter_state"
      ? ["IGST", breakdown.igstTotal]
      : null,
    breakdown.taxJurisdiction !== "inter_state" ? ["CGST", breakdown.cgstTotal] : null,
    breakdown.taxJurisdiction !== "inter_state" ? ["SGST", breakdown.sgstTotal] : null,
    ["Grand Total", breakdown.grandTotal],
  ].filter(Boolean);

  rows.forEach(([label, value], idx) => {
    const isTotal = idx === rows.length - 1;
    doc.font(isTotal ? "Helvetica-Bold" : "Helvetica").fontSize(isTotal ? 11 : 10);
    doc.text(label, startX, doc.y, { continued: true, width: 120 });
    doc.text(`Rs. ${roundCurrency(value).toFixed(2)}`, { align: "right" });
  });
  doc.font("Helvetica");
}

async function renderInvoicePdfBuffer(payload) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      drawInvoiceHeader(doc, payload);
      drawLineItemsTable(doc, payload.lineItems, payload.taxJurisdiction);
      drawTotals(doc, payload);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

async function buildInvoiceRecord(order, type) {
  const breakdown = order.paymentBreakdown || {};
  const [store, customer, platformSettings] = await Promise.all([
    Store.findById(order.seller).select("shopName address city state pincode gstNumber").lean(),
    Customer.findById(order.customer).select("name email phone").lean(),
    Setting.findOne().select("companyName address taxId").lean(),
  ]);

  const billedFrom = {
    name: store?.shopName || "Seller",
    address: store?.address || "",
    city: store?.city || "",
    state: store?.state || "",
    pincode: store?.pincode || "",
    gstin: store?.gstNumber || "",
  };
  const billedTo = {
    name: order.address?.name || customer?.name || "Customer",
    address: order.address?.address || "",
    city: order.address?.city || "",
    state: order.address?.state || "",
    pincode: "",
  };

  const lineItems = (breakdown.lineItems || []).map((item) => ({
    productId: item.productId,
    name: item.productName,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    itemSubtotal: item.itemSubtotal,
    gstSlab: item.gstSlab || 0,
    cgst: item.cgst || 0,
    sgst: item.sgst || 0,
    igst: item.igst || 0,
    lineTotal: roundCurrency((item.itemSubtotal || 0) + (item.lineTax || 0)),
  }));

  const charges = {
    deliveryFee: roundCurrency(breakdown.deliveryFeeCharged || 0),
    handlingFee: roundCurrency(breakdown.handlingFeeCharged || 0),
    packingFee: roundCurrency(breakdown.packingFeeCharged || 0),
    packagingCharge: roundCurrency(breakdown.packagingChargeAmount || 0),
    oddHourSurcharge: roundCurrency(breakdown.oddHourSurchargeAmount || 0),
    weatherSurcharge: roundCurrency(breakdown.weatherSurchargeAmount || 0),
    platformSurcharge: roundCurrency(breakdown.customerSurchargeAmount || 0),
    platformSurchargeReason: breakdown.customerSurchargeReason || "",
  };

  return {
    order,
    type,
    billedFrom,
    billedTo,
    lineItems,
    subtotal: breakdown.productSubtotal || 0,
    cgstTotal: breakdown.cgstTotal || 0,
    sgstTotal: breakdown.sgstTotal || 0,
    igstTotal: breakdown.igstTotal || 0,
    taxTotal: breakdown.taxTotal || 0,
    charges,
    grandTotal: breakdown.grandTotal || 0,
    taxJurisdiction: breakdown.taxJurisdiction || "intra_state",
    platformCompanyName: platformSettings?.companyName || "",
  };
}

async function generateAndStoreInvoice(order, type) {
  const existing = await Invoice.findOne({ order: order._id, type }).lean();
  if (existing) return existing;

  const record = await buildInvoiceRecord(order, type);
  const invoiceNumber = await nextInvoiceNumber(type, order.deliveredAt || new Date());

  const pdfPayload = {
    title: type === INVOICE_TYPE.SELLER ? "Seller Tax Invoice" : "Tax Invoice",
    invoiceNumber,
    generatedAt: new Date(),
    billedFrom: type === INVOICE_TYPE.SELLER
      ? { name: record.platformCompanyName || "Platform", address: "", city: "", state: "", pincode: "", gstin: "" }
      : record.billedFrom,
    billedTo: type === INVOICE_TYPE.SELLER ? record.billedFrom : record.billedTo,
    lineItems: record.lineItems,
    subtotal: record.subtotal,
    cgstTotal: record.cgstTotal,
    sgstTotal: record.sgstTotal,
    igstTotal: record.igstTotal,
    charges: record.charges,
    grandTotal: record.grandTotal,
    taxJurisdiction: record.taxJurisdiction,
  };

  const pdfBuffer = await renderInvoicePdfBuffer(pdfPayload);
  const { publicId, url } = await uploadRawToCloudinary(pdfBuffer, "invoices");

  const invoice = await Invoice.create({
    invoiceNumber,
    order: order._id,
    orderId: order.orderId,
    type,
    seller: order.seller,
    customer: order.customer,
    billedTo: pdfPayload.billedTo,
    billedFrom: pdfPayload.billedFrom,
    lineItems: record.lineItems,
    taxJurisdiction: record.taxJurisdiction,
    subtotal: record.subtotal,
    cgstTotal: record.cgstTotal,
    sgstTotal: record.sgstTotal,
    igstTotal: record.igstTotal,
    taxTotal: record.taxTotal,
    charges: record.charges,
    grandTotal: record.grandTotal,
    pdfUrl: url, // stored for reference/debug only — not used for delivery, see getSignedRawUrl
    pdfPublicId: publicId,
  });

  return invoice;
}

/**
 * Generate both customer and seller invoices for a delivered order.
 * Safe to call multiple times — existing invoices are returned as-is.
 * Intended to be called fire-and-forget after delivery settlement commits;
 * failures are logged by the caller and never block order delivery.
 */
export async function generateOrderInvoices(orderOrId) {
  const order = typeof orderOrId === "object" && orderOrId?._id
    ? orderOrId
    : await Order.findById(orderOrId);
  if (!order) return null;

  const [customerInvoice, sellerInvoice] = await Promise.all([
    generateAndStoreInvoice(order, INVOICE_TYPE.CUSTOMER),
    generateAndStoreInvoice(order, INVOICE_TYPE.SELLER),
  ]);

  return { customerInvoice, sellerInvoice };
}

export async function getInvoiceForOrder(orderId, type) {
  const order = await Order.findOne({ orderId }).select("_id").lean();
  if (!order) return null;
  const invoice = await Invoice.findOne({ order: order._id, type }).lean();
  if (!invoice) return null;
  return {
    ...invoice,
    // Signed on every read — the stored pdfUrl is a public link Cloudinary's
    // restricted-media-types setting will 401 on; this one actually works.
    pdfUrl: invoice.pdfPublicId ? getSignedRawUrl(invoice.pdfPublicId) : invoice.pdfUrl,
  };
}
