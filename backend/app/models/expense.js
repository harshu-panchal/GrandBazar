import mongoose from "mongoose";

const EXPENSE_CATEGORIES = [
  "hosting",
  "marketing",
  "office",
  "salaries",
  "logistics",
  "professional_fees",
  "software",
  "other",
];

const expenseSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: EXPENSE_CATEGORIES,
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    gstAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    vendor: {
      type: String,
      trim: true,
      default: "",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    billUrl: {
      type: String,
      trim: true,
      default: "",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
  },
  { timestamps: true },
);

expenseSchema.index({ date: -1 });
expenseSchema.index({ category: 1, date: -1 });

export const ALL_EXPENSE_CATEGORIES = EXPENSE_CATEGORIES;
export default mongoose.model("Expense", expenseSchema);
