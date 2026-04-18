const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const mongoose = require("mongoose");
const Room = require("./models/Room");
const { exec } = require("child_process");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

// ✅ SOCKET
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join_room", (roomId) => {
    socket.join(roomId);
  });

  socket.on("code_change", async ({ roomId, code }) => {
    socket.to(roomId).emit("code_update", code);
    console.log("Saving code:", code);
  
  

    // Save to DB
    await Room.findOneAndUpdate(
      { roomId },
      { code },
      { upsert: true }
    );
  });
  socket.on("cursor_move", ({ roomId, position }) => {
  socket.to(roomId).emit("cursor_update", {position});
});
// RUN CODE
socket.on("run_code", async ({ roomId, code, language }) => {
  const response = await fetch(
    "https://ce.judge0.com/submissions?base64_encoded=false&wait=true",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_code: code,
        language_id: language === "python" ? 71 : 63
      })
    }
  );

  const data = await response.json();
  const output = data.stdout || data.stderr || data.compile_output;

  io.to(roomId).emit("code_output", { output });
});

// LANGUAGE
socket.on("language_change", ({ roomId, language }) => {
  socket.to(roomId).emit("language_update", { language });
});
}); 

// ✅ API ROUTES
app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});

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
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        source_code: code,
        language_id: language === "python" ? 71 : 63
      })
    }
  );

  const data = await response.json();

  res.json({
    output: data.stdout || data.stderr || data.compile_output
  });
});
// ✅ SERVER
server.listen(5000, () => {
  console.log("Server running on port 5000");
});

// ✅ MONGODB
mongoose.connect("mongodb://127.0.0.1:27017/codeapp")
  .then(() => {
    console.log("MongoDB connected");
  })
  .catch(err => {
    console.log(err);
  });