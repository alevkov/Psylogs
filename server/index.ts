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

    // In development, create and use Vite's dev server
    const vite = await createServer({
      root: path.resolve(__dirname, "..", "client"),
      server: { 
        middlewareMode: true,
        hmr: true
      },
      appType: "spa"
    });

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