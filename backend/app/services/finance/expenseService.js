import Expense from "../../models/expense.js";
import { roundCurrency } from "../../utils/money.js";

function dateRange({ from, to, month }) {
  if (month) {
    // "YYYY-MM" -> first/last instant of that calendar month.
    const [year, mon] = String(month).split("-").map(Number);
    if (year && mon) {
      const start = new Date(year, mon - 1, 1);
      const end = new Date(year, mon, 0, 23, 59, 59, 999);
      return { $gte: start, $lte: end };
    }
  }
  const range = {};
  if (from) range.$gte = new Date(from);
  if (to) range.$lte = new Date(to);
  return Object.keys(range).length ? range : null;
}

export async function listExpenses({ from, to, month, category, page = 1, limit = 25 } = {}) {
  const match = {};
  const range = dateRange({ from, to, month });
  if (range) match.date = range;
  if (category) match.category = category;

  const pageSize = Math.max(Number(limit) || 25, 1);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * pageSize;

  const [items, total, totalsAgg] = await Promise.all([
    Expense.find(match).sort({ date: -1 }).skip(skip).limit(pageSize).lean(),
    Expense.countDocuments(match),
    Expense.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" },
          totalGst: { $sum: "$gstAmount" },
          missingBillCount: { $sum: { $cond: [{ $eq: ["$billUrl", ""] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const totals = totalsAgg[0] || {};
  return {
    items,
    total,
    page: Math.max(Number(page) || 1, 1),
    totalPages: Math.max(Math.ceil(total / pageSize), 1),
    totals: {
      totalAmount: roundCurrency(totals.totalAmount || 0),
      totalGst: roundCurrency(totals.totalGst || 0),
      missingBillCount: totals.missingBillCount || 0,
    },
  };
}

export async function createExpense(payload, createdBy) {
  const expense = await Expense.create({
    category: payload.category,
    date: payload.date,
    amount: roundCurrency(payload.amount),
    gstAmount: roundCurrency(payload.gstAmount || 0),
    vendor: payload.vendor?.trim() || "",
    notes: payload.notes?.trim() || "",
    billUrl: payload.billUrl?.trim() || "",
    createdBy,
  });
  return expense;
}

export async function updateExpense(id, payload) {
  const expense = await Expense.findById(id);
  if (!expense) {
    const err = new Error("Expense not found");
    err.statusCode = 404;
    throw err;
  }
  if (payload.category !== undefined) expense.category = payload.category;
  if (payload.date !== undefined) expense.date = payload.date;
  if (payload.amount !== undefined) expense.amount = roundCurrency(payload.amount);
  if (payload.gstAmount !== undefined) expense.gstAmount = roundCurrency(payload.gstAmount);
  if (payload.vendor !== undefined) expense.vendor = payload.vendor.trim();
  if (payload.notes !== undefined) expense.notes = payload.notes.trim();
  if (payload.billUrl !== undefined) expense.billUrl = payload.billUrl.trim();
  await expense.save();
  return expense;
}

export async function deleteExpense(id) {
  const expense = await Expense.findById(id);
  if (!expense) {
    const err = new Error("Expense not found");
    err.statusCode = 404;
    throw err;
  }
  await expense.deleteOne();
}

export async function getExpensesForExport({ from, to, month, category } = {}) {
  const match = {};
  const range = dateRange({ from, to, month });
  if (range) match.date = range;
  if (category) match.category = category;
  return Expense.find(match).sort({ date: -1 }).lean();
}
