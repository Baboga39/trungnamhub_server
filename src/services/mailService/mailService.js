// src/services/mailService/mailService.js

const nodemailer = require("nodemailer");
const { google } = require("googleapis");
const { renderReportTemplate } = require("../../libs/mailTemplateHelper");
const buildApprovalHTML = require("./templates/buildApprovalHTML");
const buildDinnerInvitationHTML = require("./templates/buildDinnerHTML");

const sendDinnerInvitationMail = async () => {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI
  );

  oAuth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });

  const accessToken = await oAuth2Client.getAccessToken();

  const transporter = nodemailer.createTransport({
    service: "gmail",

    auth: {
      type: "OAuth2",
      user: process.env.GMAIL_USER,
      clientId: process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      accessToken: accessToken?.token,
    },
  });

  try {
    // 🔥 Hardcode toàn bộ
    const htmlContent = buildDinnerInvitationHTML({
      name: "My Little Lady 💖",
      date: "Sunday, March 26",
      time: "18:30 - 22:00",
      location: "Ruby Koi Bistro",
      address: "115 Nguyen Huu Tho, Ho Chi Minh City",
      message: "I want to spend a special evening just with you",
    });

    const mailOptions = {
      from: `"Dinner Invitation 💖" <${process.env.GMAIL_USER}>`,
      to: "ngochai06122002@gmail.com", // 🎯 fix cứng luôn
      subject: "🍽️ A Special Dinner Invitation Just for You",
      html: htmlContent,
    };

    await transporter.sendMail(mailOptions);

    console.log("📧 Dinner invitation sent successfully!");
  } catch (error) {
    console.error("❌ Send Dinner Mail Error:", error);
    throw error;
  }
};
const sendReportMail = async ({ meta, attachments = [] }) => {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI
  );

  oAuth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });

  const accessToken = await oAuth2Client.getAccessToken();

  const transporter = nodemailer.createTransport({
    service: "gmail",
     logger: true,
  secure: true,
    auth: {
      type: "OAuth2",
      user: process.env.GMAIL_USER,
      clientId: process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      accessToken: accessToken?.token,
    },
  });

  try {
    const htmlContent = renderReportTemplate({
      tenTruongDoan: meta.tenTruongDoan,
      tieuDeBaoCao: meta.tieuDeBaoCao,
      tenNguoiGui: meta.tenNguoiGui,
      ngayGui: new Date().toLocaleDateString("vi-VN"),
      loaiBaoCao: meta.loaiBaoCao,
      soLuongFile: attachments.length,
      emailHeThong: process.env.GMAIL_USER,
    });

    const mailOptions = {
      from: `"Hệ thống Trung Nam" <${process.env.GMAIL_USER}>`,
      to: meta.toEmail,
      subject: `📊 ${meta.tieuDeBaoCao || "Báo cáo Trung Nam"}`,
      html: htmlContent,
      attachments,
    };


    await transporter.sendMail(mailOptions);
    console.log(`📧 Report email sent successfully to ${meta.toEmail}`);
  } catch (error) {
    console.error("❌ Mails Service Error - Failed to send report email:", error);
  }
};

const sendApprovalMail = async ({ toEmail, documentTitle, reviewerName, senderName, approvalLink }) => {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI
  );

  oAuth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });

  const accessToken = await oAuth2Client.getAccessToken();

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: process.env.GMAIL_USER,
      clientId: process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      accessToken: accessToken?.token,
    },
  });

  const htmlContent = buildApprovalHTML({
    documentTitle,
    reviewerName,
    senderName,
    approvalLink
  });

  const mailOptions = {
    from: `"Hệ thống Trung Nam" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `🔔 Yêu cầu phê duyệt: ${documentTitle}`,
    html: htmlContent,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Approval email sent to: ${toEmail} (intended for ${reviewerName})`);
  } catch (error) {
    console.error("❌ Mails Service Error - Failed to send approval email:", error);
  }
};

module.exports = {
  sendReportMail,
  sendApprovalMail,
  sendDinnerInvitationMail,
};