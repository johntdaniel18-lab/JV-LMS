import React, { useState } from 'react';
import { UserRole } from '../types';
import { BookOpen, GraduationCap, ShieldCheck, Loader2, AlertCircle, UserPlus, LogIn } from 'lucide-react';

interface LoginProps {
  onLogin: (role: UserRole, identifier: string, codeOrPassword?: string, isRegistering?: boolean) => Promise<void>;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [activeTab, setActiveTab] = useState<'teacher' | 'student'>('student');
  // Default to Test User credentials
  const [identifier, setIdentifier] = useState('Trung'); 
  const [secret, setSecret] = useState('1234');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const switchTab = (tab: 'teacher' | 'student') => {
    setActiveTab(tab);
    setError(null);
    if (tab === 'student') {
      setIdentifier('Trung');
      setSecret('1234');
    } else {
      setIdentifier('');
      setSecret('');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier) return;
    
    setIsLoading(true);
    setError(null);
    try {
      if (activeTab === 'teacher') {
        // Ensure isRegistering is false for teachers
        await onLogin(UserRole.TEACHER, identifier, secret, false);
      } else {
        await onLogin(UserRole.STUDENT, identifier, secret);
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/invalid-credential') {
        setError("Invalid email or password. Please contact the administrator.");
      } else if (err.code === 'auth/user-not-found') {
        setError("Account not found. Please contact the administrator.");
      } else if (err.code === 'auth/wrong-password') {
        setError("Invalid password.");
      } else if (err.code === 'auth/weak-password') {
        setError("Password should be at least 6 characters.");
      } else {
        setError(err.message || "Login failed. Please check your credentials.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 to-purple-100 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="p-8 pb-0 text-center">
          <div className="w-16 h-16 bg-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-4 text-white">
            <BookOpen size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">IELTS Master LMS</h1>
          <p className="text-gray-500 mt-2">Welcome to your learning portal</p>
        </div>

        <div className="flex mt-8 border-b">
          <button
            className={`flex-1 py-4 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'student' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => switchTab('student')}
          >
            <GraduationCap size={18} /> Student
          </button>
          <button
            className={`flex-1 py-4 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'teacher' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => switchTab('teacher')}
          >
            <ShieldCheck size={18} /> Teacher
          </button>
        </div>

        <div className="p-8">
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {activeTab === 'teacher' ? 'Email Address' : 'Full Name'}
              </label>
              <input
                type={activeTab === 'teacher' ? 'email' : 'text'}
                required
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white text-slate-900"
                placeholder={activeTab === 'teacher' ? 'teacher@example.com' : 'Enter your name'}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
            </div>
            
            {activeTab === 'student' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Access Code</label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white text-slate-900"
                  placeholder="e.g. IELTS-2024"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white text-slate-900"
                  placeholder="••••••••"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 mt-2 flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {activeTab === 'student' 
                ? 'Enter Classroom' 
                : 'Access Dashboard'}
            </button>
          </form>

          <p className="text-xs text-center text-gray-400 mt-6">
            Powered by Gemini AI & Firebase
          </p>
        </div>
      </div>
    </div>
  );
};