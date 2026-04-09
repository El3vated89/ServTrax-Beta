import { useState } from 'react';
import { LogIn, ShieldCheck } from 'lucide-react';
import { signInWithRedirect } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

export default function Login() {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleLogin = async () => {
    setErrorMessage('');
    setIsSigningIn(true);
    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (error) {
      console.error('Login failed:', error);
      setErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : 'Sign-in failed. Please try again.'
      );
      setIsSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="flex justify-center">
          <div className="bg-blue-600 p-3 rounded-xl shadow-lg">
            <ShieldCheck className="w-10 h-10 text-white" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          ServTrax
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600 font-medium">
          Track. Verify. Get Paid.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-gray-100">
          <div className="space-y-6">
            {errorMessage && (
              <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3">
                <p className="text-sm font-bold text-red-700">{errorMessage}</p>
              </div>
            )}

            <div>
              <button
                onClick={handleLogin}
                disabled={isSigningIn}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <LogIn className="w-5 h-5 mr-2" />
                {isSigningIn ? 'Redirecting to Google...' : 'Sign in with Google'}
              </button>
            </div>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">
                  Secure access for field operations
                </span>
              </div>
            </div>

            <p className="text-center text-xs font-medium text-gray-500">
              Sign-in opens a standard Google page and returns you to ServTrax automatically.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
