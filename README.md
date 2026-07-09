# LiveCode: Collaborative Coding Platform Documentation & Interview Preparation Guide

This document serves as an end-to-end technical analysis and architectural review of the **LiveCode** project repository. It is designed to function both as comprehensive project documentation and as a specialized reference for technical interview preparation, focusing on patterns, data structures, event models, and engineering trade-offs.

---

## 1. Project Overview

### What the Project Does (Plain Language)
**LiveCode** is a real-time, collaborative web-based IDE (Integrated Development Environment). It allows multiple developers to join a shared workspace (a "room") via a unique Room ID. Once in the room, users can see each other's edits instantly, track the movement of peers' text cursors in real-time, synchronize active programming languages (JavaScript and Python), write code, run it through an integrated secure runtime, and view execution results in a shared output terminal.

### What Problem It Solves & For Whom
- **The Problem:** Setting up pair programming environments or conducting technical interviews remotely is highly friction-filled. Standard approaches—like screen sharing—suffer from high latency, prevent concurrent editing, and limit viewer interaction. Alternatively, copy-pasting code fragments through chat clients disrupts flow and loses execution state.
- **The Audience:** Technical interviewers, remote engineering teams pair-programming on algorithms, and online instructors who want to demonstrate code interactively without local environment setups.
- **The Solution:** A lightweight browser-based workspace providing real-time text synchronization, multi-user cursor visualization, and sandbox compilation without requiring local compilers or runtimes.

### What Makes this Project Non-Trivial (Specific Code Decisions)
Rather than a basic tutorial application, the implementation handles complex operational details:
1. **Low-Level Monaco API Integration:** Instead of standard text boxes, the application utilizes Microsoft's Monaco Editor. It hooks into Monaco's layout engine to compute absolute pixel positions for remote cursors and names relative to line height, scroll state, and gutter dimensions, synchronizing visual labels dynamically on scroll events.
2. **Stale Closure Mitigation via React Refs:** The application binds Monaco's callback listeners (such as `editor.onDidChangeCursorPosition`) at mount time. To prevent React's state closures from holding a stale reference to the active Socket.IO connection, the system uses a mutable React ref (`socketRef.current`) as a dynamic channel indicator.
3. **Optimistic UI with Peer-Only Socket Broadcasting:** To avoid the "echo effect" (where typing a character broadcasts to the server, which then sends the character back to the typist, disrupting cursor position and causing infinite loops), the backend utilizes peer-targeted broadcasting (`socket.to(roomId).emit`) instead of general room broadcasting (`io.to(roomId).emit`).
4. **Dynamic CSS Generation for Virtual Cursors:** Because Tailwind CSS and standard inline React styles cannot easily register animated keyframes and border styling linked to dynamically generated client hex colors in Monaco, the app implements a runtime CSS stylesheet injector (`injectCursorStyle`) that appends custom styling directly to `document.head`.
5. **Mongoose-Backed Real-Time Upserts:** Edits are written asynchronously to MongoDB in the background using `findOneAndUpdate` with `{ upsert: true }`, ensuring that room sessions persist across connections without blocking client thread execution with synchronous DB write requirements.
6. **Remote Sandbox Integration:** The backend wraps Judge0's REST endpoints inside the Socket.IO event handler, translating standard code-runs into sandboxed API requests and piping the response stdout/stderr safely to the collaborative terminal.

---

## 2. Tech Stack Summary

The project consists of a React Single Page Application (SPA) frontend and a Node.js Express server backend. Below is the breakdown of the technologies used:

### Backend Stack (`backend/package.json`)
* **Node.js & Express (v5.2.1):** Serves as the web framework to expose HTTP APIs (e.g. static endpoint checks and specific REST calls for code execution/historical room loading).
* **Socket.IO (v4.8.3):** Establishes bi-directional, event-driven WebSocket connections between server and client, managing room scopes and multi-user events.
* **Mongoose (v9.3.3):** Serves as the Object Data Modeling (ODM) layer for MongoDB, structuring the `Room` data schema and executing queries.
* **CORS (v2.8.6):** Configures middleware to allow the React client (origin A) to access Express resources (origin B) across domains.
* **bcryptjs (v3.0.3) & jsonwebtoken (v9.0.3) *(Unused)*:** Declared in dependencies but not imported in the server logic. This suggests a legacy or pre-planned credential-auth module that was superseded by client-side Auth0.

