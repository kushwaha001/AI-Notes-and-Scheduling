import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";

import { AnimatePresence, motion } from "framer-motion";

import AppShell         from "./components/AppShell";
import ErrorBoundary    from "./components/ErrorBoundary";
import ReminderNotifier from "./components/ReminderNotifier";

import DashboardPage    from "./pages/DashboardPage";
import InboxPage        from "./pages/InboxPage";
import ConfirmPage      from "./pages/ConfirmPage";
import UploadPage       from "./pages/UploadPage";
import CalendarPage     from "./pages/CalendarPage";
import GraphPage        from "./pages/GraphPage";
import TasksPage        from "./pages/TasksPage";
import SearchPage       from "./pages/SearchPage";
import AskPage          from "./pages/AskPage";
import VoicePage        from "./pages/VoicePage";
import NotesPage        from "./pages/NotesPage";
import TimelinePage     from "./pages/TimelinePage";
import TrashPage        from "./pages/TrashPage";
import AuditLogPage     from "./pages/AuditLogPage";
import SystemStatusPage from "./pages/SystemStatusPage";
import SettingsPage     from "./pages/SettingsPage";
import LettersPage      from "./pages/LettersPage";
import CommandPalette   from "./components/CommandPalette";
import LoadingScreen    from "./components/LoadingScreen";

import { useEffect, useState } from "react";
import { initAuth } from "./auth/auth";

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.15 }}
      >
        <Routes location={location}>
          <Route path="/"          element={<ErrorBoundary><DashboardPage /></ErrorBoundary>} />
          <Route path="/dashboard" element={<ErrorBoundary><DashboardPage /></ErrorBoundary>} />
          <Route path="/inbox"     element={<ErrorBoundary><InboxPage /></ErrorBoundary>} />
          <Route path="/confirm/:jobId" element={<ErrorBoundary><ConfirmPage /></ErrorBoundary>} />
          <Route path="/upload"    element={<ErrorBoundary><UploadPage /></ErrorBoundary>} />
          <Route path="/calendar"  element={<ErrorBoundary><CalendarPage /></ErrorBoundary>} />
          <Route path="/graph"     element={<ErrorBoundary><GraphPage /></ErrorBoundary>} />
          <Route path="/tasks"     element={<ErrorBoundary><TasksPage /></ErrorBoundary>} />
          <Route path="/search"    element={<ErrorBoundary><SearchPage /></ErrorBoundary>} />
          <Route path="/ask"       element={<ErrorBoundary><AskPage /></ErrorBoundary>} />
          <Route path="/voice"     element={<ErrorBoundary><VoicePage /></ErrorBoundary>} />
          <Route path="/notes"     element={<ErrorBoundary><NotesPage /></ErrorBoundary>} />
          <Route path="/timeline"  element={<ErrorBoundary><TimelinePage /></ErrorBoundary>} />
          <Route path="/trash"     element={<ErrorBoundary><TrashPage /></ErrorBoundary>} />
          <Route path="/audit"     element={<ErrorBoundary><AuditLogPage /></ErrorBoundary>} />
          <Route path="/status"    element={<ErrorBoundary><SystemStatusPage /></ErrorBoundary>} />
          <Route path="/settings"  element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
          <Route path="/letters"   element={<ErrorBoundary><LettersPage /></ErrorBoundary>} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Resolve auth (Keycloak login when enabled) before rendering the app.
    // initAuth never throws — on any failure it falls back to no-auth.
    initAuth()
      .then((res) => setUser(res.user))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingScreen />;

  return (
    <BrowserRouter>
      <ReminderNotifier />
      <CommandPalette />
      <AppShell user={user}>
        <AnimatedRoutes />
      </AppShell>
    </BrowserRouter>
  );
}

export default App;
