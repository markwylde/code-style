import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

const appRoot = document.getElementById("app");

if (!appRoot) {
  throw new Error("Missing #app root element");
}

ReactDOM.createRoot(appRoot).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
