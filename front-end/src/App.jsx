import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";

import { AnimatePresence, motion } from "framer-motion";

import AppShell      from "./components/AppShell";
import ErrorBoundary from "./components/ErrorBoundary";

import DashboardPage    from "./pages/DashboardPage";
import UploadPage       from "./pages/UploadPage";
import CalendarPage     from "./pages/CalendarPage";
import TasksPage        from "./pages/TasksPage";
import SearchPage       from "./pages/SearchPage";
import NotesPage        from "./pages/NotesPage";
import TimelinePage     from "./pages/TimelinePage";
import TrashPage        from "./pages/TrashPage";
import AuditLogPage     from "./pages/AuditLogPage";
import SystemStatusPage from "./pages/SystemStatusPage";
import LoadingScreen    from "./components/LoadingScreen";

import { useEffect, useState } from "react";

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.35 }}
      >
        <Routes location={location}>
          <Route path="/"          element={<ErrorBoundary><DashboardPage /></ErrorBoundary>} />
          <Route path="/dashboard" element={<ErrorBoundary><DashboardPage /></ErrorBoundary>} />
          <Route path="/upload"    element={<ErrorBoundary><UploadPage /></ErrorBoundary>} />
          <Route path="/calendar"  element={<ErrorBoundary><CalendarPage /></ErrorBoundary>} />
          <Route path="/tasks"     element={<ErrorBoundary><TasksPage /></ErrorBoundary>} />
          <Route path="/search"    element={<ErrorBoundary><SearchPage /></ErrorBoundary>} />
          <Route path="/notes"     element={<ErrorBoundary><NotesPage /></ErrorBoundary>} />
          <Route path="/timeline"  element={<ErrorBoundary><TimelinePage /></ErrorBoundary>} />
          <Route path="/trash"     element={<ErrorBoundary><TrashPage /></ErrorBoundary>} />
          <Route path="/audit"     element={<ErrorBoundary><AuditLogPage /></ErrorBoundary>} />
          <Route path="/status"    element={<ErrorBoundary><SystemStatusPage /></ErrorBoundary>} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

function App() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1800);
    return () => clearTimeout(timer);
  }, []);

  if (loading) return <LoadingScreen />;

  return (
    <BrowserRouter>
      <AppShell>
        <AnimatedRoutes />
      </AppShell>
    </BrowserRouter>
  );
}

export default App;
