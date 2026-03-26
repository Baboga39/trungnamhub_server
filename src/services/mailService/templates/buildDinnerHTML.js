const buildDinnerInvitationHTML = ({
  name = "Em yêu",
  date = "Thứ Bảy, 12 Tháng 4",
  time = "19:00 - 22:00",
  location = "Ruby Koi Bistro",
  address = "115 Nguyễn Hữu Thọ, Bà Rịa, Hồ Chí Minh",
  message = "Anh muốn dành thời gian chỉ có mình em",
}) => {
  return `
  <html>
  <head>
    <meta charset="utf-8"/>
    <style>
      body {
        font-family: 'Segoe UI', sans-serif;
        background: #f9f5f3;
        margin: 0;
        padding: 0;
      }

      .container {
        max-width: 600px;
        margin: auto;
        background: #fff;
      }

      .header {
        background: linear-gradient(135deg, #d67ba1, #c45a8a);
        padding: 40px 20px;
        text-align: center;
        color: white;
      }

      .header h1 {
        font-family: Georgia, serif;
        font-size: 36px;
        margin: 0;
      }

      .header p {
        font-size: 18px;
        margin-top: 10px;
      }

      .content {
        padding: 30px 20px;
      }

      .box {
        background: #faf8f6;
        padding: 15px;
        border-radius: 8px;
        margin-bottom: 15px;
      }

      .label {
        font-size: 12px;
        color: #999;
        text-transform: uppercase;
      }

      .value {
        font-size: 16px;
        font-weight: 500;
        color: #333;
      }

      .menu {
        margin-top: 20px;
      }

      .menu h3 {
        text-align: center;
        margin-bottom: 15px;
      }

      .course {
        text-align: center;
        margin-bottom: 15px;
      }

      .course-title {
        font-weight: bold;
        color: #d67ba1;
      }

      .footer {
        text-align: center;
        padding: 20px;
        font-size: 12px;
        color: #999;
      }

      .btn {
        display: block;
        margin: 25px auto;
        padding: 12px 20px;
        background: #d67ba1;
        color: white;
        text-decoration: none;
        border-radius: 6px;
        text-align: center;
        width: 80%;
      }
    </style>
  </head>

  <body>
    <div class="container">

      <!-- HEADER -->
      <div class="header">
        <h1>${name}</h1>
        <p>Anh muốn mời em đi ăn tối</p>
        <p><i>"${message}"</i></p>
      </div>

      <!-- CONTENT -->
      <div class="content">

        <div class="box">
          <div class="label">Ngày</div>
          <div class="value">${date}</div>
        </div>

        <div class="box">
          <div class="label">Giờ</div>
          <div class="value">${time}</div>
        </div>

        <div class="box">
          <div class="label">Địa điểm</div>
          <div class="value">${location}</div>
          <div style="font-size:13px;color:#666">${address}</div>
        </div>

        <!-- MENU -->
        <div class="menu">
          <h3>Menu tối</h3>

          <div class="course">
            <div class="course-title">Khai vị</div>
            <div>Soup bí đỏ</div>
          </div>

          <div class="course">
            <div class="course-title">Món chính</div>
            <div>Bò bít tết sốt tiêu đen</div>
          </div>

          <div class="course">
            <div class="course-title">Món phụ</div>
            <div>Mì Ý sốt kem</div>
          </div>

          <div class="course">
            <div class="course-title">Tráng miệng</div>
            <div>Bánh mousse chocolate</div>
          </div>

          <div class="course">
            <div class="course-title">Thức uống</div>
            <div>Rượu vang đỏ</div>
          </div>

        </div>

        <a class="btn" href="mailto:?subject=Xác nhận tham dự">
          Xác nhận tham dự
        </a>

      </div>

      <div class="footer">
        Một buổi tối đặc biệt chỉ dành cho chúng ta ❤️
      </div>

    </div>
  </body>
  </html>
  `;
};

module.exports = buildDinnerInvitationHTML;