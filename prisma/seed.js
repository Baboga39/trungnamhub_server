const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');
require('dotenv').config();

const prisma = new PrismaClient();

// Hàm parse ngày an toàn
function parseDate(value) {
  if (!value) return null;

  // Nếu là số (Excel date dạng serial)
  if (typeof value === 'number') {
    return XLSX.SSF.format('yyyy-mm-dd', value)
      ? new Date(Math.round((value - 25569) * 86400 * 1000))
      : null;
  }

  // Nếu là string (ví dụ: "01/01/2000" hoặc "2000-01-01")
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

async function main() {
  // Đọc file Excel (đặt trong thư mục gốc project)
  const filePath = './tt2.xlsx';
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Chuyển sheet sang JSON (bỏ 3 dòng đầu: tiêu đề, khoảng trống)
  let rows = XLSX.utils.sheet_to_json(sheet, { defval: null, range: 3 });

  // Chuẩn hóa dữ liệu theo model Member
  const members = rows
    .map((row) => ({
      name: row['HỌ VÀ TÊN'] ? row['HỌ VÀ TÊN'].toString().trim() : null,
      birthDate: parseDate(row['NGÀY THÁNG NĂM SINH']),
      gender: row['GIỚI TÍNH'] || null,
      parish: row['XÃ ĐẠO'] || null,
      church: row['HỌ ĐẠO'] || null,
      startYear: row['NĂM BẮT ĐẦU SINH HOẠT']
        ? parseInt(row['NĂM BẮT ĐẦU SINH HOẠT'])
        : null,
      fatherName: row['HỌ VÀ TÊN CHA'] || null,
      motherName: row['HỌ VÀ TÊN MẸ'] || null,
      address: row['ĐỊA CHỈ'] || null,
      contact:
        (row['THÔNG TIN LIÊN HỆ (ĐOÀN SINH HOẶC PHỤ HUYNH)'] || '') +
        (row['SĐT'] ? ` - ${row['SĐT']}` : ''),
    }))
    // Lọc bỏ dòng rỗng hoặc không có tên
    .filter((m) => m.name && m.name.length > 0);

  // Insert dữ liệu vào DB
  for (const member of members) {
    await prisma.member.create({ data: member });
  }

  console.log(`✅ Đã seed ${members.length} đoàn sinh vào database`);
}

main()
  .catch((e) => {
    console.error('❌ Lỗi khi seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
