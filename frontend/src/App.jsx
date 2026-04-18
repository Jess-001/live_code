import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import Editor from "@monaco-editor/react";
import { useParams, Routes, Route, useNavigate } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";

// ── Inject global styles ──────────────────────────────────────────────────────
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Syne:wght@400;600;800&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg-base:       #0b0e14;
      --bg-surface:    #111520;
      --bg-elevated:   #161b27;
      --bg-hover:      #1c2233;
      --border:        #1e2638;
      --border-bright: #2a3550;
      --cyan:          #00e5ff;
      --cyan-dim:      #00b8cc;
      --cyan-glow:     rgba(0,229,255,0.12);
      --green:         #00ffa3;
      --green-dim:     #00cc83;
      --red:           #ff4d6a;
      --amber:         #ffb347;
      --text-primary:  #e8edf5;
      --text-secondary:#8994a8;
      --text-muted:    #4a5568;
      --font-ui:       'Syne', sans-serif;
      --font-mono:     'JetBrains Mono', monospace;
    }

    html, body, #root { height: 100%; background: var(--bg-base); color: var(--text-primary); font-family: var(--font-ui); }

    .grid-bg {
      background-image:
        linear-gradient(var(--border) 1px, transparent 1px),
        linear-gradient(90deg, var(--border) 1px, transparent 1px);
      background-size: 40px 40px;
      background-position: center center;
    }

    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: var(--bg-base); }
    ::-webkit-scrollbar-thumb { background: var(--border-bright); border-radius: 3px; }

    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(16px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes pulse-dot {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.3; }
    }
    @keyframes slideIn {
      from { opacity: 0; transform: translateX(12px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    .fade-up { animation: fadeUp 0.5s cubic-bezier(0.22,1,0.36,1) both; }
    .fade-up-2 { animation: fadeUp 0.5s 0.1s cubic-bezier(0.22,1,0.36,1) both; }
    .fade-up-3 { animation: fadeUp 0.5s 0.2s cubic-bezier(0.22,1,0.36,1) both; }

    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      font-family: var(--font-ui); font-size: 13px; font-weight: 600; letter-spacing: 0.03em;
      padding: 7px 16px; border-radius: 6px; border: 1px solid transparent;
      cursor: pointer; transition: all 0.15s ease; white-space: nowrap;
    }
    .btn-cyan {
      background: var(--cyan); color: #000; border-color: var(--cyan);
    }
    .btn-cyan:hover { background: #33ecff; box-shadow: 0 0 16px var(--cyan-glow); }
    .btn-ghost {
      background: transparent; color: var(--text-secondary); border-color: var(--border-bright);
    }
    .btn-ghost:hover { background: var(--bg-hover); color: var(--text-primary); border-color: var(--cyan-dim); }
    .btn-run {
      background: var(--green); color: #000; border-color: var(--green);
    }
    .btn-run:hover { background: #33ffbc; box-shadow: 0 0 16px rgba(0,255,163,0.2); }
    .btn-run:active { transform: scale(0.97); }
    .btn-run.loading { opacity: 0.7; cursor: not-allowed; }

    .input-field {
      background: var(--bg-elevated); border: 1px solid var(--border-bright);
      color: var(--text-primary); font-family: var(--font-mono); font-size: 14px;
      padding: 10px 16px; border-radius: 8px; outline: none; transition: border-color 0.2s, box-shadow 0.2s;
    }
    .input-field::placeholder { color: var(--text-muted); }
    .input-field:focus { border-color: var(--cyan); box-shadow: 0 0 0 3px var(--cyan-glow); }

    .lang-select {
      background: var(--bg-elevated); border: 1px solid var(--border-bright);
      color: var(--text-primary); font-family: var(--font-ui); font-size: 12px; font-weight: 600;
      padding: 6px 10px; border-radius: 6px; outline: none; cursor: pointer;
      transition: border-color 0.15s;
    }
    .lang-select:hover, .lang-select:focus { border-color: var(--cyan-dim); }

    .room-badge {
      display: inline-flex; align-items: center; gap: 6px;
      background: var(--bg-elevated); border: 1px solid var(--border-bright);
      padding: 5px 12px; border-radius: 20px; font-size: 12px; font-family: var(--font-mono);
      color: var(--text-secondary);
    }
    .live-dot {
      width: 7px; height: 7px; border-radius: 50%; background: var(--green);
      animation: pulse-dot 1.8s ease-in-out infinite;
    }
    .remote-cursor {
      border-left: 3px solid red;
      height: 18px;
    }

    .output-line { animation: slideIn 0.2s ease both; }
  `}</style>
);

// ── Status bar at bottom ──────────────────────────────────────────────────────
function StatusBar({ roomId, language, connected }) {
  return (
    <div style={{
      height: 26,
      background: connected ? "var(--cyan)" : "var(--red)",
      display: "flex", alignItems: "center", gap: 16,
      padding: "0 16px",
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      color: "#000",
      flexShrink: 0,
    }}>
      <span style={{ fontWeight: 600 }}>{connected ? "⚡ LIVE" : "✕ OFFLINE"}</span>
      <span style={{ opacity: 0.6 }}>|</span>
      <span>room: {roomId}</span>
      <span style={{ opacity: 0.6 }}>|</span>
      <span>{language.toUpperCase()}</span>
    </div>
  );
}

// ── HOME ──────────────────────────────────────────────────────────────────────
function Home() {
  const navigate = useNavigate();
  const [input, setInput] = useState("");

  // ✅ FIX: All hooks called at top level, before any conditional logic
  const { loginWithRedirect, isAuthenticated, logout, isLoading } = useAuth0();

  const handleJoin = () => {
    if (input.trim()) navigate(`/room/${input.trim()}`);
  };

  const genRoomId = () => {
    const id = Math.random().toString(36).slice(2, 8).toUpperCase();
    setInput(id);
  };

  if (isLoading) {
    return (
      <>
        <GlobalStyles />
        <div className="grid-bg" style={{
          minHeight: "100vh", display: "flex",
          alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            Loading...
          </span>
        </div>
      </>
    );
  }

  return (
    <>
      <GlobalStyles />
      <div className="grid-bg" style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: 24,
      }}>
        {/* Logo mark */}
        <div className="fade-up" style={{ marginBottom: 48, textAlign: "center" }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-bright)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 26, margin: "0 auto 20px",
            boxShadow: "0 0 32px var(--cyan-glow)",
          }}>⌨️</div>
          <h1 style={{
            fontFamily: "var(--font-ui)", fontWeight: 800, fontSize: "clamp(32px,6vw,52px)",
            letterSpacing: "-0.03em", lineHeight: 1,
            color: "var(--text-primary)",
          }}>
            Live<span style={{ color: "var(--cyan)" }}>Code</span>
          </h1>
          <p style={{
            marginTop: 10, fontSize: 14, color: "var(--text-secondary)",
            fontFamily: "var(--font-mono)",
          }}>
            real-time collaborative code editing
          </p>
        </div>

        {/* Card */}
        <div className="fade-up-2" style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-bright)",
          borderRadius: 16,
          padding: 32,
          width: "100%", maxWidth: 400,
          boxShadow: "0 24px 48px rgba(0,0,0,0.4)",
        }}>
          {/* ✅ FIX: Auth buttons are now actually rendered inside the JSX return */}
          {!isAuthenticated ? (
            <div style={{ marginBottom: 20 }}>
              <button
                className="btn btn-cyan"
                style={{ width: "100%", justifyContent: "center" }}
                onClick={() => loginWithRedirect()}
              >
                🔐 Login to Continue
              </button>
            </div>
          ) : (
            <>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginBottom: 16,
              }}>
                <span style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                  ✅ Logged in
                </span>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12, padding: "4px 10px" }}
                  onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
                >
                  Logout
                </button>
              </div>

              <label style={{
                display: "block", fontSize: 11, fontWeight: 600,
                letterSpacing: "0.12em", color: "var(--text-muted)",
                textTransform: "uppercase", marginBottom: 8,
              }}>Room ID</label>

              <input
                className="input-field"
                style={{ width: "100%", marginBottom: 12 }}
                placeholder="e.g. A3X9FQ"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleJoin()}
              />

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn btn-cyan"
                  style={{ flex: 1, justifyContent: "center" }}
                  onClick={handleJoin}
                >
                  Join Room →
                </button>
                <button className="btn btn-ghost" onClick={genRoomId} title="Generate random ID">
                  ⟳
                </button>
              </div>
            </>
          )}

          <div style={{
            marginTop: 20, paddingTop: 20,
            borderTop: "1px solid var(--border)",
            fontSize: 12, color: "var(--text-muted)", textAlign: "center",
            fontFamily: "var(--font-mono)",
          }}>
            share the room ID to collaborate in real-time
          </div>
        </div>

        {/* Features */}
        <div className="fade-up-3" style={{
          display: "flex", gap: 24, marginTop: 40,
          fontSize: 12, color: "var(--text-muted)",
          fontFamily: "var(--font-mono)",
        }}>
          {["⚡ instant sync", "▶ run JS & Python", "💾 auto-save"].map(f => (
            <span key={f}>{f}</span>
          ))}
        </div>
      </div>
    </>
  );
}

//helper function for live cursor
// Injects a <style> tag for each remote user's cursor color
function injectCursorStyle(socketId, color) {
  const styleId = `cursor-style-${socketId}`;
  if (document.getElementById(styleId)) return; // already injected

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    .remote-cursor-${socketId}::before {
      content: '';
      display: inline-block;
      width: 2px;
      height: 18px;
      background: ${color};
      margin-right: 1px;
      vertical-align: text-bottom;
      animation: cursor-blink 1s ease-in-out infinite;
    }
    @keyframes cursor-blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}





// ── EDITOR PAGE ───────────────────────────────────────────────────────────────
function EditorPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();

  // ✅ FIX: ALL hooks must be called unconditionally at the top, before any early returns
  const { user, isAuthenticated, isLoading } = useAuth0();
  const [code, setCode] = useState("");
  const [output, setOutput] = useState([]);
  const [socket, setSocket] = useState(null);
  const [language, setLanguage] = useState("javascript");
  const [running, setRunning] = useState(false);
  const [connected, setConnected] = useState(false);
  const outputRef = useRef(null);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const decorationsRef = useRef([]);

  // Socket
  useEffect(() => {
    const s = io("http://localhost:5000");
    s.on("connect", () => setConnected(true));
    s.on("disconnect", () => setConnected(false));
    setSocket(s);
    return () => s.disconnect();
  }, []);

  // Join room + load
  useEffect(() => {
    if (!socket || !roomId) return;
    socket.emit("join_room", { roomId, userName: user?.name || "Anonymous" });
    fetch(`http://localhost:5000/room/${roomId}`)
      .then(r => r.json())
      .then(d => { if (d?.code) setCode(d.code); })
      .catch(console.error);
  }, [socket, roomId,user]);

  // Listen updates
  useEffect(() => {
    if (!socket) return;
    const handler = (newCode) => setCode(prev => prev !== newCode ? newCode : prev);
    socket.on("code_update", handler);
    return () => socket.off("code_update", handler);
  }, [socket]);

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [output]);

  // Lang sync
  const langHansdler=({language})=>setLanguage(language);
  useEffect(() => {
    if (!socket) return;
    socket.on("language_update", langHandler => {
      setLanguage(language);
    });
    return () => socket.off("language_update",langHandler);
  }, [socket]);

  // Live cursor
  useEffect(() => {
  if (!socket) return;

  const handleCursorUpdate = ({ socketId, position, name, color }) => {
    if (!editorRef.current || !monacoRef.current) return;
    const editor = editorRef.current;
    const monaco = monacoRef.current;

    const newDecorations = editor.deltaDecorations(
      cursorsRef.current[socketId]?.decorations || [],
      [{
        range: new monaco.Range(
          position.lineNumber, position.column,
          position.lineNumber, position.column
        ),
        options: {
          beforeContentClassName: `remote-cursor-${socketId}`,
        },
      }]
    );

    injectCursorStyle(socketId, color);

    let labelEl = document.getElementById(`cursor-label-${socketId}`);
    if (!labelEl) {
      labelEl = document.createElement("div");
      labelEl.id = `cursor-label-${socketId}`;
      labelEl.style.cssText = `
        position: absolute;
        padding: 2px 7px;
        border-radius: 4px;
        font-size: 11px;
        font-family: var(--font-ui);
        font-weight: 600;
        pointer-events: none;
        z-index: 100;
        white-space: nowrap;
        transition: top 0.1s ease, left 0.1s ease;
      `;
      // ✅ Only append if editor DOM exists
      if (editor.getDomNode()) {
        editor.getDomNode().appendChild(labelEl);
      }
    }

    labelEl.textContent = name;
    labelEl.style.background = color;
    labelEl.style.color = "#000";

    const lineHeight = editor.getOption(monaco.editor.EditorOption.lineHeight);
    const scrollTop = editor.getScrollTop();
    const scrollLeft = editor.getScrollLeft();
    const layoutInfo = editor.getLayoutInfo();
    const top = (position.lineNumber - 1) * lineHeight - scrollTop - 20;
    const left = layoutInfo.contentLeft + (position.column - 1) * 7.8 - scrollLeft;

    labelEl.style.top = `${Math.max(0, top)}px`;
    labelEl.style.left = `${Math.max(layoutInfo.contentLeft, left)}px`;

    cursorsRef.current[socketId] = { decorations: newDecorations };
  };

  const handleCursorRemove = ({ socketId }) => {
    const editor = editorRef.current;
    if (!editor) return;

    if (cursorsRef.current[socketId]?.decorations) {
      editor.deltaDecorations(cursorsRef.current[socketId].decorations, []);
    }

    document.getElementById(`cursor-label-${socketId}`)?.remove();
    document.getElementById(`cursor-style-${socketId}`)?.remove();
    delete cursorsRef.current[socketId];
  };

  socket.on("cursor_update", handleCursorUpdate);
  socket.on("cursor_remove", handleCursorRemove);

  // ✅ Proper cleanup — removes exactly these handlers
  return () => {
    socket.off("cursor_update", handleCursorUpdate);
    socket.off("cursor_remove", handleCursorRemove);
  };
}, [socket]); // ← socket only, no missing deps

  // Output sync
  useEffect(() => {
    if (!socket) return;
    socket.on("code_output", ({ output }) => {
      const lines = (output || "").split("\n").filter(Boolean);
      setOutput(prev => [
        ...prev,
        ...lines.map(l => ({ type: "out", text: l })),
        { type: "meta", text: "✓ finished" },
      ]);
      setRunning(false);
    });
    return () => socket.off("code_output");
  }, [socket, language]);

  // ✅ FIX: Early returns AFTER all hooks
  if (isLoading) {
    return (
      <>
        <GlobalStyles />
        <div style={{
          height: "100vh", display: "flex",
          alignItems: "center", justifyContent: "center",
          background: "var(--bg-base)",
        }}>
          <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            Loading...
          </span>
        </div>
      </>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <GlobalStyles />
        <div style={{
          height: "100vh", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 16,
          background: "var(--bg-base)",
        }}>
          <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 14 }}>
            🔒 You must be logged in to access this room.
          </span>
          <button className="btn btn-cyan" onClick={() => navigate("/")}>
            ← Go to Login
          </button>
        </div>
      </>
    );
  }

  const runCode = () => {
    if (!socket) return;
    setRunning(true);
    setOutput(prev => [...prev, { type: "cmd", text: `▶ Running ${language}...` }]);
    socket.emit("run_code", { roomId, code, language });
  };

  const clearOutput = () => setOutput([]);

  const lineColor = (type) => {
    if (type === "err") return "var(--red)";
    if (type === "cmd") return "var(--amber)";
    if (type === "meta") return "var(--text-muted)";
    return "var(--green)";
  };

  return (
    <>
      <GlobalStyles />
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--bg-base)" }}>

        {/* ── Navbar ── */}
        <div style={{
          height: 52, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 16px",
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
          gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontFamily: "var(--font-ui)", fontWeight: 800, fontSize: 18, letterSpacing: "-0.03em" }}>
              Live<span style={{ color: "var(--cyan)" }}>Code</span>
            </span>
            <div style={{ width: 1, height: 20, background: "var(--border-bright)" }} />
            <div className="room-badge">
              <span className="live-dot" />
              {roomId}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* ✅ user.name is safe here because we've already checked isAuthenticated above */}
            {user && (
              <div style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                👤 {user.name}
              </div>
            )}

            <select
              className="lang-select"
              value={language}
              onChange={e => {
                const newLang = e.target.value;
                setLanguage(newLang);
                if (socket) socket.emit("language_change", { roomId, language: newLang });
              }}
            >
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
            </select>

            <button
              className={`btn btn-run ${running ? "loading" : ""}`}
              onClick={runCode}
              disabled={running}
            >
              {running ? "●" : "▶"} {running ? "Running" : "Run"}
            </button>

            <button
              className="btn btn-ghost"
              onClick={() => {
                if (socket) {
                  socket.emit("leave_room", roomId);
                  socket.disconnect();
                }
                navigate("/");
              }}
            >
              Leave
            </button>
          </div>
        </div>

        {/* ── Main ── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* Editor */}
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            borderRight: "1px solid var(--border)",
            minWidth: 0,
          }}>
            <div style={{
              height: 34, display: "flex", alignItems: "center",
              padding: "0 16px", gap: 8,
              background: "var(--bg-elevated)",
              borderBottom: "1px solid var(--border)",
              fontSize: 12, color: "var(--text-secondary)",
              fontFamily: "var(--font-mono)",
              flexShrink: 0,
            }}>
              <span style={{
                padding: "2px 12px", borderRadius: 4,
                background: "var(--bg-surface)",
                border: "1px solid var(--border-bright)",
                borderBottom: "1px solid var(--cyan)",
                color: "var(--text-primary)",
              }}>
                {language === "javascript" ? "index.js" : "main.py"}
              </span>
            </div>

            <div style={{ flex: 1 }}>
              <Editor
                onMount={(editor, monaco) => {
                  editorRef.current = editor;
                  monacoRef.current = monaco;
                  editor.onDidChangeCursorPosition((e) => {
                    if (!socket) return;
                    socket.emit("cursor_move", { roomId, position: e.position });
                  });
                  editor.onDidScrollChange(() => {
  // Re-trigger a cursor_move so positions recalculate
  // This is handled automatically since labels reposition on every cursor_update
});
                }}
                theme="vs-dark"
                height="100%"
                language={language}
                value={code}
                options={{
                  fontSize: 14,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontLigatures: true,
                  lineHeight: 22,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  renderLineHighlight: "gutter",
                  cursorBlinking: "smooth",
                  smoothScrolling: true,
                  padding: { top: 16, bottom: 16 },
                  overviewRulerBorder: false,
                }}
                onChange={value => {
                  const newCode = value || "";
                  setCode(newCode);
                  if (socket) socket.emit("code_change", { roomId, code: newCode });
                }}
              />
            </div>
          </div>

          {/* Output panel */}
          <div style={{
            width: 340,
            display: "flex", flexDirection: "column",
            background: "var(--bg-surface)",
            flexShrink: 0,
          }}>
            <div style={{
              height: 34, display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "0 16px",
              background: "var(--bg-elevated)",
              borderBottom: "1px solid var(--border)",
              flexShrink: 0,
            }}>
              <span style={{
                fontSize: 11, fontWeight: 600, letterSpacing: "0.1em",
                textTransform: "uppercase", color: "var(--text-muted)",
                fontFamily: "var(--font-ui)",
              }}>Terminal</span>
              <button
                onClick={clearOutput}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 11, color: "var(--text-muted)",
                  fontFamily: "var(--font-mono)", padding: "2px 6px",
                  borderRadius: 4, transition: "color 0.15s",
                }}
                onMouseEnter={e => e.target.style.color = "var(--text-primary)"}
                onMouseLeave={e => e.target.style.color = "var(--text-muted)"}
              >
                clear
              </button>
            </div>

            <div
              ref={outputRef}
              style={{
                flex: 1, overflowY: "auto", padding: 16,
                fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.7,
              }}
            >
              {output.length === 0 ? (
                <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                  {"// output will appear here"}
                </span>
              ) : (
                output.map((line, i) => (
                  <div
                    key={i}
                    className="output-line"
                    style={{
                      color: lineColor(line.type),
                      opacity: line.type === "meta" ? 0.5 : 1,
                      fontSize: line.type === "meta" ? 11 : 13,
                      marginBottom: line.type === "meta" ? 8 : 0,
                      animationDelay: `${i * 0.03}s`,
                    }}
                  >
                    {line.text}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── Status bar ── */}
        <StatusBar roomId={roomId} language={language} connected={connected} />
      </div>
    </>
  );
}

// ── ROUTES ────────────────────────────────────────────────────────────────────
function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/room/:roomId" element={<EditorPage />} />
    </Routes>
  );
}

export default App;
