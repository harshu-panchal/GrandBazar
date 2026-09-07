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

// Small in-memory cache so generating the customer + seller invoice for the
// same order doesn't fetch the same admin-configured logo twice.
let cachedLogo = { url: null, buffer: null };

async function fetchLogoBuffer(url) {
  if (!url) return null;
  if (cachedLogo.url === url) return cachedLogo.buffer;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    cachedLogo = { url, buffer };
    return buffer;
  } catch (error) {
    console.error("[invoiceService] Failed to fetch platform logo:", error.message);
    return null;
  }
}

/**
 * Render clean, 1-page professional GST Tax Invoice PDF.
 */
async function renderInvoicePdfBuffer(payload) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 36, size: "A4", autoFirstPage: true });
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const startX = 36;
      const pageWidth = doc.page.width - 72; // 595.28 - 72 = 523.28

      // Top Dark Header Banner
      doc.rect(0, 0, doc.page.width, 55).fill("#0f172a");

      let nameX = startX;
      if (payload.platformLogoBuffer) {
        try {
          doc.image(payload.platformLogoBuffer, startX, 9, { fit: [38, 38] });
          nameX = startX + 46;
        } catch (imgError) {
          // Unsupported/corrupt image data — fall back to text-only header.
        }
      }
      doc.fillColor("#ffffff").fontSize(18).font("Helvetica-Bold").text(
        payload.platformCompanyName || "ZINTO",
        nameX,
        14,
        { width: 300 - (nameX - startX) }
      );
      doc.fontSize(13).font("Helvetica-Bold").text(
        payload.title || "TAX INVOICE",
        doc.page.width - startX - 180,
        14,
        { align: "right", width: 180 }
      );
      doc.fontSize(8.5).font("Helvetica").fillColor("#94a3b8").text(
        payload.platformTaxId ? `GSTIN: ${payload.platformTaxId}` : "Original for Recipient",
        doc.page.width - startX - 220,
        34,
        { align: "right", width: 220 }
      );

      let y = 68;

      // Order Meta Information Card
      doc.rect(startX, y, pageWidth, 38).fillAndStroke("#f8fafc", "#e2e8f0");
      doc.fillColor("#475569").fontSize(8).font("Helvetica-Bold");
      doc.text("INVOICE NO:", startX + 10, y + 6);
      doc.text("INVOICE DATE:", startX + 135, y + 6);
      doc.text("ORDER ID:", startX + 250, y + 6);
      doc.text("PAYMENT MODE:", startX + 370, y + 6);

      doc.fillColor("#0f172a").fontSize(9).font("Helvetica-Bold");
      doc.text(payload.invoiceNumber || "N/A", startX + 10, y + 19);
      doc.text(
        payload.generatedAt
          ? new Date(payload.generatedAt).toLocaleDateString("en-IN")
          : new Date().toLocaleDateString("en-IN"),
        startX + 135,
        y + 19
      );
      doc.text(payload.orderId || "N/A", startX + 250, y + 19);
      doc.text(String(payload.paymentMethod || "ONLINE").toUpperCase(), startX + 370, y + 19);

      y += 48;

      // Billed From (Seller) & Billed To (Customer) Cards
      const boxW = (pageWidth - 12) / 2;
      doc.rect(startX, y, boxW, 72).fillAndStroke("#ffffff", "#cbd5e1");
      doc.rect(startX + boxW + 12, y, boxW, 72).fillAndStroke("#ffffff", "#cbd5e1");

      const billedFrom = payload.billedFrom || {};
      const billedTo = payload.billedTo || {};

      doc.fillColor("#0f172a").fontSize(9.5).font("Helvetica-Bold").text("Billed From (Seller):", startX + 8, y + 6);
      doc.fillColor("#334155").fontSize(8).font("Helvetica").text(
        [
          billedFrom.name || "Seller",
          billedFrom.address,
          [billedFrom.city, billedFrom.state, billedFrom.pincode].filter(Boolean).join(", "),
          billedFrom.gstin ? `GSTIN: ${billedFrom.gstin}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        startX + 8,
        y + 19,
        { width: boxW - 16, height: 48, lineBreak: true }
      );

      doc.fillColor("#0f172a").fontSize(9.5).font("Helvetica-Bold").text("Billed To (Customer):", startX + boxW + 20, y + 6);
      doc.fillColor("#334155").fontSize(8).font("Helvetica").text(
        [
          billedTo.name || "Customer",
          billedTo.address,
          [billedTo.city, billedTo.state, billedTo.pincode].filter(Boolean).join(", "),
          billedTo.phone ? `Phone: ${billedTo.phone}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        startX + boxW + 20,
        y + 19,
        { width: boxW - 16, height: 48, lineBreak: true }
      );

      y += 82;

      // Itemized Table Header
      const isInterState = payload.taxJurisdiction === "inter_state";
      const cols = isInterState
        ? [
            { name: "#", w: 22, align: "left" },
            { name: "Item Description", w: 180, align: "left" },
            { name: "Qty", w: 32, align: "center" },
            { name: "Rate", w: 60, align: "right" },
            { name: "GST", w: 42, align: "right" },
            { name: "IGST", w: 60, align: "right" },
            { name: "Total (Rs)", w: 77, align: "right" },
          ]
        : [
            { name: "#", w: 22, align: "left" },
            { name: "Item Description", w: 165, align: "left" },
            { name: "Qty", w: 30, align: "center" },
            { name: "Rate", w: 55, align: "right" },
            { name: "GST%", w: 40, align: "right" },
            { name: "CGST", w: 55, align: "right" },
            { name: "SGST", w: 55, align: "right" },
            { name: "Total (Rs)", w: 71, align: "right" },
          ];

      doc.rect(startX, y, pageWidth, 20).fill("#1e293b");
      let cx = startX;
      doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold");
      cols.forEach((c) => {
        doc.text(c.name, cx + 3, y + 6, { width: c.w - 6, align: c.align, lineBreak: false });
        cx += c.w;
      });

      y += 20;

      // Table Line Items
      const lineItems = Array.isArray(payload.lineItems) ? payload.lineItems : [];
      lineItems.forEach((item, idx) => {
        if (y > 660) {
          doc.addPage();
          y = 36;
        }

        const bg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
        doc.rect(startX, y, pageWidth, 18).fillAndStroke(bg, "#f1f5f9");

        cx = startX;
        doc.fillColor("#0f172a").fontSize(8).font("Helvetica");

        const qty = item.quantity || 1;
        const rate = item.unitPrice || 0;
        const total = item.lineTotal || (item.itemSubtotal || 0) + (item.lineTax || 0);

        const cells = isInterState
          ? [
              String(idx + 1),
              String(item.name || "Item").slice(0, 38),
              String(qty),
              `Rs.${roundCurrency(rate).toFixed(2)}`,
              `${item.gstSlab || 0}%`,
              `Rs.${roundCurrency(item.igst || 0).toFixed(2)}`,
              `Rs.${roundCurrency(total).toFixed(2)}`,
            ]
          : [
              String(idx + 1),
              String(item.name || "Item").slice(0, 35),
              String(qty),
              `Rs.${roundCurrency(rate).toFixed(2)}`,
              `${item.gstSlab || 0}%`,
              `Rs.${roundCurrency(item.cgst || 0).toFixed(2)}`,
              `Rs.${roundCurrency(item.sgst || 0).toFixed(2)}`,
              `Rs.${roundCurrency(total).toFixed(2)}`,
            ];

        cells.forEach((val, cIdx) => {
          const col = cols[cIdx];
          doc.text(val, cx + 3, y + 5, { width: col.w - 6, align: col.align, lineBreak: false });
          cx += col.w;
        });

        y += 18;
      });

      doc.y = y;
      y += 12;

      if (y > 640) {
        doc.addPage();
        y = 36;
      }

      // Summary & Tax Breakdown Footer
      const summaryW = 230;
      const leftW = pageWidth - summaryW - 12;
      const charges = payload.charges || {};

      // Left Box: GST Tax Details & Terms
      doc.rect(startX, y, leftW, 128).fillAndStroke("#f8fafc", "#cbd5e1");
      doc.fillColor("#0f172a").fontSize(9).font("Helvetica-Bold").text("GST Tax Summary:", startX + 8, y + 6);
      doc.fillColor("#334155").fontSize(8).font("Helvetica");

      if (isInterState) {
        doc.text(`IGST Total Tax: Rs. ${roundCurrency(payload.igstTotal || 0).toFixed(2)}`, startX + 8, y + 20);
      } else {
        doc.text(
          `CGST Tax Total: Rs. ${roundCurrency(payload.cgstTotal || 0).toFixed(2)}\n` +
          `SGST Tax Total: Rs. ${roundCurrency(payload.sgstTotal || 0).toFixed(2)}\n` +
          `Total Tax Liability: Rs. ${roundCurrency((payload.cgstTotal || 0) + (payload.sgstTotal || 0)).toFixed(2)}`,
          startX + 8,
          y + 20
        );
      }

      doc.fillColor("#0f172a").fontSize(8.5).font("Helvetica-Bold").text("Payment Status:", startX + 8, y + 64);
      doc.fillColor("#16a34a").fontSize(8.5).font("Helvetica-Bold").text(
        payload.paymentMethod === "cod" ? "PAYMENT DUE (CASH ON DELIVERY)" : "PAID IN FULL",
        startX + 80,
        y + 64
      );

      doc.fillColor("#0f172a").fontSize(8).font("Helvetica-Bold").text("Terms & Notes:", startX + 8, y + 80);
      doc.fillColor("#64748b").fontSize(7.5).font("Helvetica").text(
        "1. All taxes are collected & remitted as per GST regulations.\n" +
        "2. This is an electronically generated tax invoice requiring no physical signature.",
        startX + 8,
        y + 92,
        { width: leftW - 16 }
      );

      // Right Box: Price Breakdown Table
      doc.rect(startX + leftW + 12, y, summaryW, 128).fillAndStroke("#ffffff", "#cbd5e1");

      const summaryRows = [
        ["Items Subtotal:", `Rs. ${roundCurrency(payload.subtotal || 0).toFixed(2)}`],
        charges.deliveryFee > 0 ? ["Delivery Fee:", `Rs. ${roundCurrency(charges.deliveryFee).toFixed(2)}`] : null,
        charges.handlingFee > 0 ? ["Handling Fee:", `Rs. ${roundCurrency(charges.handlingFee).toFixed(2)}`] : null,
        charges.packingFee > 0 ? ["Packing Fee:", `Rs. ${roundCurrency(charges.packingFee).toFixed(2)}`] : null,
        charges.packagingCharge > 0 ? ["Packaging Charge:", `Rs. ${roundCurrency(charges.packagingCharge).toFixed(2)}`] : null,
        charges.oddHourSurcharge > 0 ? ["Odd-Hour Surge:", `Rs. ${roundCurrency(charges.oddHourSurcharge).toFixed(2)}`] : null,
        charges.weatherSurcharge > 0 ? ["Weather Surge:", `Rs. ${roundCurrency(charges.weatherSurcharge).toFixed(2)}`] : null,
        charges.platformSurcharge > 0 ? ["Platform Charge:", `Rs. ${roundCurrency(charges.platformSurcharge).toFixed(2)}`] : null,
        charges.discount > 0 ? ["Discount Saved:", `-Rs. ${roundCurrency(charges.discount).toFixed(2)}`] : null,
        ["Total GST Tax:", `Rs. ${roundCurrency((payload.cgstTotal || 0) + (payload.sgstTotal || 0) + (payload.igstTotal || 0)).toFixed(2)}`],
      ].filter(Boolean);

      let sy = y + 6;
      summaryRows.forEach(([lbl, val]) => {
        doc.fillColor("#475569").fontSize(8).font("Helvetica").text(lbl, startX + leftW + 18, sy);
        doc.fillColor("#0f172a").fontSize(8).font("Helvetica-Bold").text(val, startX + leftW + 12 + summaryW - 90, sy, {
          align: "right",
          width: 82,
        });
        sy += 11;
      });

      // Grand Total Highlight Bar
      doc.rect(startX + leftW + 12, y + 104, summaryW, 24).fill("#0f172a");
      doc.fillColor("#ffffff").fontSize(9.5).font("Helvetica-Bold").text("Grand Total:", startX + leftW + 18, y + 110);
      doc.fillColor("#ffffff").fontSize(10.5).font("Helvetica-Bold").text(
        `Rs. ${roundCurrency(payload.grandTotal || 0).toFixed(2)}`,
        startX + leftW + 12 + summaryW - 100,
        y + 109,
        { align: "right", width: 92 }
      );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

async function buildInvoiceRecord(order, type) {
  const breakdown = order.paymentBreakdown || {};
  const pricing = order.pricing || {};

  const [store, customer, platformSettings] = await Promise.all([
    Store.findById(order.seller).select("shopName address city state pincode gstNumber").lean(),
    Customer.findById(order.customer).select("name email phone").lean(),
    Setting.findOne().select("companyName address taxId logoUrl").lean(),
  ]);

  const billedFrom = {
    name: store?.shopName || "Seller Store",
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
    pincode: order.address?.pincode || "",
    phone: order.address?.phone || customer?.phone || "",
  };

  // Line items fallback if paymentBreakdown.lineItems is empty
  let lineItems = (breakdown.lineItems || []).map((item) => ({
    productId: item.productId,
    name: item.productName || item.name,
    quantity: item.quantity || 1,
    unitPrice: item.unitPrice || 0,
    itemSubtotal: item.itemSubtotal || 0,
    gstSlab: item.gstSlab || 0,
    cgst: item.cgst || 0,
    sgst: item.sgst || 0,
    igst: item.igst || 0,
    lineTotal: roundCurrency((item.itemSubtotal || 0) + (item.lineTax || 0)),
  }));

  if (lineItems.length === 0 && Array.isArray(order.items) && order.items.length > 0) {
    const isInterState = breakdown.taxJurisdiction === "inter_state";
    lineItems = order.items.map((item) => {
      const qty = Number(item.quantity) || 1;
      const price = Number(item.price) || 0;
      const sub = price * qty;
      const gstRate = Number(item.gstRate || item.gst || 0);
      const totalTax = roundCurrency((sub * gstRate) / 100);
      const cgst = isInterState ? 0 : roundCurrency(totalTax / 2);
      const sgst = isInterState ? 0 : roundCurrency(totalTax / 2);
      const igst = isInterState ? totalTax : 0;
      return {
        productId: item.productId || item.product,
        name: item.name || item.title || "Product",
        quantity: qty,
        unitPrice: price,
        itemSubtotal: sub,
        gstSlab: gstRate,
        cgst,
        sgst,
        igst,
        lineTotal: roundCurrency(sub + totalTax),
      };
    });
  }

  const charges = {
    deliveryFee: roundCurrency(breakdown.deliveryFeeCharged ?? pricing.deliveryFee ?? 0),
    handlingFee: roundCurrency(breakdown.handlingFeeCharged ?? pricing.handlingFee ?? 0),
    packingFee: roundCurrency(breakdown.packingFeeCharged ?? pricing.packingFee ?? 0),
    packagingCharge: roundCurrency(breakdown.packagingChargeAmount ?? 0),
    oddHourSurcharge: roundCurrency(breakdown.oddHourSurchargeAmount ?? 0),
    weatherSurcharge: roundCurrency(breakdown.weatherSurchargeAmount ?? 0),
    platformSurcharge: roundCurrency(breakdown.customerSurchargeAmount ?? 0),
    platformSurchargeReason: breakdown.customerSurchargeReason || "",
    discount: roundCurrency(breakdown.discountAmount ?? pricing.discount ?? 0),
  };

  const subtotal = roundCurrency(
    breakdown.productSubtotal ?? pricing.subtotal ?? lineItems.reduce((acc, item) => acc + (item.itemSubtotal || 0), 0)
  );
  const cgstTotal = roundCurrency(
    breakdown.cgstTotal ?? lineItems.reduce((acc, item) => acc + (item.cgst || 0), 0)
  );
  const sgstTotal = roundCurrency(
    breakdown.sgstTotal ?? lineItems.reduce((acc, item) => acc + (item.sgst || 0), 0)
  );
  const igstTotal = roundCurrency(
    breakdown.igstTotal ?? lineItems.reduce((acc, item) => acc + (item.igst || 0), 0)
  );
  const taxTotal = roundCurrency(breakdown.taxTotal ?? pricing.gst ?? (cgstTotal + sgstTotal + igstTotal));
  const grandTotal = roundCurrency(breakdown.grandTotal ?? pricing.total ?? (subtotal + taxTotal));

  return {
    order,
    type,
    billedFrom,
    billedTo,
    lineItems,
    subtotal,
    cgstTotal,
    sgstTotal,
    igstTotal,
    taxTotal,
    charges,
    grandTotal,
    paymentMethod: order.paymentMethod || order.paymentMode || "ONLINE",
    taxJurisdiction: breakdown.taxJurisdiction || "intra_state",
    platformCompanyName: platformSettings?.companyName || "Zinto",
    platformTaxId: platformSettings?.taxId || "",
    platformLogoUrl: platformSettings?.logoUrl || "",
  };
}

export async function generateAndStoreInvoice(order, type, forceRegenerate = false) {
  const existing = await Invoice.findOne({ order: order._id, type }).lean();
  if (existing && !forceRegenerate && existing.pdfVersion === 2) return existing;

  const record = await buildInvoiceRecord(order, type);
  const invoiceNumber = existing?.invoiceNumber || (await nextInvoiceNumber(type, order.deliveredAt || new Date()));
  const logoBuffer = await fetchLogoBuffer(record.platformLogoUrl);

  const pdfPayload = {
    title: type === INVOICE_TYPE.SELLER ? "Seller Tax Invoice" : "Tax Invoice",
    invoiceNumber,
    orderId: order.orderId,
    generatedAt: existing?.createdAt || new Date(),
    paymentMethod: record.paymentMethod,
    platformCompanyName: record.platformCompanyName,
    platformTaxId: record.platformTaxId,
    platformLogoBuffer: logoBuffer,
    billedFrom: type === INVOICE_TYPE.SELLER
      ? {
          name: record.platformCompanyName || "Zinto",
          address: "",
          city: "",
          state: "",
          pincode: "",
          gstin: record.platformTaxId || "",
        }
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

  if (existing) {
    const updated = await Invoice.findByIdAndUpdate(
      existing._id,
      {
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
        pdfUrl: url,
        pdfPublicId: publicId,
        pdfVersion: 2,
      },
      { new: true }
    ).lean();
    return updated;
  }

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
    pdfUrl: url,
    pdfPublicId: publicId,
    pdfVersion: 2,
  });

  return invoice;
}

export async function generateOrderInvoices(orderOrId, forceRegenerate = false) {
  // Mongoose ObjectId instances expose a self-referential `_id` getter, so a
  // naive `orderOrId?._id` truthiness check mistakes a bare ObjectId for an
  // already-loaded order document and skips the re-fetch below, building the
  // invoice from an object with every field undefined. Only trust an actual
  // Order document (or plain object with real order fields).
  const order = orderOrId instanceof Order
    ? orderOrId
    : await Order.findById(orderOrId);
  if (!order) return null;

  const [customerInvoice, sellerInvoice] = await Promise.all([
    generateAndStoreInvoice(order, INVOICE_TYPE.CUSTOMER, forceRegenerate),
    generateAndStoreInvoice(order, INVOICE_TYPE.SELLER, forceRegenerate),
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
    pdfUrl: invoice.pdfPublicId ? getSignedRawUrl(invoice.pdfPublicId) : invoice.pdfUrl,
  };
}
