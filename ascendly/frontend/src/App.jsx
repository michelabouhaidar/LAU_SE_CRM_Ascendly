import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Home from './pages/Home'
import Login from './pages/Login'
import ChangePassword from './pages/ChangePassword'
import Dashboard from './pages/Dashboard'
import Contacts from './pages/Contacts'
import Deals from './pages/Deals'
import DealDetail from './pages/DealDetail'
import ContactDetail from './pages/ContactDetail'
import Tasks from './pages/Tasks'
import Approvals from './pages/Approvals'
import Reports from './pages/Reports'
import Admin from './pages/Admin'

function PrivateRoute({ children }) {
  const { token, mustChangePassword } = useAuth()
  if (!token) return <Navigate to="/" replace />
  if (mustChangePassword) return <Navigate to="/change-password" replace />
  return children
}

function AdminRoute({ children }) {
  const { token, user } = useAuth()
  if (!token) return <Navigate to="/" replace />
  if (user?.role !== 'Admin') return <Navigate to="/dashboard" replace />
  return children
}

function ChangePasswordRoute() {
  const { token } = useAuth()
  if (!token) return <Navigate to="/" replace />
  return <ChangePassword />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/"               element={<Home />} />
          <Route path="/login"          element={<Login />} />
          <Route path="/change-password" element={<ChangePasswordRoute />} />

          {}
          <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route path="dashboard"    element={<Dashboard />} />
            <Route path="contacts"     element={<Contacts />} />
            <Route path="contacts/:id" element={<ContactDetail />} />
            <Route path="deals"        element={<Deals />} />
            <Route path="deals/:id"    element={<DealDetail />} />
            <Route path="tasks"        element={<Tasks />} />
            <Route path="approvals"    element={<Approvals />} />
            <Route path="reports"      element={<Reports />} />
            <Route
              path="admin"
              element={
                <AdminRoute>
                  <Admin />
                </AdminRoute>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
