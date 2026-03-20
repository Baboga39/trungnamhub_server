// src/services/mailService/mailService.js

const nodemailer = require("nodemailer");
const { google } = require("googleapis");
const { createStyledExcelBuffer } = require("../../libs/excelHelper");
const { renderReportTemplate } = require("../../libs/mailTemplateHelper");

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
    auth: {
      type: "OAuth2",
      user: process.env.GMAIL_USER,
      clientId: process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      accessToken: accessToken?.token,
    },
  });

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
    subject: `📊 ${meta.tieuDeBaoCao}`,
    html: htmlContent,
    attachments,
  };

  await transporter.sendMail(mailOptions);

  console.log(`📧 Report email sent to ${meta.toEmail}`);
};

module.exports = {
  sendReportMail,
};