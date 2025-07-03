// index.ts
import "dotenv/config";
import express from "express";
import cors from "cors";

// db.ts
import mongoose from "mongoose";
var MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;
if (!MONGODB_URI) {
  console.warn(
    "\u26A0\uFE0F  MONGODB_URI not set. Database operations will fail. Please check your .env file."
  );
  console.warn("   Copy .env.example to .env and configure your MongoDB connection.");
}
var isConnected = false;
async function connectToDatabase() {
  if (isConnected) {
    return;
  }
  if (!MONGODB_URI) {
    throw new Error("MongoDB connection string not provided. Please set MONGODB_URI in your .env file.");
  }
  try {
    await mongoose.connect(MONGODB_URI);
    isConnected = true;
    console.log("\u2705 Connected to MongoDB");
  } catch (error) {
    console.error("\u274C MongoDB connection error:", error);
    throw error;
  }
}

// index.ts
var app = express();
app.use(cors({
  origin: process.env.NODE_ENV === "production" ? process.env.CLIENT_URL || "https://your-client-app.onrender.com" : "http://localhost:5173",
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      console.log(`${(/* @__PURE__ */ new Date()).toLocaleTimeString()} [server] ${logLine}`);
    }
  });
  next();
});
(async () => {
  try {
    await connectToDatabase();
  } catch (error) {
    console.error("Failed to connect to database:", error);
    console.warn("\u26A0\uFE0F  Continuing without database connection. API routes may fail.");
  }
  const server = await (void 0)(app);
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    console.error("Error:", err);
  });
  app.get("/health", (_req, res) => {
    res.json({ status: "OK", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  });
  const port = process.env.PORT || 5e3;
  server.listen(port, () => {
    console.log(`\u{1F680} Server running on port ${port}`);
    console.log(`\u{1F4E1} API available at http://localhost:${port}/api`);
  });
})();
