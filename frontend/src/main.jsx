// File: main.jsx
// Language: JavaScript (React 18)
// Purpose: Vite entry point — mounts the React app into the DOM.
// Connects to: App.jsx (root component), index.css (global styles)

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
