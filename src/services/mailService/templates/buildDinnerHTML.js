const buildDinnerInvitationHTML = ({
  name = "My Love",
  date = "Saturday, April 12",
  time = "19:00 - 22:00",
  location = "Ruby Koi Bistro",
  address = "115 Nguyen Huu Tho, Ba Ria, Ho Chi Minh",
  message = "I want to spend a special evening just with you",
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
        margin-top: 25px;
      }

      .menu h3 {
        text-align: center;
        margin-bottom: 20px;
        font-size: 20px;
      }

      .course {
        text-align: center;
        margin: 18px 0;
      }

      .course-title {
        font-size: 12px;
        letter-spacing: 2px;
        text-transform: uppercase;
        color: #d67ba1;
        margin-bottom: 5px;
      }

      .course-item {
        font-size: 16px;
        font-weight: 500;
        color: #333;
      }

      .course-sub {
        font-size: 13px;
        color: #777;
        font-style: italic;
      }

      .divider {
        text-align: center;
        color: #d67ba1;
        margin: 10px 0;
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
        <p>A Special Dinner Invitation 💖</p>
        <p><i>"${message}"</i></p>
      </div>

      <!-- CONTENT -->
      <div class="content">

        <div class="box">
          <div class="label">Date</div>
          <div class="value">${date}</div>
        </div>

        <div class="box">
          <div class="label">Time</div>
          <div class="value">${time}</div>
        </div>

        <div class="box">
          <div class="label">Location</div>
          <div class="value">${location}</div>
          <div style="font-size:13px;color:#666">${address}</div>
        </div>

        <!-- MENU -->
        <div class="menu">
          <h3>Five Course Dinner 🍽️</h3>

          <div class="course">
            <div class="course-title">STARTER</div>
            <div class="course-item">Pumpkin Soup</div>
            <div class="course-sub">Served with garlic butter toasted bread</div>
          </div>

          <div class="divider">•</div>

          <div class="course">
            <div class="course-title">MAIN COURSE 1</div>
            <div class="course-item">Pan-seared Goose Breast</div>
          </div>

          <div class="divider">•</div>

          <div class="course">
            <div class="course-title">MAIN COURSE 2</div>
            <div class="course-item">Seafood Spring Rolls</div>
          </div>

          <div class="divider">•</div>

          <div class="course">
            <div class="course-title">MAIN COURSE 3</div>
            <div class="course-item">Aukubee Steak</div>
            <div class="course-sub">Served with potatoes & signature sauce</div>
          </div>

          <div class="divider">•</div>

          <div class="course">
            <div class="course-title">DESSERT</div>
            <div class="course-item">Coconut Ice Cream</div>
          </div>

        </div>

        <a class="btn" href="mailto:?subject=RSVP Dinner">
          Confirm Attendance 💌
        </a>

      </div>

      <div class="footer">
        "Every dish is prepared with love and sincerity by our chef"
      </div>

    </div>
  </body>
  </html>
  `;
};

module.exports = buildDinnerInvitationHTML;