const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const mongoose = require("mongoose");
const Room = require("./models/Room");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
});

// ── User store ────────────────────────────────────────────────────────────────
const roomUsers = {}; // { roomId: { socketId: { name, color } } }
const USER_COLORS = ["#00e5ff", "#ff4d6a", "#00ffa3", "#ffb347", "#c084fc", "#f472b6"];

// ── Single connection block ───────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // ── Join room ──────────────────────────────────────────────────────────────
  socket.on("join_room", ({ roomId, userName }) => {
    socket.join(roomId);

    if (!roomUsers[roomId]) roomUsers[roomId] = {};

    // Assign color based on how many users are already in the room
    const colorIndex = Object.keys(roomUsers[roomId]).length % USER_COLORS.length;
    roomUsers[roomId][socket.id] = {
      name: userName || "Anonymous",
      color: USER_COLORS[colorIndex],
    };

    console.log(`${userName} joined room ${roomId} with color ${USER_COLORS[colorIndex]}`);

    // Broadcast updated user list to everyone in room
    io.to(roomId).emit("room_users", roomUsers[roomId]);
  });

  // ── Code change ────────────────────────────────────────────────────────────
  socket.on("code_change", async ({ roomId, code }) => {
    socket.to(roomId).emit("code_update", code);
    await Room.findOneAndUpdate({ roomId }, { code }, { upsert: true });
  });

  // ── Cursor move ────────────────────────────────────────────────────────────
  socket.on("cursor_move", ({ roomId, position }) => {
    const user = roomUsers[roomId]?.[socket.id];
    if (!user) return; // user not registered yet, skip

    socket.to(roomId).emit("cursor_update", {
      socketId: socket.id,
      position,
      name: user.name,
      color: user.color,
    });
  });

  // ── Run code ───────────────────────────────────────────────────────────────
  socket.on("run_code", async ({ roomId, code, language }) => {
    try {
      const response = await fetch(
        "https://ce.judge0.com/submissions?base64_encoded=false&wait=true",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_code: code,
            language_id: language === "python" ? 71 : 63,
          }),
        }
      );
      const data = await response.json();
      const output = data.stdout || data.stderr || data.compile_output || "No output";
      io.to(roomId).emit("code_output", { output });
    } catch (err) {
      io.to(roomId).emit("code_output", { output: "Error running code: " + err.message });
    }
  });

  // ── Language change ────────────────────────────────────────────────────────
  socket.on("language_change", ({ roomId, language }) => {
    socket.to(roomId).emit("language_update", { language });
  });

  // ── Disconnect ─────────────────────────────────────────────────────────────
  socket.on("disconnecting", () => {
    for (const roomId of socket.rooms) {
      if (roomUsers[roomId]?.[socket.id]) {
        delete roomUsers[roomId][socket.id];
        io.to(roomId).emit("room_users", roomUsers[roomId]);
        socket.to(roomId).emit("cursor_remove", { socketId: socket.id });
        console.log(`${socket.id} left room ${roomId}`);
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// ── API routes ────────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.send("Backend is running 🚀"));

app.get("/room/:id", async (req, res) => {
  const room = await Room.findOne({ roomId: req.params.id });
  res.json(room || { code: "" });
});

app.post("/run", async (req, res) => {
  const { code, language } = req.body;
  const response = await fetch(
    "https://ce.judge0.com/submissions?base64_encoded=false&wait=true",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_code: code,
        language_id: language === "python" ? 71 : 63,
      }),
    }
  );
  const data = await response.json();
  res.json({ output: data.stdout || data.stderr || data.compile_output });
});

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(5000, () => console.log("Server running on port 5000"));

mongoose
  .connect("mongodb://127.0.0.1:27017/codeapp")
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log(err));