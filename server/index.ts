// server/index.ts
import express from "express";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create express app and HTTP server
const app = express();
const server = http.createServer(app);

// Add request logging middleware
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

async function startServer() {
  try {
    console.log("Starting dev server...");

    // Create Vite server in middleware mode
    const vite = await createViteServer({
      root: path.resolve(__dirname, "..", "client"),
      server: {
        middlewareMode: true,
        hmr: true // Disable HMR to prevent loops for now
      },
      appType: "custom",
      clearScreen: false,
    });

    // Use Vite's middleware
    app.use(vite.middlewares);

    // Serve index.html for all requests
    app.use("*", (req, res) => {
      const indexPath = path.resolve(__dirname, "..", "client", "index.html");
      fs.readFile(indexPath, "utf-8", (err, html) => {
        if (err) {
          console.error("Error reading index.html:", err);
          res.status(500).send("Server error");
          return;
        }

        // Send the HTML without Vite transformations for now
        res.status(200).set({ "Content-Type": "text/html" }).send(html);
      });
    });

    // Start the server
    const PORT = 5000;
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`Dev server running at http://localhost:${PORT}`);
    });

  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Start the server
startServer();