import { Routes, Route, Navigate } from "react-router-dom";
import { getToken } from "./api.js";
import Landing from "./pages/public/Landing.jsx";
import Login from "./pages/admin/Login.jsx";
import Layout from "./pages/admin/Layout.jsx";
import Overview from "./pages/admin/Overview.jsx";
import Registrations from "./pages/admin/Registrations.jsx";
import FormBuilder from "./pages/admin/FormBuilder.jsx";
import Links from "./pages/admin/Links.jsx";
import Groups from "./pages/admin/Groups.jsx";
import Inbox from "./pages/admin/Inbox.jsx";
import Announcements from "./pages/admin/Announcements.jsx";
import Automations from "./pages/admin/Automations.jsx";
import Settings from "./pages/admin/Settings.jsx";
import Attendance from "./pages/admin/Attendance.jsx";
import Admins from "./pages/admin/Admins.jsx";
import Join from "./pages/public/Join.jsx";
import Ai from "./pages/admin/Ai.jsx";
import { DialogHost } from "./components/Dialog.jsx";

function Protected({ children }) {
  return getToken() ? children : <Navigate to="/admin/login" replace />;
}

export default function App() {
  return (
    <>
    <DialogHost />
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/r/:code" element={<Landing />} />
      <Route path="/j/:token" element={<Join />} />
      <Route path="/admin/login" element={<Login />} />
      <Route
        path="/admin"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Overview />} />
        <Route path="registrations" element={<Registrations />} />
        <Route path="form" element={<FormBuilder />} />
        <Route path="links" element={<Links />} />
        <Route path="groups" element={<Groups />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="announcements" element={<Announcements />} />
        <Route path="automations" element={<Automations />} />
        <Route path="settings" element={<Settings />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="team" element={<Admins />} />
        <Route path="ai" element={<Ai />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
