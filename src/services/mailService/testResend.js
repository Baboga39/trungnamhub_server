// src/services/mailService/testResend.js
require("dotenv").config();
const { sendApprovalMail, sendDinnerInvitationMail } = require("./mailService");

async function test() {
  console.log("🚀 Running Resend test script...");
  console.log("RESEND_API_KEY set:", !!process.env.RESEND_API_KEY);

  if (!process.env.RESEND_API_KEY) {
    console.log("⚠️ Vui lòng thêm RESEND_API_KEY vào file .env để test gửi email thực tế.");
    console.log("Ví dụ trong file .env:\nRESEND_API_KEY=re_123456789\nRESEND_FROM_EMAIL=Trung Nam Hub <onboarding@resend.dev>\n");
    return;
  }

  console.log("📧 Đang thử gửi mail phê duyệt văn bản...");
  await sendApprovalMail({
    toEmail: "onboarding@resend.dev", // Hoặc email đã đăng ký tài khoản Resend
    documentTitle: "Báo cáo Q3 2026 - Kiểm thử Resend",
    reviewerName: "Ban Quản Trị",
    senderName: "Hệ thống Trung Nam",
    approvalLink: "https://localhost:3000/approve?token=test_token_123",
  });

  console.log("✅ Đã hoàn thành test script.");
}

test();
