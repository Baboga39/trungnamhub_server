// src/config/envValidator.js
require("dotenv").config();

function validateEnv() {
  const requiredEnvVars = ["DATABASE_URL"];
  const missing = requiredEnvVars.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(`\n❌ [FATAL] Core Backend is missing required environment variables:`);
    missing.forEach((key) => console.error(`   - ${key}`));
    console.error(`👉 Please define them in your .env file or hosting provider (Render/VPS).\n`);
    process.exit(1);
  }

  // Security check for production JWT_SECRET
  if (
    process.env.NODE_ENV === "production" &&
    (!process.env.JWT_SECRET || process.env.JWT_SECRET === "supersecret")
  ) {
    console.warn(
      `\n⚠️  [SECURITY WARNING] Core Backend is running in production with missing or default JWT_SECRET!`
    );
    console.warn(
      `👉 Please set a strong, unique JWT_SECRET in your environment variables.\n`
    );
  }
}

module.exports = { validateEnv };
