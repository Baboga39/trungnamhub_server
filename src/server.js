const express = require("express");
const cors = require("cors");
const { responseMiddleware, errorHandler } = require("./middlewares");
const routes = require("./routes");
const { responseFormatter } = require("./middlewares/responseFormatter");
const { initSchedules } = require("./services/cronService");
const startPing = require("./schedules/pingService");

const app = express();

app.use(cors());
app.use(express.json());
app.use(responseMiddleware);
app.use(responseFormatter);


// Mount all routes
routes(app);

// startPing();
// app.get("/health", (req, res) => {
//   res.status(200).send("OK");
// });

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log("🚀 Server is running on port " + PORT);
  await initSchedules();
});
