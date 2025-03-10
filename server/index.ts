import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

(async () => {
  try {
    console.log("Starting server setup...");

    // Add request logging middleware
    app.use((req, _res, next) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
      next();
    });

    // In development, create and use Vite's dev server
    const vite = await createServer({
      root: path.resolve(__dirname, "..", "client"),
      server: { 
        middlewareMode: true,
        hmr: {
          port: 24678 // Use a different port for HMR
        }
      },
      appType: "spa",
      configFile: path.resolve(__dirname, "..", "vite.config.ts")
    }).catch(err => {
      console.error("Failed to create Vite server:", err);
      throw err;
    });

    console.log("Vite server created successfully");
    console.log("Root directory:", path.resolve(__dirname, "..", "client"));

    // Use vite's middleware
    app.use(vite.middlewares);

    // ALWAYS serve on port 5000
    const PORT = 5000;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server started on port ${PORT} (${process.env.NODE_ENV} mode)`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
})();