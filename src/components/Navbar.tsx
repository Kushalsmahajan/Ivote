import { useAuth } from '../contexts/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Vote, Shield } from 'lucide-react';

export default function Navbar() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (!user) return null;

  return (
    <nav className="h-16 bg-white border-b border-gray-200 flex-shrink-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-10 h-full flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2.5 font-extrabold text-2xl tracking-tight text-blue-600">
            <Vote className="h-6 w-6 stroke-[2.5px]" />
            iVote
          </Link>
          <div className="hidden sm:flex space-x-6">
            <Link to="/" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              Dashboard
            </Link>
            {isAdmin && (
              <Link to="/admin" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors flex items-center gap-1.5">
                <Shield className="w-4 h-4" /> Admin
              </Link>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="font-semibold text-sm text-gray-900">{user.displayName || 'Student'}</div>
              <div className="text-xs text-gray-500">{user.email}</div>
            </div>
            <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center font-semibold text-sm">
              {user.displayName?.charAt(0) || user.email?.charAt(0)?.toUpperCase() || 'U'}
            </div>
          </div>
          <div className="w-px h-6 bg-gray-200 mx-1 hidden sm:block"></div>
          <button
            onClick={handleLogout}
            className="text-gray-500 hover:text-gray-900 p-1.5 rounded-md hover:bg-gray-50 transition-colors"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </nav>
  );
}
