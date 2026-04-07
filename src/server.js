const express = require("express");
const cors = require("cors");
const { responseMiddleware, errorHandler } = require("./middlewares");
const routes = require("./routes");
const { responseFormatter } = require("./middlewares/responseFormatter");
const pingService = require("./schedules/pingService");
const { initSchedules } = require("./services/cronService");

const app = express();

app.use(cors());
app.use(express.json());
app.use(responseMiddleware);
app.use(responseFormatter);

// Mount all routes
routes(app);

pingService();
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log("🚀 Server is running on port " + PORT);
  await initSchedules();
});
