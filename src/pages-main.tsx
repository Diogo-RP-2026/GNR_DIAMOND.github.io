import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import "./styles.css";
const root = document.getElementById("root");
if (!root) throw new Error("Elemento root em falta.");
createRoot(root).render(<RouterProvider router={getRouter()} />);
