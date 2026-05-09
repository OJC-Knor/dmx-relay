import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";

import Layout from "@/components/Layout";
import { ToastProvider } from "@/components/Toast";
import Controls from "@/pages/Controls";
import Builder from "@/pages/Builder";
import Viz from "@/pages/Viz";
import Editor from "@/pages/Editor";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Controls />} />
              <Route path="/builder" element={<Builder />} />
              <Route path="/viz" element={<Viz />} />
              <Route path="/editor" element={<Editor />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
