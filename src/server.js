const { validateEnv } = require("./config/envValidator");
validateEnv();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const { responseMiddleware, errorHandler, globalLimiter, corsOptions } = require("./middlewares");
const routes = require("./routes");
const { responseFormatter } = require("./middlewares/responseFormatter");
const { initSchedules } = require("./services/cronService");
const startPing = require("./schedules/pingService");

const app = express();

// Trust reverse proxy (Render, Vercel, Nginx) for accurate IP rate limiting
app.set("trust proxy", 1);

// Performance & Security Middlewares
app.use(compression());
app.use(helmet());
app.use(cors(corsOptions));
app.use(globalLimiter);

// Body Parsing & Response Middlewares
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

const prisma = require("./libs/prisma");

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, async () => {
  console.log("🚀 Server is running on port " + PORT);
  await initSchedules();
});

// Graceful shutdown handling
const shutdown = async (signal) => {
  console.log(`\n🛑 Received ${signal}. Shutting down Core Server gracefully...`);
  server.close(async () => {
    try {
      await prisma.$disconnect();
      console.log("🔌 Prisma disconnected cleanly.");
      process.exit(0);
    } catch (err) {
      console.error("Error disconnecting Prisma:", err);
      process.exit(1);
    }
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