### Frontend Stack (`frontend/package.json`)
* **React (v19.2.4) & React-DOM:** The primary UI framework, managing reactive states (for cursor positions, terminal output, and active languages) and component rendering.
* **React Router DOM (v7.14.0):** Manages single-page client routing, enabling clean splits between the landing controller (`/`) and active workspaces (`/room/:roomId`).
* **@auth0/auth0-react (v2.16.1):** Integrates stateless social authentication, shielding rooms behind Auth0 Identity Provider (IdP) login flows and feeding verified user profiles (`user.name`) into socket packets.
* **@monaco-editor/react (v4.7.0):** Integrates the Monaco Editor into React, exposing editor instances, range coordinates, and scrolling boundaries.
* **Socket.IO Client (v4.8.3):** Establishes the browser connection to the Express Socket.IO server, emitting local changes and registering listeners.
* **TailwindCSS (v4.2.2):** Used for standard layout utility variables and responsive alignment blocks in the React views.
* **Vite (v8.0.1):** Serves as the high-performance local dev server and asset bundle compiler.

---

## 3. Project Structure Walkthrough

### Codebase File Directory Tree
```text
live_code/
├── backend/
│   ├── models/
│   │   └── Room.js        # Mongoose schema mapping Room model (roomId, code string)
│   ├── package.json       # Backend configurations & dependency manifests
│   ├── server.js          # Main entrypoint: WebSockets, REST routing, Mongoose connection
│   ├── temp.js            # Unused scratch file
│   └── temp.py            # Unused scratch file
└── frontend/
    ├── .env               # Auth0 client configuration keys
    ├── index.html         # HTML root page structure
    ├── package.json       # Frontend scripts and dependency versions
    ├── vite.config.js     # Dev server configuration for Vite
    └── src/
        ├── App.css        # Scaffolding styles for templates
        ├── index.css      # Custom design typography and default variables
        ├── App.jsx        # Core UI: Home (Login/Room entry) and EditorPage (Socket client, Monaco hooks)
        ├── main.jsx       # Mounts React DOM with Auth0Provider and BrowserRouter
        └── initial.jsx    # Legacy, unstyled developmental prototype of the application (reference)
```

