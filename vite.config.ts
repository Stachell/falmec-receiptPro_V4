import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { componentTagger } from "lovable-tagger";

const MODULES_DIR = path.resolve(__dirname, "src/services/parsers/modules");

/**
 * Dev-only plugin: exposes endpoints for parser management.
 * - POST /api/dev/delete-parser  — delete a parser file + clean index.ts
 * - GET  /api/dev/open-folder    — open modules/ in Windows Explorer
 */
function parserDevPlugin(): Plugin {
  return {
    name: "parser-dev-plugin",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // ── POST /api/dev/delete-parser ──────────────────────────
        if (req.method === "POST" && req.url === "/api/dev/delete-parser") {
          let body = "";
          req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
          req.on("end", () => {
            try {
              const { fileName } = JSON.parse(body) as { fileName: string };

              // Safety checks
              if (!fileName || !fileName.endsWith(".ts")) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: false, error: "Nur .ts-Dateien erlaubt" }));
                return;
              }
              if (fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: false, error: "Ungueltiger Dateiname" }));
                return;
              }

              const filePath = path.join(MODULES_DIR, fileName);
              if (!fs.existsSync(filePath)) {
                res.writeHead(404, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: false, error: "Datei nicht gefunden" }));
                return;
              }

              // 1. Delete the file
              fs.unlinkSync(filePath);

              // 2. Clean index.ts
              const indexPath = path.resolve(__dirname, "src/services/parsers/index.ts");
              if (fs.existsSync(indexPath)) {
                const className = fileName.replace(".ts", "");
                let indexContent = fs.readFileSync(indexPath, "utf-8");

                // Remove import lines referencing this class
                indexContent = indexContent
                  .split("\n")
                  .filter((line) => !line.includes(className))
                  .join("\n");

                fs.writeFileSync(indexPath, indexContent, "utf-8");
              }

              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: true }));
            } catch (err: any) {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
          return;
        }

        // ── GET /api/dev/open-folder[?subfolder=<name>] ──────────
        if (req.method === "GET" && req.url?.startsWith("/api/dev/open-folder")) {
          const parsedUrl = new URL(req.url, "http://localhost");
          const subfolder = parsedUrl.searchParams.get("subfolder");
          // Build target: if subfolder provided, open archive sub-folder relative to project root
          const ARCHIVE_BASE_DIR = path.resolve(__dirname, "archive");
          const targetPath = subfolder
            ? path.join(ARCHIVE_BASE_DIR, subfolder)
            : MODULES_DIR;
          if (process.platform === "win32") {
            exec(`explorer "${targetPath.replace(/\//g, "\\")}"`);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, path: targetPath }));
          } else {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: "Nur unter Windows verfuegbar" }));
          }
          return;
        }

        next();
      });

      // Watch index.ts → auto-reload on parser registration changes
      const indexPath = path.resolve(__dirname, "src/services/parsers/index.ts");
      server.watcher.on("change", (changedPath) => {
        if (path.resolve(changedPath) === indexPath) {
          const registryPath = path.join(MODULES_DIR, "parser-registry.json");
          if (fs.existsSync(registryPath)) {
            fs.unlinkSync(registryPath);
            console.log("[parser-dev-plugin] parser-registry.json geloescht (index.ts geaendert)");
          }
          server.ws.send({ type: "full-reload" });
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    mode === "development" && parserDevPlugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
