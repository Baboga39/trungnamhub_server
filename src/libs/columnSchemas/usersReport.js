export const usersReportSchema = {
  columns: [
    { field: "id", header: "Mã người dùng" },
    { field: "name", header: "Họ và Tên" },
    { field: "email", header: "Email" },
    { field: "role", header: "Chức vụ" },
    { field: "createdAt", header: "Ngày tạo" },
    { field: "updatedAt", header: "Cập nhật cuối" },
  ],
  hiddenColumns: ["password", "members"], // field ẩn, không xuất
};