### Responsibility of Major Files & Folders
* **`backend/server.js`:** The backend server orchestrator. It connects to MongoDB, initializes the Node HTTP server, attaches Socket.IO, manages the active `roomUsers` state database in-memory, hooks up the Judge0 API calls, and exposes HTTP paths.
* **`backend/models/Room.js`:** Exposes the mongoose schema [Room.js](file:///C:/Users/Manoj/.gemini/antigravity/scratch/live_code/backend/models/Room.js). Maps a simple relational structure matching a string-based `roomId` to a text-based `code` block.
* **`frontend/src/main.jsx`:** The React bootstrapper [main.jsx](file:///C:/Users/Manoj/.gemini/antigravity/scratch/live_code/frontend/src/main.jsx). It wraps the entire application with two major providers: `<Auth0Provider>` for identity checks, and `<BrowserRouter>` to enable navigation.
* **`frontend/src/App.jsx`:** The core frontend application [App.jsx](file:///C:/Users/Manoj/.gemini/antigravity/scratch/live_code/frontend/src/App.jsx). It injects CSS overrides, contains the `Home` view (where Auth0 checks authentication status and room ID forms), and holds the `EditorPage` containing Monaco, Socket listeners, and UI components.
* **`frontend/src/initial.jsx`:** A simplified reference prototype [initial.jsx](file:///C:/Users/Manoj/.gemini/antigravity/scratch/live_code/frontend/src/initial.jsx) containing basic logic without the custom visual styling and status bar layers.

---

### Step-by-Step Data and Request Flow: Collaborative Live Editing
Below is the sequence of actions that occur when User A types into the Monaco Editor, updating User B's screen in real-time, and persisting the content:

```mermaid
sequenceDiagram
    autonumber
    actor UserA as User A (Browser)
    participant MonacoA as Monaco Editor (A)
    participant WS_ClientA as Socket.io Client (A)
    participant Server as Node.js Backend
    participant MongoDB as MongoDB
    actor UserB as User B (Browser)
    participant MonacoB as Monaco Editor (B)

    UserA->>MonacoA: Typess character 'x'
    MonacoA->>MonacoA: Triggers onChange handler
    MonacoA->>WS_ClientA: Fires state update (setCode) and socket emit
    WS_ClientA->>Server: emit("code_change", { roomId: "123", code: "const x = 5;" })
    
    rect rgb(20, 30, 45)
        Note over Server: Server receives "code_change"
        Server->>UserB: socket.to("123").emit("code_update", "const x = 5;")
        Server->>MongoDB: Room.findOneAndUpdate({roomId: "123"}, {code: "const x = 5;"}, {upsert: true})
    end

    UserB->>MonacoB: Listen code_update event
    MonacoB->>MonacoB: setCode(newCode)
    Note over MonacoB: Editor B value updates to "const x = 5;" without firing loopback
```

#### Detailed steps:
1. **Keystroke Registration:** User A types in the editor. Monaco triggers the `onChange` event in `App.jsx`:
   ```javascript
   onChange={value => {
     const newCode = value || "";
     setCode(newCode);
     if (socket) socket.emit("code_change", { roomId, code: newCode });
   }}
   ```
2. **WebSockets Push:** The client socket emits `code_change` payload containing the current `roomId` and full document string to the server.
3. **Backend Processing:** In `backend/server.js`, the socket server catches `code_change`:
   ```javascript
   socket.on("code_change", async ({ roomId, code }) => {
     socket.to(roomId).emit("code_update", code);
     await Room.findOneAndUpdate({ roomId }, { code }, { upsert: true });
   });
   ```
4. **Peer Broadcasting:** The server utilizes `socket.to(roomId)` to broadcast `code_update` to all socket IDs joined in `roomId` **except** the original sender.
5. **Database Persistence:** Concurrently, Mongoose updates the MongoDB document matching the `roomId` key. If no record matches, `{ upsert: true }` writes a new entry.
6. **Peer Screen Update:** User B's client listens for `code_update`. Its state hook handles the text injection:
   ```javascript
   const handler = (newCode) => setCode(prev => prev !== newCode ? newCode : prev);
   socket.on("code_update", handler);
   ```
   The conditional check `prev !== newCode` verifies if changes exist, avoiding unnecessary Virtual DOM diff updates. Monaco receives the new value via the `value` prop and re-renders.

---

## 4. Concept-by-Concept Deep Dive

### Concept 1: Real-time Communication (Socket.IO & WebSockets)

#### A. What It Is (Theory)
WebSockets is a persistent, full-duplex communication protocol built on top of TCP. It differs from HTTP because HTTP is unidirectional (client requests, server responds) and stateless, requiring the overhead of header payloads on every transaction. 

A WebSocket connection begins as an HTTP request with an `Upgrade` header. Once the handshake is accepted, the connection changes from HTTP to a persistent TCP link, allowing both parties to push text or binary data frames back and forth with minimal latency. **Socket.IO** is an abstraction library wrapping raw WebSockets. It adds fallbacks (like HTTP long-polling if WebSockets are blocked by firewalls), automatic reconnection, heartbeat packets, and logical abstractions like "rooms" and "namespaces" out of the box.

#### B. Implementation Details
* **Connection Handshake:** In `backend/server.js`, the HTTP server is bound to Socket.IO:
  ```javascript
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: "*" } });
  ```
* **Room Joining:** Sockets join rooms using `socket.join(roomId)`:
  ```javascript
  socket.on("join_room", ({ roomId, userName }) => {
    socket.join(roomId);
    if (!roomUsers[roomId]) roomUsers[roomId] = {};
    const colorIndex = Object.keys(roomUsers[roomId]).length % USER_COLORS.length;
    roomUsers[roomId][socket.id] = {
      name: userName || "Anonymous",
      color: USER_COLORS[colorIndex],
    };
    io.to(roomId).emit("room_users", roomUsers[roomId]);
  });
  ```
* **Frontend Connection:** In `frontend/src/App.jsx`, a React hook establishes the connection on mount:
  ```javascript
  useEffect(() => {
    const s = io("http://localhost:5000");
    s.on("connect", () => setConnected(true));
    s.on("disconnect", () => setConnected(false));
    socketRef.current = s;
    setSocket(s);
    return () => s.disconnect();
  }, []);
  ```

#### C. Why It Was Needed
Collaborative editors require updates to reflect in sub-second times to maintain typing flow. If standard HTTP polling were used, the client would have to ping the server every 100ms. This would create massive network overhead (thousands of useless request headers per user), lag behind fast typing, and overwhelm server thread execution.

#### D. Interview Questions & Model Answers
* **Q1: Why use Socket.IO instead of raw WebSockets for this application?**
  * *Answer:* Raw WebSockets lack built-in connection management. We would have to manually implement reconnection logic, heartbeat checks to detect dead links, and room groupings to isolate users. Socket.IO abstracts rooms natively via `socket.join(roomId)` and handles connection state fallbacks automatically.
* **Q2: What is the difference between `io.to(roomId).emit` and `socket.to(roomId).emit`?**
  * *Answer:* `io.to(roomId).emit` sends the socket event to *all* clients inside the room, including the client that initiated the call. `socket.to(roomId).emit` targets only the *other* sockets inside that room, excluding the sender socket itself.
* **Q3: How does the server track which users are in which rooms?**
  * *Answer:* Socket.IO maintains an internal map of rooms and sockets. In this project, we also maintain a custom in-memory store `roomUsers` object: `{ roomId: { socketId: { name, color } } }` that correlates socket connections to descriptive names and assigned cursor colors.
* **Q4: How would you scale Socket.IO horizontally across multiple servers?**
  * *Answer:* By default, Socket.IO stores room lists and connection maps in server memory. If we scale to multiple instances, users connected to Server A won't receive messages from users on Server B. To scale, we must introduce a Redis Adapter (`@socket.io/redis-adapter`). This uses Redis Pub/Sub channels to broadcast socket events to all server instances, ensuring that rooms span across servers.

#### E. Trade-offs & Alternatives
* **Alternative 1: Server-Sent Events (SSE)**
  * *Pros:* Native HTTP browser protocol, simpler to configure, supports reconnection natively, bypasses CORS complexities.
  * *Cons:* Unidirectional (server-to-client). To send changes back, clients would have to make separate HTTP POST requests, adding network latency for typing events.
* **Alternative 2: WebRTC Data Channels**
  * *Pros:* Direct peer-to-peer communication, bypassing the server entirely for document syncing. Excellent latency.
  * *Cons:* Extremely complex connection negotiation (STUN/TURN servers needed to punch through NATs). If a peer leaves, saving the final document state requires separate backend synchronization.

---

### Concept 2: Monaco Editor API & Document Decorations

#### A. What It Is (Theory)
Monaco Editor is a model-view controller based text editor. The **Model** holds the document buffer and AST tokenizations, while the **View** handles drawing layout elements, line numbers, and cursors. 

Because we cannot easily manipulate Monaco's internal DOM nodes without breaking layout coordinates, Monaco exposes a **Decorations API**. A decoration is a visual styling construct bound to a coordinate range: `new monaco.Range(startLineNumber, startColumn, endLineNumber, endColumn)`. By calling `deltaDecorations(oldDecorations, newDecorations)`, Monaco swaps out specific DOM markers in a single, high-performance reflow pass.

#### B. Implementation Details
* **Cursor Movements:** The application registers a listener on editor cursor movement inside `App.jsx` in the Monaco `onMount` function:
  ```javascript
  editor.onDidChangeCursorPosition((e) => {
    const s = socketRef.current;
    if (!s) return;
    s.emit("cursor_move", { roomId, position: e.position });
  });
  ```
* **Decoration Update and Dynamic Style Injection:** When a remote cursor update arrives, the client injects a custom cursor border stylesheet (since colors are dynamic and cannot be hardcoded in global CSS) and applies it:
  ```javascript
  const newDecorations = editor.deltaDecorations(
    cursorsRef.current[socketId]?.decorations || [],
    [{
      range: new monaco.Range(
        position.lineNumber, position.column,
        position.lineNumber, position.column
      ),
      options: { className: `remote-cursor-${socketId}` },
    }]
  );
  injectCursorStyle(socketId, color);
  ```

#### C. Why It Was Needed
Standard HTML textarea components do not support visual features like custom range highlights, syntax checking, autocomplete, or multi-user cursors. Monaco provides these features. However, rendering a peer's typing point requires adding cursor markers onto Monaco's editor grid at the exact row/column, updating positions dynamically as the remote user types.

#### D. Interview Questions & Model Answers
* **Q1: Why does the code use `deltaDecorations` instead of updating the DOM directly for remote cursors?**
  * *Answer:* Monaco renders components dynamically on a virtual canvas based on scroll coordinates. If you insert DOM elements directly, Monaco will delete them during its next redraw or scroll event. `deltaDecorations` registers cursors in Monaco's internal layout queue, forcing Monaco to manage and scroll them.
* **Q2: What is the purpose of `injectCursorStyle`?**
  * *Answer:* Cursors are assigned dynamic hex codes based on who joins. Since we cannot write infinite pre-defined classes in CSS, `injectCursorStyle` dynamically creates a custom CSS style block in the head for `remote-cursor-${socketId}`, binding the cursor's unique hex code to a blinking animation.
* **Q3: What does `Range(line, col, line, col)` mean in Monaco?**
  * *Answer:* It specifies a 2D text bounding box. For a cursor (which is a single line, 0-character wide point), the start line/column and end line/column are identical.

#### E. Trade-offs & Alternatives
* **Alternative 1: CodeMirror**
  * *Pros:* Lighter weight, works better on mobile browsers, simpler DOM tree structure, easier to write custom extensions for.
  * *Cons:* Lacks Monaco's built-in VS Code look-and-feel, complex keymaps, and lacks integrated multi-language autocompletes by default.

---

### Concept 3: Database Storage and Schema Design (MongoDB & Mongoose)

#### A. What It Is (Theory)
MongoDB is a document-oriented database classified as NoSQL. Documents are stored in BSON (Binary JSON) format. Relational databases enforce structural schemas across static columns, whereas MongoDB is schema-flexible. 

**Mongoose** is an Object Data Modeling (ODM) library for MongoDB. It acts as an abstraction mapper, letting developers define structured schemas on the application layer, handle type casting, hook up middleware, and perform query validation.

#### B. Implementation Details
* **Schema Definition:** In [Room.js](file:///C:/Users/Manoj/.gemini/antigravity/scratch/live_code/backend/models/Room.js):
  ```javascript
  const roomSchema = new mongoose.Schema({
    roomId: String,
    code: String,
  });
  ```
* **Atomic Save Operations:** In `backend/server.js`, updates are run inline within socket listeners using Mongoose upsert parameters:
  ```javascript
  await Room.findOneAndUpdate({ roomId }, { code }, { upsert: true });
  ```
  `{ upsert: true }` instructs the MongoDB query engine to search for a document matching `{ roomId }`. If it is found, it overwrites the `code` field. If not, it creates a new document containing both values.

#### C. Why It Was Needed
WebSockets are ephemeral; they stream messages through server memory. If all users disconnect or the backend server restarts, the collaborative code would be lost. Persisting document changes to MongoDB ensures that when a new peer joins a room, they can download the current code state from a durable store.

#### D. Interview Questions & Model Answers
* **Q1: Why choose a NoSQL database like MongoDB over PostgreSQL for this application?**
  * *Answer:* Real-time editing schemas are simple (primarily room IDs and unstructured code text blocks). We don't need relational operations, joins, or strict database schemas. MongoDB's document-oriented JSON structure matches Node.js data structures, has lower overhead for document writes, and scales easily.
* **Q2: What is the performance concern of running `findOneAndUpdate` on every single socket `code_change` event? How would you fix it?**
  * *Answer:* *Concern:* Typing triggers dozens of keystroke events per second. Running a database write query on every single keypress causes high database load and disk I/O bottlenecks. *Fix:* We can debounce writes. We would store the active code state in Redis or memory, and only commit it to MongoDB every 2-3 seconds, or when users stop typing.
* **Q3: What MongoDB index should be added to improve lookup times?**
  * *Answer:* We should add a unique index to the `roomId` field:
    `roomSchema.index({ roomId: 1 }, { unique: true });`
    Without an index, every room lookup performs a collection scan, checking every document in the database, which slows down as the database grows.

#### E. Trade-offs & Alternatives
* **Alternative: Redis (In-Memory Key-Value)**
  * *Pros:* Incredibly fast. Reads/writes take less than a millisecond, making it ideal for high-throughput typing events.
  * *Cons:* Volatile. If the Redis server crashes and persistence features (AOF/RDB) aren't configured correctly, code data is lost. It is also more memory-expensive than disk-based MongoDB.

---

### Concept 4: Cross-Origin Resource Sharing (CORS)

#### A. What It Is (Theory)
CORS is a browser-enforced security mechanism governed by the **Same-Origin Policy (SOP)**. Under SOP, browser scripts running on Origin A (e.g. `http://localhost:5173`) cannot read API data from Origin B (e.g. `http://localhost:5000`) unless Origin B sends headers indicating approval.

When a client makes a cross-origin request that could modify data (like a POST request or a WebSocket upgrade), the browser sends a **Preflight request** using the `OPTIONS` HTTP method. The server must respond with specific headers, such as `Access-Control-Allow-Origin` and `Access-Control-Allow-Headers`. If these headers are missing or do not match the requesting origin, the browser blocks the response.

#### B. Implementation Details
* **Express CORS Routing:** In `backend/server.js`, the Express app mounts the CORS middleware:
  ```javascript
  const app = express();
  app.use(cors());
  ```
* **Socket.IO CORS Verification:** Because Socket.IO runs on a separate namespace, CORS is configured directly in its constructor:
  ```javascript
  const io = new Server(server, {
    cors: { origin: "*" },
  });
  ```

#### C. Why It Was Needed
During development, the React frontend runs on Vite's development server (defaulting to port `5173`), while the Node.js backend runs on port `5000`. Since the ports differ, they are classified as distinct origins. Without configuring CORS, the browser would block the frontend from connecting to the backend socket server or calling Express API routes.

#### D. Interview Questions & Model Answers
* **Q1: Why does a standard REST API require CORS middleware, but a Socket.IO connection requires additional CORS configurations?**
  * *Answer:* Socket.IO starts as an HTTP handshake request (`/socket.io/`) before upgrading to a WebSocket protocol. The browser treats this handshake as a cross-origin HTTP request. As a result, the socket server must handle CORS preflight approvals explicitly.
* **Q2: Why is configuration `origin: "*"` unsafe for a production application? How do we configure it securely?**
  * *Answer:* `*` allows *any* site on the internet to make requests to our API. In production, this should be locked down to the actual frontend domain:
    `cors({ origin: "https://my-livecode-app.com" })`
* **Q3: What is a preflight request, and when does it occur?**
  * *Answer:* A preflight request is an `OPTIONS` request sent by the browser before the actual request. It checks if the API server supports cross-origin requests. It is triggered when using non-simple HTTP methods (like PUT, DELETE, or POST with `application/json` content types) or when setting custom request headers.

#### E. Trade-offs & Alternatives
* **Alternative: API Reverse Proxying**
  * *Pros:* By using a web server like Nginx, or Vite's dev server `/api` proxy, we route both the frontend assets and backend API through the same host domain (e.g. `http://localhost:5173` and `http://localhost:5173/api`). This matches the same origin, bypassing CORS checks entirely and improving security.
  * *Cons:* Requires setting up a reverse proxy configuration in development and production environments.

---

### Concept 5: OAuth 2.0 & Identity Management (Auth0 Integration)

#### A. What It Is (Theory)
OAuth 2.0 is an authorization framework that enables third-party applications to obtain limited access to an HTTP service. OpenID Connect (OIDC) is an identity layer built on top of OAuth 2.0, providing profiles containing verified details like names, email addresses, and profile pictures.

Rather than managing user databases directly, applications outsource authentication to an **Identity Provider (IdP)** like Auth0. The login flow follows the Authorization Code flow:
1. The app redirects the user to Auth0.
2. The user authenticates securely on Auth0.
3. Auth0 redirects the user back to the application with an authorization code.
4. The client SDK exchanges this code for ID and Access Tokens (encoded as JWTs).
5. The application reads these tokens to verify identity.

#### B. Implementation Details
* **Provider Initialization:** In `frontend/src/main.jsx`, the React root is wrapped with the auth engine:
  ```javascript
  <Auth0Provider
    domain={import.meta.env.VITE_AUTH0_DOMAIN}
    clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
    authorizationParams={{ redirect_uri: window.location.origin }}
  >
  ```
* **Identity Check and Profile Retrieval:** In `frontend/src/App.jsx`, user profiles are retrieved using React hooks:
  ```javascript
  const { user, isAuthenticated, isLoading } = useAuth0();
  ```
  The app verifies `isAuthenticated` before displaying rooms. When connecting to WebSockets, the username is sent to identify cursor points:
  ```javascript
  socket.emit("join_room", { roomId, userName: user?.name || "Anonymous" });
  ```

#### C. Why It Was Needed
Collaborative editors need to label cursors with names so users can identify who is editing. Offloading this to Auth0 saves the developer from managing user tables, password hashing (like `bcryptjs`), token generation (like `jsonwebtoken`), security credentials, and login screens.

#### D. Interview Questions & Model Answers
* **Q1: What are the security advantages of using an IdP like Auth0 over writing a custom authentication backend?**
  * *Answer:* Auth0 handles security issues like password encryption, SQL injection attacks on user tables, rate-limiting brute force login attempts, and implementing multi-factor authentication (MFA). This keeps sensitive credential data out of our database.
* **Q2: How does the app prevent unauthenticated users from accessing editor rooms?**
  * *Answer:* In `App.jsx`, we perform conditional checks on `isAuthenticated` after loading:
    ```javascript
    if (!isAuthenticated) {
      return <button onClick={() => navigate("/")}>Go to Login</button>;
    }
    ```
    If not authenticated, routing path endpoints are blocked, preventing connection to the editor components.
* **Q3: What is a JWT token, and what are its three parts?**
  * *Answer:* A JSON Web Token is a compact, URL-safe container for signing claims. Its three parts are:
    1. **Header:** Identifies the signature algorithm.
    2. **Payload:** Contains the claims (like user ID, email, expiration date).
    3. **Signature:** Cryptographically signs the header and payload using a secret key to prevent tamper attacks.

#### E. Trade-offs & Alternatives
* **Alternative: Custom JWT Auth Backend (using `bcryptjs` and `jsonwebtoken`)**
  * *Pros:* Custom control over user records, runs without third-party dependencies, and avoids third-party subscription costs.
  * *Cons:* Requires building and maintaining database tables, signup flows, password reset paths, and token refresh mechanisms.

---

### Concept 6: Remote Sandboxed Code Execution (Judge0 API)

#### A. What It Is (Theory)
Executing arbitrary code written by web users is highly risky. If code runs directly on the application server, a malicious user could execute shell commands like `rm -rf /` or launch fork bombs to crash the server.

To run code safely, we use a sandboxed execution runtime like **Judge0**. It spins up an isolated, resource-constrained container (e.g. using Docker and gVisor sandboxing) for each code submission. It executes the script, captures the output, enforces CPU and memory limits, and returns stdout or stderr.

#### B. Implementation Details
* **Triggering Run Actions:** The backend exposes a `/run` POST endpoint and a Socket.IO `run_code` listener.
* **Socket-Based API Execution:** When a user clicks "Run", the socket server calls the public Judge0 API:
  ```javascript
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
  ```

#### C. Why It Was Needed
Without a sandboxed runtime, we could not offer code execution features. Using JavaScript's `eval()` on the client is limited to simple JS and cannot run Python. Running execution commands directly on our backend server using Node's `child_process` would create critical security vulnerabilities.

#### D. Interview Questions & Model Answers
* **Q1: Why does the backend handle the Judge0 API request instead of the frontend calling it directly?**
  * *Answer:* By routing execution through the backend, we can secure API keys in production, enforce rate limits, and broadcast the output to *all* users in the room simultaneously so everyone sees the run results.
* **Q2: What is the risk of using `wait=true` on the Judge0 API request?**
  * *Answer:* The `wait=true` flag forces our server to wait synchronously for Judge0 to complete execution. If the user's code has an infinite loop or Judge0 is slow, the thread blocks for several seconds. In production, we should submit the job asynchronously (`wait=false`), receive a token, and poll for completion to keep the Node event loop free.
* **Q3: What do the language IDs `71` and `63` represent in Judge0?**
  * *Answer:* They are Judge0 ID mappings. `71` corresponds to Python (specifically Python 3.8.1), and `63` corresponds to JavaScript (Node.js 12.14.0).

#### E. Trade-offs & Alternatives
* **Alternative: WebAssembly (Wasm) Client Compilation**
  * *Pros:* Code runs directly in the client's browser using local CPU resources. No backend APIs or sandboxes needed, offering fast and free execution.
  * *Cons:* Loading large Python/JS runtimes (like Pyodide) takes time. It also cannot run other compiled languages (like C++ or Java) without downloading massive runtime blobs.

---

## 5. Key Algorithms & Logic

The primary algorithmic challenge in this project is **translating cursor placements from editor space into absolute CSS pixel coordinates**, allowing peer cursor labels to align correctly.

### Algorithmic Visual Rendering: Remote Cursor Positioning

```text
Monaco Text Space: (Line 3, Column 15)
     │
     ▼ [Calculations in repositionLabel]
Line Height: 22px  | Gutter Margin: contentLeft (approx 60px) | Char Width: 8.4px
     │
     ▼ [Scroll Offsets]
Scroll Top: 44px (scrolled down 2 lines) | Scroll Left: 0px
     │
     ▼ [Viewport Pixel Math]
Top:  (3 - 1) * 22 - 44 - 20 = -20px (Shifted above viewport, hide label)
Left: 60 + (15 - 1) * 8.4 - 0 = 177.6px
```

Monaco Editor uses line numbers (1-indexed rows) and columns (1-indexed characters). However, HTML elements require pixel coordinates (`top` and `left` in `px`) to position labels correctly.

#### Code Implementation ([App.jsx:392-407](file:///C:/Users/Manoj/.gemini/antigravity/scratch/live_code/frontend/src/App.jsx#L392-L407)):
```javascript
const repositionLabel = (socketId, position, editor, monaco) => {
  const labelEl = document.getElementById(`cursor-label-${socketId}`);
  if (!labelEl || !editor || !monaco) return;
  const lineHeight = editor.getOption(monaco.editor.EditorOption.lineHeight);
  const scrollTop = editor.getScrollTop();
  const scrollLeft = editor.getScrollLeft();
  const layoutInfo = editor.getLayoutInfo();
  
  // Approx character width for JetBrains Mono 14px
  const charWidth = 8.4;
  const top = (position.lineNumber - 1) * lineHeight - scrollTop - 20;
  const left = layoutInfo.contentLeft + (position.column - 1) * charWidth - scrollLeft;
  
  labelEl.style.top = `${Math.max(0, top)}px`;
  labelEl.style.left = `${Math.max(layoutInfo.contentLeft, left)}px`;
  
  // Hide label if it scrolled above the viewport
  labelEl.style.display = top < -20 ? "none" : "block";
};
```

#### Step-by-Step Logic:
1. **Fetch Layout Metrics:** Retrieve Monaco's line height (usually 22px) and content boundaries (gutter width) using the API.
2. **Apply Scroll Offsets:** Subtract the current scroll offsets (`scrollTop`, `scrollLeft`) to find the cursor's coordinate position relative to the editor viewport.
3. **Calculate Character Offset:** Multiply the target character column by the font's character width (8.4px) to determine horizontal position.
4. **Position CSS Properties:** Set absolute style properties on the label. Keep elements inside visible boundaries using `Math.max`.
5. **Clip Off-Screen Elements:** Set `display: "none"` if the cursor scrolls past the top edge, preventing UI overlapping.
6. **Scroll Event Binding:** This logic executes on Monaco's scroll events, keeping labels pinned to the correct position during fast scrolling.

---

## 6. Challenges & Design Decisions

### 1. Loopback Prevention in Code Sync
* **The Problem:** In collaborative text editors, if User A types and broadcasts changes to the room, the server could send the update back to User A. The frontend would then replace the editor value, resetting User A's local cursor position to the end of the file. This causes cursor lag, infinite event loops, and typing delays.
* **The Decision:** The backend uses `socket.to(roomId).emit("code_update", code)` instead of `io.to(roomId).emit(...)`. This sends the update only to *other* clients in the room. The frontend also checks if the incoming code actually differs from the current buffer before updating state:
  ```javascript
  const handler = (newCode) => setCode(prev => prev !== newCode ? newCode : prev);
  ```
* **Trade-off:** This relies on client-side optimistic updates. If packets drop or arrive out of order, code states between users can drift. Real-time document merge tools like OT (Operational Transformation) or CRDTs (Conflict-free Replicated Data Types) solve this but are much more complex.

### 2. Stale Closures in React Event Listeners
* **The Problem:** Monaco's listener callbacks are registered once when the component mounts. If these callbacks reference the React state variable `socket`, the javascript closure captures the initial value (which is `null`). If the socket connects later, the listener continues to reference `null`, and cursor updates fail.
* **The Decision:** The application stores the socket connection in a mutable React ref (`socketRef.current = s`):
  ```javascript
  const socketRef = useRef(null);
  // ...
  editor.onDidChangeCursorPosition((e) => {
    const s = socketRef.current; // Always references the current connection
    if (!s) return;
    s.emit("cursor_move", { roomId, position: e.position });
  });
  ```
* **Trade-off:** Using mutable refs bypasses React's state checking. Modifying a ref does not trigger a re-render. However, since we only need the ref inside event callbacks, this is the correct approach to avoid unnecessary re-renders.

### 3. Dynamic Stylesheet Injection for Cursors
* **The Problem:** Monaco uses class names to render cursor styling. However, since user cursor colors are assigned dynamically when they join, we cannot define them ahead of time in our static CSS file.
* **The Decision:** The frontend dynamically generates a style block for each user and appends it directly to the HTML document head:
  ```javascript
  const style = document.createElement("style");
  style.id = `cursor-style-${socketId}`;
  style.textContent = `.remote-cursor-${socketId} { border-left: 2px solid ${color} !important; ... }`;
  document.head.appendChild(style);
  ```
* **Trade-off:** Manipulating the DOM directly bypasses React's Virtual DOM. However, since Monaco handles its own rendering lifecycle outside of React, direct DOM injection is necessary to style Monaco's internal code blocks.

### 4. Database Write Amplification
* **The Problem:** Every keystroke emits a `code_change` socket event, which runs `Room.findOneAndUpdate` in MongoDB. Under heavy load (e.g. 5 users typing simultaneously), this can generate hundreds of database writes per second, hitting disk write bottlenecks.
* **The Decision:** The project prioritizes simplicity: it runs updates inline to keep data persistent.
* **Trade-off:** This is easy to write but does not scale well. In a production environment, this should be refactored to cache changes in Redis first, saving to MongoDB only when typing stops or after a set interval.

---

## 7. Quick Revision Sheet (10-Minute Interview Prep)

* **WebSockets vs. HTTP:** WebSockets provide a persistent, full-duplex TCP connection, bypassing HTTP request-response overhead. This makes it ideal for real-time applications like collaborative editors.
* **Socket.IO Rooms:** Abstractions that group socket connections. Events can be sent to all users in a room (`io.to`) or to all users *except* the sender (`socket.to`).
* **Optimistic UI Loopback Prevention:** Sync events must use peer broadcasting (`socket.to`) to prevent the backend from sending typing updates back to the sender, which would reset their cursor position and cause infinite loops.
* **Monaco Decorations API:** Monaco does not allow direct DOM styling. Custom overlays like peer cursors must be registered using `deltaDecorations(old, new)` with target `Range` coordinates.
* **React Ref Closure Fix:** Event listeners registered on mount capture stale state values. Using `useRef` ensures that callbacks can access the latest state (like the active socket connection) without re-binding.
* **Mongoose Upserts:** Using `{ upsert: true }` in queries simplifies backend logic by automatically creating a database record if it doesn't exist.
* **Same-Origin Policy & CORS:** A browser security mechanism that blocks scripts on Origin A from reading API responses from Origin B. Fixed by adding CORS middleware to the backend.
* **OAuth 2.0 Authorization Code Flow:** Securely delegates login tasks to an external identity provider (like Auth0), returning user profiles via secure JWT tokens without storing credentials locally.
* **Code Execution Sandboxing:** Running untrusted user code requires isolation (like Judge0's container environment) to prevent malicious commands from compromising the host server.
