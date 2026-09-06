// src/middlewares/corsConfig.js

const allowedOrigins = [
  "https://trungnamhub.io.vn",
  "https://www.trungnamhub.io.vn",
  "https://trungnamhub-client.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:5000",
  "http://localhost:5001",
  ...(process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : []),
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, server-to-server, cron jobs)
    if (!origin) return callback(null, true);

    const normalizedOrigin = origin.replace(/\/$/, "");
    
    if (
      allowedOrigins.includes(normalizedOrigin) ||
      process.env.NODE_ENV !== "production"
    ) {
      return callback(null, true);
    }
    
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
};

module.exports = { corsOptions, allowedOrigins };
