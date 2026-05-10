import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Vote, Shield, GraduationCap, Mail, Lock, User as UserIcon, ArrowRight } from 'lucide-react';
import { useState } from 'react';

export default function Login() {
  const { user, isAdmin, signInWithGoogle, signInWithEmail, signUpWithEmail, isSigningIn } = useAuth();
  const [loginType, setLoginType] = useState<'student' | 'admin'>('student');
  const [authMethod, setAuthMethod] = useState<'google' | 'email'>('google');
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  if (user) {
    if (loginType === 'admin' && isAdmin) {
      return <Navigate to="/admin" />;
    }
    return <Navigate to="/" />;
  }

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (isSignUp) {
        await signUpWithEmail(email, password, name);
      } else {
        await signInWithEmail(email, password);
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      if (err.code === 'auth/invalid-credential') {
        setError('Invalid email or password. Please check your credentials or create a new account.');
      } else if (err.code === 'auth/user-not-found') {
        setError('No account found with this email. Please sign up first.');
      } else if (err.code === 'auth/wrong-password') {
        setError('Incorrect password. Please try again.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('This email is already registered. Try signing in instead.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password should be at least 6 characters.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('Email/Password sign-in is not enabled in the Firebase Console. Please enable it in Authentication > Sign-in method.');
      } else {
        setError(err.message || 'Authentication failed. Please try again.');
      }
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-8 sm:p-10 shadow-sm transition-all">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-blue-50 mb-6">
            {loginType === 'admin' ? <Shield className="h-8 w-8 text-blue-600" /> : <Vote className="h-8 w-8 text-blue-600" />}
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            {loginType === 'admin' ? 'Admin Access' : (isSignUp ? 'Create Account' : 'Welcome back')}
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            {loginType === 'admin' ? 'Secure College Voting System Administration' : 'Secure College Voting System'}
          </p>
        </div>

        <div className="mt-8 flex bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => {
              setLoginType('student');
              setIsSignUp(false);
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-md transition-all ${loginType === 'student' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <GraduationCap className="w-4 h-4" /> Student
          </button>
          <button
            onClick={() => {
              setLoginType('admin');
              setAuthMethod('email'); // Admins usually prefer/need email for first setup if not using specific gmail
              setIsSignUp(false);
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-md transition-all ${loginType === 'admin' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Shield className="w-4 h-4" /> Admin
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm font-medium border border-red-100">
            {error}
          </div>
        )}
        
        <div className="mt-8">
          {authMethod === 'google' ? (
            <div className="space-y-4">
              <button
                onClick={signInWithGoogle}
                disabled={isSigningIn}
                className="w-full h-[54px] flex items-center justify-center gap-3 px-4 border border-gray-200 rounded-xl bg-white text-base font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                {isSigningIn ? (
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <span>Signing in...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
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
                    <span>Continue with Google</span>
                  </div>
                )}
              </button>
              
              <button
                onClick={() => setAuthMethod('email')}
                className="w-full text-sm text-gray-500 hover:text-blue-600 transition-colors font-medium underline underline-offset-4"
              >
                Or use email and password
              </button>
            </div>
          ) : (
            <form onSubmit={handleEmailAuth} className="space-y-4">
              {isSignUp && (
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    required
                    placeholder="Full Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                  />
                </div>
              )}
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  required
                  placeholder="Email Address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  required
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={isSigningIn}
                className="w-full h-[54px] flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                {isSigningIn ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    {isSignUp ? 'Create Account' : 'Sign In'}
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>

              <div className="flex flex-col gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-sm text-gray-500 hover:text-blue-600 font-medium"
                >
                  {isSignUp ? 'Already have an account? Sign in' : 'Don\'t have an account? Sign up'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMethod('google');
                    setIsSignUp(false);
                  }}
                  className="text-sm text-blue-600 hover:text-blue-700 font-bold underline underline-offset-4"
                >
                  Return to Google Sign In
                </button>
              </div>
            </form>
          )}
        </div>
        
        <div className="mt-8 text-center text-xs text-gray-500">
          {loginType === 'admin' 
            ? 'Only authorized administrators can access this portal.'
            : 'By signing in, you agree to the college election guidelines and terms of service.'}
        </div>
      </div>
    </div>
  );
}
