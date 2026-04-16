import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Vote, Shield, GraduationCap } from 'lucide-react';
import { useState } from 'react';

export default function Login() {
  const { user, isAdmin, signInWithGoogle, isSigningIn } = useAuth();
  const [loginType, setLoginType] = useState<'student' | 'admin'>('student');

  if (user) {
    if (loginType === 'admin' && isAdmin) {
      return <Navigate to="/admin" />;
    }
    return <Navigate to="/" />;
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-10 shadow-sm">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-blue-50 mb-6">
            {loginType === 'admin' ? <Shield className="h-8 w-8 text-blue-600" /> : <Vote className="h-8 w-8 text-blue-600" />}
          </div>
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight">
            {loginType === 'admin' ? 'Admin Access' : 'Welcome to iVote'}
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            {loginType === 'admin' ? 'Secure College Voting System Administration' : 'Secure College Voting System'}
          </p>
        </div>

        <div className="mt-8 flex bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setLoginType('student')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-md transition-all ${loginType === 'student' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <GraduationCap className="w-4 h-4" /> Student
          </button>
          <button
            onClick={() => setLoginType('admin')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-md transition-all ${loginType === 'admin' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Shield className="w-4 h-4" /> Admin
          </button>
        </div>
        
        <div className="mt-8 space-y-4">
          <button
            onClick={signInWithGoogle}
            disabled={isSigningIn}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-200 rounded-xl bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSigningIn ? (
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
            )}
            {isSigningIn ? 'Signing in...' : `Sign in as ${loginType === 'admin' ? 'Admin' : 'Student'}`}
          </button>
        </div>
        
        <div className="mt-6 text-center text-xs text-gray-500">
          {loginType === 'admin' 
            ? 'Only authorized administrators can access this portal.'
            : 'By signing in, you agree to the college election guidelines and terms of service.'}
        </div>
      </div>
    </div>
  );
}
