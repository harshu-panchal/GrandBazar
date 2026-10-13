import archiver from "archiver";
import handleResponse from "../../utils/helper.js";
import {
  listExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpensesForExport,
} from "../../services/finance/expenseService.js";
import { buildExcelBuffer } from "../../utils/excelExport.js";
import { ALL_EXPENSE_CATEGORIES } from "../../models/expense.js";

export const getExpensesController = async (req, res) => {
  try {
    const { from, to, month, category, page, limit } = req.query;
    const result = await listExpenses({ from, to, month, category, page, limit });
    return handleResponse(res, 200, "Expenses fetched successfully", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const createExpenseController = async (req, res) => {
  try {
    const { category, date, amount, gstAmount, vendor, notes, billUrl } = req.body || {};
    if (!category || !ALL_EXPENSE_CATEGORIES.includes(category)) {
      return handleResponse(res, 400, "A valid expense category is required");
    }
    if (!date) {
      return handleResponse(res, 400, "Expense date is required");
    }
    if (!(Number(amount) > 0)) {
      return handleResponse(res, 400, "Amount must be greater than 0");
    }
    const expense = await createExpense(
      { category, date, amount, gstAmount, vendor, notes, billUrl },
      req.user.id,
    );
    return handleResponse(res, 201, "Expense recorded successfully", expense);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const updateExpenseController = async (req, res) => {
  try {
    const { id } = req.params;
    const expense = await updateExpense(id, req.body || {});
    return handleResponse(res, 200, "Expense updated successfully", expense);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const deleteExpenseController = async (req, res) => {
  try {
    const { id } = req.params;
    await deleteExpense(id);
    return handleResponse(res, 200, "Expense deleted successfully");
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

const EXPENSE_COLUMNS = [
  { header: "Date", key: "date", width: 14 },
  { header: "Category", key: "category", width: 18 },
  { header: "Vendor", key: "vendor", width: 22 },
  { header: "Amount", key: "amount", width: 14 },
  { header: "GST", key: "gstAmount", width: 12 },
  { header: "Notes", key: "notes", width: 30 },
  { header: "Bill", key: "billStatus", width: 14 },
];

function toExcelRows(expenses) {
  return expenses.map((e) => ({
    date: e.date ? new Date(e.date).toLocaleDateString("en-IN") : "",
    category: e.category,
    vendor: e.vendor || "",
    amount: e.amount,
    gstAmount: e.gstAmount,
    notes: e.notes || "",
    billStatus: e.billUrl ? "Attached" : "Missing",
  }));
}

export const exportExpensesExcelController = async (req, res) => {
  try {
    const { from, to, month, category } = req.query;
    const expenses = await getExpensesForExport({ from, to, month, category });
    const buffer = await buildExcelBuffer({
      sheetName: "Expenses",
      columns: EXPENSE_COLUMNS,
      rows: toExcelRows(expenses),
    });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="expenses.xlsx"');
    return res.send(buffer);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

// "Expense report + bills (ZIP)" from the reference mock: the Excel report
// plus every attached bill file, fetched from Cloudinary and bundled into
// one archive. A missing bill just means that expense's file is skipped —
// its "Bill Missing" status is already visible in the Excel sheet.
export const exportExpensesZipController = async (req, res) => {
  try {
    const { from, to, month, category } = req.query;
    const expenses = await getExpensesForExport({ from, to, month, category });
    const excelBuffer = await buildExcelBuffer({
      sheetName: "Expenses",
      columns: EXPENSE_COLUMNS,
      rows: toExcelRows(expenses),
    });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="expense-report.zip"');

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err) => {
      throw err;
    });
    archive.pipe(res);
    archive.append(excelBuffer, { name: "expenses.xlsx" });

    for (const expense of expenses) {
      if (!expense.billUrl) continue;
      try {
        const response = await fetch(expense.billUrl);
        if (!response.ok) continue;
        const arrayBuffer = await response.arrayBuffer();
        const ext = expense.billUrl.split(".").pop().split("?")[0] || "pdf";
        const dateLabel = expense.date ? new Date(expense.date).toISOString().slice(0, 10) : "bill";
        archive.append(Buffer.from(arrayBuffer), {
          name: `bills/${dateLabel}_${expense.vendor || expense._id}.${ext}`,
        });
      } catch {
        // Skip bills that fail to fetch rather than aborting the whole export.
      }
    }

    await archive.finalize();
  } catch (error) {
    if (!res.headersSent) {
      return handleResponse(res, 500, error.message);
    }
    res.end();
  }
};
