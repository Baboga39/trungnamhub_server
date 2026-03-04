import ExcelJS from "exceljs";

/**
 * Hàm tạo file Excel có style, hỗ trợ schema linh hoạt
 * @param {Array<Object>} data - dữ liệu (mảng object)
 * @param {String} sheetName - tên sheet
 * @param {Object} schema - { columns: [{ field, header }], hiddenColumns }
 */
export async function createStyledExcelBuffer(data, sheetName, schema = {}) {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Dữ liệu trống hoặc không hợp lệ");
  }

  const { columns = [], hiddenColumns = [] } = schema;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName || "Báo cáo");

  // ✅ Nếu schema có columns → dùng đúng thứ tự đó
  // Nếu không có → tự động sinh từ data
  const effectiveColumns =
    columns.length > 0
      ? columns.filter((col) => !hiddenColumns.includes(col.field))
      : Object.keys(data[0])
          .filter((key) => !hiddenColumns.includes(key))
          .map((key) => ({ field: key, header: key.toUpperCase() }));

  //  Định nghĩa cột trong worksheet
  worksheet.columns = effectiveColumns.map((col) => ({
    header: col.header,
    key: col.field,
    width: 20,
  }));

  //  Header style
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2563EB" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "thin", color: { argb: "FFDDDDDD" } },
      left: { style: "thin", color: { argb: "FFDDDDDD" } },
      bottom: { style: "thin", color: { argb: "FFDDDDDD" } },
      right: { style: "thin", color: { argb: "FFDDDDDD" } },
    };
  });

  // 🧩 Thêm data rows
  data.forEach((row) => {
    const newRow = {};
    effectiveColumns.forEach((col) => {
      let value = row[col.field];
      if (value instanceof Date) {
        value = new Intl.DateTimeFormat("vi-VN", {
          dateStyle: "short",
          timeStyle: "short",
        }).format(value);
      }
      newRow[col.field] = value;
    });
    worksheet.addRow(newRow);
  });

  //  Style nội dung
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
    });
  });

  //  Auto fit width
  worksheet.columns.forEach((col) => {
    let maxLength = 10;
    col.eachCell({ includeEmpty: true }, (cell) => {
      const v = cell.value ? cell.value.toString() : "";
      maxLength = Math.max(maxLength, v.length + 2);
    });
    col.width = Math.min(maxLength, 40);
  });

  worksheet.views = [{ state: "frozen", ySplit: 1 }];

  return await workbook.xlsx.writeBuffer();
}
