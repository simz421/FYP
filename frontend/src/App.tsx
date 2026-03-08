import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import AppLayout from "./components/layout/AppLayout";

import Dashboard from "./pages/Dashboard";
import Telemetry from "./pages/Telemetry";
import Alerts from "./pages/Alerts";
import Topology from "./pages/Topology";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Predictive from "./pages/Predictive";
import Recommendations from "./pages/Recommendations";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Enterprise Shell */}
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/telemetry" element={<Telemetry />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/topology" element={<Topology />} />
          <Route path="/topology/pro" element={<Topology />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/predictive" element={<Predictive />} />
          <Route path="/recommendations" element={<Recommendations />} />
          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
