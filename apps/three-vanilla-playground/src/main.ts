import "./styles.css";
import { createRuntimePlaygroundApp } from "./app";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing root element.");
}

createRuntimePlaygroundApp(root);
