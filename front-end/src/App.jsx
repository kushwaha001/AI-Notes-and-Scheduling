import { BrowserRouter, Routes, Route } from "react-router-dom";

import AppShell from "./components/AppShell";

import DashboardPage from "./Pages/DashboardPage";
import UploadPage from "./Pages/UploadPage";
import CalendarPage from "./Pages/CalendarPage";
import TasksPage from "./Pages/TasksPage";
import SearchPage from "./Pages/SearchPage";

function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/search" element={<SearchPage />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}

export default App;