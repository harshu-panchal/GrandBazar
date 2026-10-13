import handleResponse from "../../utils/helper.js";
import {
  getGstTcsSummary,
  listTaxFilingRecords,
  upsertTaxFilingRecord,
  deleteTaxFilingRecord,
} from "../../services/finance/gstTcsService.js";

export const getGstTcsSummaryController = async (req, res) => {
  try {
    const { month } = req.query;
    const result = await getGstTcsSummary({ month });
    return handleResponse(res, 200, "GST/TCS summary fetched successfully", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const getTaxFilingRecordsController = async (req, res) => {
  try {
    const { period } = req.query;
    const result = await listTaxFilingRecords({ period });
    return handleResponse(res, 200, "Filing records fetched successfully", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const upsertTaxFilingRecordController = async (req, res) => {
  try {
    const record = await upsertTaxFilingRecord(req.body || {}, req.user.id);
    return handleResponse(res, 200, "Filing record saved successfully", record);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const deleteTaxFilingRecordController = async (req, res) => {
  try {
    const { id } = req.params;
    await deleteTaxFilingRecord(id);
    return handleResponse(res, 200, "Filing record deleted successfully");
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};
