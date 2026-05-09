import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import "./index.css";

import AppShell from "@/components/AppShell";
import { TooltipProvider } from "@/components/ui/Tooltip";
import Controls from "@/pages/Controls";
import Builder from "@/pages/Builder";
import Viz from "@/pages/Viz";
import Editor from "@/pages/Editor";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<Controls />} />
              <Route path="/builder" element={<Builder />} />
              <Route path="/viz" element={<Viz />} />
              <Route path="/editor" element={<Editor />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster
          theme="dark"
          position="top-center"
          richColors
          closeButton
          toastOptions={{
            style: {
              background: "#16161a",
              border: "1px solid #2a2a32",
              color: "#f4f4f6",
              borderRadius: "12px",
            },
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
