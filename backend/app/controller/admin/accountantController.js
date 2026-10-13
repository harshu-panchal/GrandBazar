import handleResponse from "../../utils/helper.js";
import { getAccountantOverview, getOrdersGmv } from "../../services/finance/accountantService.js";
import { buildExcelBuffer } from "../../utils/excelExport.js";

export const getAccountantOverviewController = async (req, res) => {
  try {
    const { from, to } = req.query;
    const result = await getAccountantOverview({ from, to });
    return handleResponse(res, 200, "Accountant overview fetched successfully", result);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getOrdersGmvController = async (req, res) => {
  try {
    const { from, to, page, limit, sellerId, status } = req.query;
    const result = await getOrdersGmv({ from, to, page, limit, sellerId, status });
    return handleResponse(res, 200, "Orders/GMV fetched successfully", result);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

const ORDERS_GMV_COLUMNS = [
  { header: "Order ID", key: "orderId", width: 16 },
  { header: "Date", key: "date", width: 14 },
  { header: "Seller", key: "seller", width: 20 },
  { header: "Customer", key: "customer", width: 20 },
  { header: "Product", key: "product", width: 28 },
  { header: "Taxable", key: "taxable", width: 12 },
  { header: "GST", key: "gst", width: 10 },
  { header: "Delivery", key: "delivery", width: 10 },
  { header: "Weather", key: "weather", width: 10 },
  { header: "Packing", key: "packing", width: 10 },
  { header: "Gross", key: "gross", width: 12 },
  { header: "Refund", key: "refund", width: 10 },
  { header: "Net", key: "net", width: 12 },
];

export const exportOrdersGmvController = async (req, res) => {
  try {
    const { from, to, sellerId, status } = req.query;
    const { items } = await getOrdersGmv({ from, to, sellerId, status, page: 1, limit: 10000 });
    const rows = items.map((row) => ({
      ...row,
      date: row.date ? new Date(row.date).toLocaleDateString("en-IN") : "",
    }));
    const buffer = await buildExcelBuffer({ sheetName: "Orders-GMV", columns: ORDERS_GMV_COLUMNS, rows });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="orders-gmv.xlsx"');
    return res.send(buffer);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
