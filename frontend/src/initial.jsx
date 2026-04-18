import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import Editor from "@monaco-editor/react";
import { useParams, Routes, Route, useNavigate } from "react-router-dom";

// ✅ HOME
function Home({ navigate }) {
  const [input, setInput] = useState("");

  const handleJoin = () => {
    if (input) navigate(`/room/${input}`);
  };

  return (
    <div className="h-screen flex flex-col justify-center items-center bg-gray-900 text-white">
      <h1 className="text-3xl font-bold mb-4">LiveCode 🚀</h1>

      <input
        className="p-2 rounded text-black"
        placeholder="Enter Room ID"
        onChange={(e) => setInput(e.target.value)}
      />

      <button
        onClick={handleJoin}
        className="mt-3 bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded"
      >
        Join Room
      </button>
    </div>
  );
}

// ✅ EDITOR PAGE
function EditorPage() {
  const { roomId } = useParams();

  const [code, setCode] = useState("");
  const [output, setOutput] = useState("");
  const [socket, setSocket] = useState(null);
  const [language, setLanguage] = useState("javascript");

  // Socket connect
  useEffect(() => {
    const s = io("http://localhost:5000");
    setSocket(s);
    return () => s.disconnect();
  }, []);

  // Join room + load code
  useEffect(() => {
    if (!socket || !roomId) return;

    socket.emit("join_room", roomId);

    fetch(`http://localhost:5000/room/${roomId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data?.code) setCode(data.code);
      })
      .catch(console.error);
  }, [socket, roomId]);

  // Listen updates
  useEffect(() => {
    if (!socket) return;

    const handler = (newCode) => {
      setCode((prev) => (prev !== newCode ? newCode : prev));
    };

    socket.on("code_update", handler);

    return () => socket.off("code_update", handler);
  }, [socket]);

  // Run code
  const runCode = async () => {
    const res = await fetch("http://localhost:5000/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code, language }),
    });

    const data = await res.json();
    setOutput(data.output);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white">
      
      {/* 🔥 NAVBAR */}
      <div className="flex justify-between items-center p-3 bg-gray-800 border-b border-gray-700">
        <h1 className="text-lg font-bold">LiveCode</h1>

        <div className="flex items-center gap-3">
          <span className="text-sm">Room: {roomId}</span>

          <select
            className="bg-gray-700 px-2 py-1 rounded"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="javascript">JS</option>
            <option value="python">Python</option>
          </select>

          <button
            onClick={runCode}
            className="bg-green-500 hover:bg-green-600 px-3 py-1 rounded"
          >
            Run ▶
          </button>
        </div>
      </div>

      {/* 🔥 MAIN */}
      <div className="flex flex-1">
        
        {/* LEFT - EDITOR */}
        <div className="flex-1 p-2">
          <Editor
            theme="vs-dark"
            height="100%"
            language={language}
            value={code}
            onChange={(value) => {
              const newCode = value || "";
              setCode(newCode);

              if (socket) {
                socket.emit("code_change", {
                  roomId,
                  code: newCode,
                });
              }
            }}
          />
        </div>

        {/* RIGHT - OUTPUT */}
        <div className="w-1/3 bg-black text-green-400 p-4 overflow-auto">
          <h3 className="mb-2 font-bold">Output</h3>
          <pre>{output}</pre>
        </div>
      </div>
    </div>
  );
}

// ✅ ROUTES
function App() {
  const navigate = useNavigate();

  return (
    <Routes>
      <Route path="/" element={<Home navigate={navigate} />} />
      <Route path="/room/:roomId" element={<EditorPage />} />
    </Routes>
  );
}

export default App;