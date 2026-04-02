module.exports = function buildApprovalHTML({
  documentTitle,
  reviewerName,
  senderName,
  approvalLink,
}) {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body { font-family: Arial, sans-serif; background-color: #f4f7f6; margin: 0; padding: 0; }
      .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
      .header { background: #2563eb; padding: 20px; text-align: center; color: white; font-size: 24px; font-weight: bold; }
      .content { padding: 30px; color: #333333; line-height: 1.6; font-size: 16px; }
      .doc-title { font-size: 18px; font-weight: bold; color: #1e293b; padding: 15px; background: #f8fafc; border-left: 4px solid #2563eb; margin: 20px 0; border-radius: 4px; }
      .button-container { text-align: center; margin: 30px 0; }
      .btn { display: inline-block; padding: 14px 30px; background-color: #2563eb; color: #ffffff !important; text-decoration: none; font-weight: bold; border-radius: 6px; font-size: 16px; box-shadow: 0 4px 6px rgba(37,99,235,0.2); }
      .footer { text-align: center; padding: 20px; color: #64748b; font-size: 14px; background: #f1f5f9; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">📋 Yêu cầu phê duyệt tài liệu</div>
      <div class="content">
        <p>Xin chào <strong>${reviewerName}</strong>,</p>
        <p>Anh/chị vừa nhận được một yêu cầu phê duyệt tài liệu từ <strong>${senderName}</strong> qua hệ thống quản lý tài liệu.</p>
        
        <div class="doc-title">
          📄 Tên tài liệu:<br/> ${documentTitle}
        </div>
        
        <p>Vui lòng click vào nút bên dưới để xem chi tiết và thực hiện phê duyệt (hoặc từ chối):</p>
        
        <div class="button-container">
          <a href="${approvalLink}" class="btn">MỞ VÀ PHÊ DUYỆT TÀI LIỆU</a>
        </div>
        
        <p>Lưu ý: Link đi kèm mã xác thực riêng biệt và sẽ tự động hết hạn sau 48 giờ.</p>
        <p>Trân trọng,<br/>Hệ thống Quản lý Tài liệu</p>
      </div>
      <div class="footer">
        Được gửi tự động từ hệ thống Trung Nam Hub. Vui lòng không trả lời email này.
      </div>
    </div>
  </body>
  </html>
  `;
};
