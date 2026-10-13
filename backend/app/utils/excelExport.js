import ExcelJS from "exceljs";

// Builds a single-sheet workbook from a flat column spec + row objects and
// returns it as a Buffer, ready to stream as an attachment. Shared by every
// Accountant export (Orders/GMV, Expenses, GST/TCS, Audit Pack) so each new
// report doesn't reinvent header styling/column widths.
export async function buildExcelBuffer({ sheetName = "Sheet1", columns, rows }) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width || 18,
  }));
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    sheet.addRow(row);
  }

  return workbook.xlsx.writeBuffer();
}
