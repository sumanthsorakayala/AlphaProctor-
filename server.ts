import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  const PORT = 3000;

  // Socket.io logic for real-time proctoring
  io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    // Join a room for a specific exam submission
    socket.on("join-exam", (submissionId) => {
      socket.join(submissionId);
      console.log(`User ${socket.id} joined exam room: ${submissionId}`);
    });

    // Student sends a warning/alert
    socket.on("student-alert", (data) => {
      const { submissionId, alertType, message } = data;
      // Broadcast to all in the room (including admin)
      io.to(submissionId).emit("admin-alert", {
        submissionId,
        alertType,
        message,
        timestamp: new Date().toISOString(),
      });
    });

    // Admin sends a command (terminate, warn, etc.)
    socket.on("admin-command", (data) => {
      const { submissionId, command, message } = data;
      io.to(submissionId).emit("student-command", {
        command,
        message,
        timestamp: new Date().toISOString(),
      });
    });

    // Student sends audio chunk
    socket.on("audio-chunk", (data) => {
      const { submissionId, chunk } = data;
      io.to(submissionId).emit("admin-audio", {
        submissionId,
        chunk,
      });
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
