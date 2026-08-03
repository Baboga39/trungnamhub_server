// src/services/mailService/mailService.js

const { Resend } = require("resend");
const { renderReportTemplate } = require("../../libs/mailTemplateHelper");
const buildApprovalHTML = require("./templates/buildApprovalHTML");
const buildDinnerInvitationHTML = require("./templates/buildDinnerHTML");

// Khởi tạo Resend instance với API Key từ môi trường
const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

// Email người gửi mặc định (Ví dụ: 'Trung Nam Hub <onboarding@resend.dev>')
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Trung Nam Hub <onboarding@resend.dev>";

/**
 * Chuẩn hóa địa chỉ email nhận (chấp nhận mảng hoặc chuỗi phân cách bởi dấu phẩy)
 */
const formatToEmail = (toInput) => {
  if (Array.isArray(toInput)) {
    return toInput.map((e) => e.trim()).filter(Boolean);
  }
  if (typeof toInput === "string") {
    return toInput.split(",").map((e) => e.trim()).filter(Boolean);
  }
  return [];
};

/**
 * Gửi email thiệp mời ăn tối
 */
const sendDinnerInvitationMail = async (toEmail = "ngochai06122002@gmail.com") => {
  if (!resend) {
    console.warn("⚠️ RESEND_API_KEY chưa được cấu hình trong .env");
    return;
  }

  try {
    const htmlContent = buildDinnerInvitationHTML({
      name: "My Little Lady 💖",
      date: "Sunday, March 26",
      time: "18:30 - 22:00",
      location: "Ruby Koi Bistro",
      address: "115 Nguyen Huu Tho, Ho Chi Minh City",
      message: "I want to spend a special evening just with you",
    });

    const response = await resend.emails.send({
      from: FROM_EMAIL,
      to: formatToEmail(toEmail),
      subject: "🍽️ A Special Dinner Invitation Just for You",
      html: htmlContent,
    });

    if (response.error) {
      console.error("❌ Send Dinner Mail Error:", response.error);
      throw response.error;
    }

    console.log("📧 Dinner invitation sent successfully! ID:", response.data?.id);
    return response.data;
  } catch (error) {
    console.error("❌ Send Dinner Mail Error:", error);
    throw error;
  }
};

/**
 * Gửi email báo cáo đính kèm file
 */
const sendReportMail = async ({ meta, attachments = [] }) => {
  if (!resend) {
    console.warn("⚠️ RESEND_API_KEY chưa được cấu hình trong .env");
    return;
  }

  try {
    const htmlContent = renderReportTemplate({
      tenTruongDoan: meta.tenTruongDoan,
      tieuDeBaoCao: meta.tieuDeBaoCao,
      tenNguoiGui: meta.tenNguoiGui,
      ngayGui: new Date().toLocaleDateString("vi-VN"),
      loaiBaoCao: meta.loaiBaoCao,
      soLuongFile: attachments.length,
      emailHeThong: FROM_EMAIL,
    });

    // Format attachments cho Resend API: [{ filename, content }]
    const formattedAttachments = attachments.map((att) => ({
      filename: att.filename,
      content: att.content,
    }));

    const response = await resend.emails.send({
      from: FROM_EMAIL,
      to: formatToEmail(meta.toEmail),
      subject: `📊 ${meta.tieuDeBaoCao || "Báo cáo Trung Nam"}`,
      html: htmlContent,
      attachments: formattedAttachments,
    });

    if (response.error) {
      console.error("❌ Resend Report Error:", response.error);
      return;
    }

    console.log(`📧 Report email sent successfully to ${meta.toEmail} | ID: ${response.data?.id}`);
    return response.data;
  } catch (error) {
    console.error("❌ Mail Service Error - Failed to send report email:", error);
  }
};

/**
 * Gửi email yêu cầu phê duyệt văn bản
 */
const sendApprovalMail = async ({ toEmail, documentTitle, reviewerName, senderName, approvalLink }) => {
  if (!resend) {
    console.warn("⚠️ RESEND_API_KEY chưa được cấu hình trong .env");
    return;
  }

  try {
    const htmlContent = buildApprovalHTML({
      documentTitle,
      reviewerName,
      senderName,
      approvalLink,
    });

    const response = await resend.emails.send({
      from: FROM_EMAIL,
      to: formatToEmail(toEmail),
      subject: `🔔 Yêu cầu phê duyệt: ${documentTitle}`,
      html: htmlContent,
    });

    if (response.error) {
      console.error("❌ Resend Approval Mail Error:", response.error);
      return;
    }

    console.log(`📧 Approval email sent to: ${toEmail} (for ${reviewerName}) | ID: ${response.data?.id}`);
    return response.data;
  } catch (error) {
    console.error("❌ Mail Service Error - Failed to send approval email:", error);
  }
};

module.exports = {
  sendReportMail,
  sendApprovalMail,
  sendDinnerInvitationMail,
};