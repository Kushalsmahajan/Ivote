import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import VotingPage from './pages/VotingPage';
import AdminDashboard from './pages/AdminDashboard';
import ResultsPage from './pages/ResultsPage';
import ChatBot from './components/ChatBot';

function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode, requireAdmin?: boolean }) {
  const { user, isAdmin, loading } = useAuth();

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  
  if (!user) return <Navigate to="/login" />;
  
  if (requireAdmin && !isAdmin) return <Navigate to="/" />;

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-[#f3f4f6] text-[#111827] font-sans flex flex-col">
          <Navbar />
          <main className="flex-grow w-full max-w-7xl mx-auto px-4 sm:px-10 py-10">
            <Routes>
              <Route path="/login" element={<Login />} />
              
              <Route path="/" element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } />
              
              <Route path="/vote/:electionId" element={
                <ProtectedRoute>
                  <VotingPage />
                </ProtectedRoute>
              } />
              
              <Route path="/results/:electionId" element={
                <ProtectedRoute>
                  <ResultsPage />
                </ProtectedRoute>
              } />
              
              <Route path="/admin/*" element={
                <ProtectedRoute requireAdmin={true}>
                  <AdminDashboard />
                </ProtectedRoute>
              } />
            </Routes>
          </main>
          <ChatBot />
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
