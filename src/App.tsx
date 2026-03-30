import React, { useState, useEffect, useRef } from 'react';
import { 
  User, 
  BookOpen, 
  Activity, 
  AlertTriangle, 
  Plus, 
  LogOut, 
  Camera, 
  Mic, 
  Eye, 
  Clock, 
  CheckCircle, 
  XCircle,
  ChevronRight,
  Monitor,
  Video,
  Settings,
  FileText,
  Code as CodeIcon,
  Send,
  Terminal,
  PlayCircle,
  ChevronLeft,
  Search,
  Trash2,
  Edit2,
  Play,
  Users,
  Sun,
  Moon,
  BarChart2
} from 'lucide-react';
import Editor from 'react-simple-code-editor';
import hljs from 'highlight.js';
import 'highlight.js/styles/atom-one-dark.css';
import { motion, AnimatePresence, HTMLMotionProps } from 'motion/react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  serverTimestamp,
  getDocs,
  orderBy,
  arrayUnion
} from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';
import { io, Socket } from 'socket.io-client';
import { auth, db } from './firebase';
import { cn } from './lib/utils';
import { UserProfile, Exam, Question, Submission, Warning, QuestionType, UserRole } from './types';
import { verifyIdentity, monitorFrame, generateQuestions } from './services/gemini';

// --- Error Handling ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.error?.message || "");
        if (parsed.error && parsed.operationType) {
          errorMessage = `Firestore ${parsed.operationType} error: ${parsed.error}`;
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-8 text-center space-y-6">
            <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8 text-rose-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Application Error</h2>
            <p className="text-slate-500 dark:text-slate-400">{errorMessage}</p>
            <Button onClick={() => window.location.reload()} className="w-full">
              Reload Application
            </Button>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Components ---

const Button = ({ className, variant = 'primary', ...props }: HTMLMotionProps<"button"> & { variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' }) => {
  const variants = {
    primary: 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-500 hover:to-violet-500 shadow-lg shadow-indigo-500/25 dark:shadow-indigo-900/40',
    secondary: 'bg-slate-800 text-white hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 shadow-lg shadow-slate-900/20',
    outline: 'border-2 border-slate-200 bg-transparent hover:bg-slate-50 text-slate-700 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800',
    ghost: 'bg-transparent hover:bg-slate-100 text-slate-600 dark:text-slate-400 dark:hover:bg-slate-800',
    danger: 'bg-gradient-to-r from-rose-600 to-red-600 text-white hover:from-rose-500 hover:to-red-500 shadow-lg shadow-rose-500/25 dark:shadow-rose-900/40',
  };
  return (
    <motion.button 
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={cn('px-4 py-2 rounded-xl font-medium transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2', variants[variant], className)} 
      {...props} 
    />
  );
};

const Card = ({ className, children }: { className?: string, children: React.ReactNode }) => (
  <motion.div 
    whileHover={{ y: -4, boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)" }}
    className={cn('bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl shadow-sm overflow-hidden transition-all duration-300', className)}
  >
    {children}
  </motion.div>
);

const Badge = ({ children, variant = 'info' }: { children: React.ReactNode, variant?: 'info' | 'success' | 'warning' | 'error' }) => {
  const variants = {
    info: 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
    warning: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
    error: 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800',
  };
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold border', variants[variant])}>
      {children}
    </span>
  );
};

// --- Main App ---

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode');
      return saved ? JSON.parse(saved) : false;
    }
    return false;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

  const [user, loading] = useAuthState(auth);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    if (user) {
      const docRef = doc(db, 'users', user.uid);
      unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          setProfile(docSnap.data() as UserProfile);
          setIsAuthReady(true);
        } else {
          // If no profile exists yet, we wait for LoginView to create it
          // or we can handle a default here if needed, but LoginView is better
          setProfile(null);
          setIsAuthReady(true);
        }
      });
    } else {
      setProfile(null);
      setIsAuthReady(true);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user]);

  const [notification, setNotification] = useState<{ message: string, type: 'info' | 'error' | 'success' } | null>(null);

  const notify = (message: string, type: 'info' | 'error' | 'success' = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);
    return () => { newSocket.close(); };
  }, []);

  const handleLogin = async (role: UserRole) => {
    setIsAuthReady(false);
    setLoginError(null);
    setProfile(null); // Clear profile to force loading state
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      const docRef = doc(db, 'users', user.uid);
      let docSnap;
      try {
        docSnap = await getDoc(docRef);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
      }
      
      const profileData: UserProfile = {
        uid: user.uid,
        email: user.email!,
        displayName: user.displayName || 'User',
        role: role,
        createdAt: docSnap?.exists() ? (docSnap.data() as UserProfile).createdAt : new Date().toISOString(),
      };
      
      try {
        await setDoc(docRef, profileData);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
      }
      // The onSnapshot listener in useEffect will pick up this change
      // and set isAuthReady(true) once the data is received.
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') {
        setLoginError("Login cancelled. Please complete the sign-in process in the popup window.");
      } else if (error.code === 'auth/cancelled-popup-request') {
        setLoginError("A login request is already in progress. Please check your open windows.");
      } else if (error.code === 'auth/popup-blocked') {
        setLoginError("Login popup was blocked by your browser. Please allow popups for this site.");
      } else {
        console.error("Login failed:", error);
        setLoginError(error.message || "An unexpected error occurred during login.");
      }
      setIsAuthReady(true);
    }
  };

  // Loading state
  if (loading || (user && !isAuthReady)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 dark:text-slate-400 font-medium">Verifying Credentials...</p>
        </div>
      </div>
    );
  }

  // Not logged in or profile missing (new user)
  if (!user || !profile) {
    return (
      <div className="relative">
        {loginError && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] w-full max-w-md px-4">
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-rose-50 border border-rose-200 p-4 rounded-xl shadow-xl flex items-start gap-3"
            >
              <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-rose-800 font-bold">Login Issue</p>
                <p className="text-xs text-rose-600 font-medium">{loginError}</p>
              </div>
              <button onClick={() => setLoginError(null)} className="text-rose-400 hover:text-rose-600">
                <XCircle className="w-5 h-5" />
              </button>
            </motion.div>
          </div>
        )}
        <LoginView 
          onLogin={handleLogin} 
          isDarkMode={isDarkMode} 
          toggleDarkMode={toggleDarkMode} 
        />
      </div>
    );
  }

  const handleLogout = async () => {
    setIsAuthReady(false);
    setProfile(null);
    await signOut(auth);
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-500 relative overflow-hidden">
        {/* Subtle grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
        
        {/* Animated background blobs */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-400/10 dark:bg-indigo-600/5 blur-[100px] mix-blend-multiply dark:mix-blend-screen animate-blob" />
          <div className="absolute top-[20%] right-[-10%] w-[40%] h-[40%] rounded-full bg-violet-400/10 dark:bg-violet-600/5 blur-[100px] mix-blend-multiply dark:mix-blend-screen animate-blob animation-delay-2000" />
        </div>

        <div className="relative z-10 flex flex-col min-h-screen">
          <Navbar 
            profile={profile} 
            onLogout={handleLogout} 
            isDarkMode={isDarkMode} 
            toggleDarkMode={toggleDarkMode} 
          />
          <main className="max-w-7xl mx-auto px-4 py-8 flex-1 w-full">
            <AnimatePresence mode="wait">
              {profile.role === 'admin' ? (
                <motion.div 
                  key="admin-dash"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <AdminDashboard profile={profile} socket={socket} notify={notify} />
                </motion.div>
              ) : (
                <motion.div 
                  key="student-dash"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <StudentDashboard profile={profile} socket={socket} notify={notify} />
                </motion.div>
              )}
            </AnimatePresence>
          </main>
          {/* Footer Status */}
          <footer className="h-10 bg-slate-900/80 backdrop-blur-md dark:bg-black/80 text-white px-6 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] transition-colors duration-500 border-t border-slate-800">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> Connection Stable</span>
              <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> AI Proctoring Online</span>
            </div>
            <div>AlphaProctor Security Engine v1.0.4</div>
          </footer>
        </div>
      </div>

      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 right-8 z-[9999]"
          >
            <div className={cn(
              "px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 border",
              notification.type === 'success' ? "bg-emerald-600 border-emerald-500 text-white" :
              notification.type === 'error' ? "bg-rose-600 border-rose-500 text-white" :
              "bg-indigo-600 border-indigo-500 text-white dark:bg-indigo-900/90 dark:border-indigo-800"
            )}>
              {notification.type === 'success' ? <CheckCircle className="w-5 h-5" /> : 
               notification.type === 'error' ? <AlertTriangle className="w-5 h-5" /> : 
               <Activity className="w-5 h-5" />}
              <span className="font-medium">{notification.message}</span>
              <button onClick={() => setNotification(null)} className="ml-2 hover:opacity-70">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </ErrorBoundary>
  );
}

// --- Views ---

function LoginView({ onLogin, isDarkMode, toggleDarkMode }: { onLogin: (role: UserRole) => void, isDarkMode: boolean, toggleDarkMode: () => void }) {
  const [selectedRole, setSelectedRole] = useState<UserRole>('student');

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 transition-colors duration-500 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-400/20 dark:bg-indigo-600/10 blur-[100px] mix-blend-multiply dark:mix-blend-screen animate-blob" />
        <div className="absolute top-[20%] right-[-10%] w-[40%] h-[40%] rounded-full bg-violet-400/20 dark:bg-violet-600/10 blur-[100px] mix-blend-multiply dark:mix-blend-screen animate-blob animation-delay-2000" />
        <div className="absolute bottom-[-20%] left-[20%] w-[40%] h-[40%] rounded-full bg-fuchsia-400/20 dark:bg-fuchsia-600/10 blur-[100px] mix-blend-multiply dark:mix-blend-screen animate-blob animation-delay-4000" />
      </div>

      <div className="fixed top-8 right-8 z-50">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={toggleDarkMode}
          className="p-3 rounded-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-xl border border-slate-200/50 dark:border-slate-800/50 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={isDarkMode ? 'dark' : 'light'}
              initial={{ y: 10, opacity: 0, rotate: -90 }}
              animate={{ y: 0, opacity: 1, rotate: 0 }}
              exit={{ y: -10, opacity: 0, rotate: 90 }}
              transition={{ duration: 0.2 }}
            >
              {isDarkMode ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
            </motion.div>
          </AnimatePresence>
        </motion.button>
      </div>

      <div className="max-w-md w-full relative z-10">
        <div className="text-center mb-12">
          <motion.div 
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-flex items-center justify-center w-20 h-20 bg-indigo-600 rounded-2xl shadow-xl shadow-indigo-200 dark:shadow-indigo-900/20 mb-6"
          >
            <img src="/logo.png" alt="Logo" className="w-[101px] h-[129px] -ml-[9px] pt-[9px] -mr-[8px] mt-0" />
          </motion.div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white tracking-tight mb-2">AlphaProctor</h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium">AI-Powered Examination Integrity</p>
        </div>

        <Card className="p-8">
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">Choose Your Portal</h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm">Select your role to continue</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => setSelectedRole('student')}
                className={cn(
                  "p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-3",
                  selectedRole === 'student' ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20" : "border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 bg-white dark:bg-slate-900"
                )}
              >
                <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", selectedRole === 'student' ? "bg-indigo-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-400")}>
                  <User className="w-5 h-5" />
                </div>
                <span className={cn("font-bold text-sm", selectedRole === 'student' ? "text-indigo-900 dark:text-indigo-300" : "text-slate-500 dark:text-slate-400")}>Student</span>
              </button>

              <button 
                onClick={() => setSelectedRole('admin')}
                className={cn(
                  "p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-3",
                  selectedRole === 'admin' ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20" : "border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 bg-white dark:bg-slate-900"
                )}
              >
                <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", selectedRole === 'admin' ? "bg-indigo-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-400")}>
                  <img src="/logo.png" alt="Logo" className="w-10 h-10" />
                </div>
                <span className={cn("font-bold text-sm", selectedRole === 'admin' ? "text-indigo-900 dark:text-indigo-300" : "text-slate-500 dark:text-slate-400")}>Admin</span>
              </button>
            </div>
            
            <Button onClick={() => onLogin(selectedRole)} className="w-full py-4 h-14 text-lg" variant="primary">
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6 mr-2" />
              Login as {selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1)}
            </Button>

            <div className="text-center">
              <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-bold tracking-widest">Secure Authentication Powered by Firebase</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Navbar({ profile, onLogout, isDarkMode, toggleDarkMode }: { 
  profile: UserProfile | null, 
  onLogout: () => void,
  isDarkMode: boolean,
  toggleDarkMode: () => void
}) {
  return (
    <nav className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-800/50 sticky top-0 z-50 transition-colors duration-500">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
                    <motion.div 
            whileHover={{ rotate: 180 }}
            transition={{ duration: 0.3 }}
            className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20"
          >
            <img src="/logo.png" alt="Logo" className="w-8 h-8" />
          </motion.div>
          <Badge variant={profile?.role === 'admin' ? 'success' : 'info'}>
            {profile?.role === 'admin' ? 'Admin' : 'Student'}
          </Badge>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={toggleDarkMode}
            className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={isDarkMode ? 'dark' : 'light'}
                initial={{ y: 10, opacity: 0, rotate: -90 }}
                animate={{ y: 0, opacity: 1, rotate: 0 }}
                exit={{ y: -10, opacity: 0, rotate: 90 }}
                transition={{ duration: 0.2 }}
              >
                {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </motion.div>
            </AnimatePresence>
          </motion.button>

          <div className="hidden md:flex flex-col items-end">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{profile?.displayName}</span>
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{profile?.email}</span>
          </div>
          <Button variant="ghost" className="p-2" onClick={onLogout}>
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </nav>
  );
}

// --- Admin Dashboard ---

function AdminDashboard({ profile, socket, notify }: { profile: UserProfile, socket: Socket | null, notify: (m: string, t?: 'info' | 'error' | 'success') => void }) {
  const [exams, setExams] = useState<Exam[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [activeTab, setActiveTab] = useState<'exams' | 'live' | 'results' | 'analytics' | 'evidence'>('exams');

  if (profile.role !== 'admin') return null;

  useEffect(() => {
    if (profile.role !== 'admin') return;
    const q = query(collection(db, 'exams'), where('creatorId', '==', profile.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setExams(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Exam)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'exams');
    });
    return unsubscribe;
  }, [profile.uid]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Dashboard</h1>
          <p className="text-slate-500 dark:text-slate-400">Manage your examinations and monitor students in real-time.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={async () => {
            const code = "DEMO12";
            try {
              await setDoc(doc(db, 'exams', 'demo-exam'), {
                title: "AlphaProctor Demo Exam",
                description: "A sample examination to test the proctoring features.",
                duration: 30,
                questions: [
                  { id: 'q1', type: 'objective', text: 'What is the primary goal of AlphaProctor?', options: ['Gaming', 'Integrity', 'Social Media', 'Shopping'], points: 10 },
                  { id: 'q2', type: 'subjective', text: 'Describe how AI can help in remote proctoring.', points: 20 },
                  { id: 'q3', type: 'coding', text: 'Write a JavaScript function to reverse a string.', points: 30 }
                ],
                creatorId: profile.uid,
                code: code,
                isActive: true,
                startTime: new Date().toISOString(),
              });
              notify("Demo Exam Created! Code: " + code, 'success');
            } catch (error) {
              handleFirestoreError(error, OperationType.WRITE, 'exams/demo-exam');
            }
          }}>
            <Settings className="w-4 h-4" /> Seed Demo
          </Button>
          <Button variant={activeTab === 'exams' ? 'primary' : 'outline'} onClick={() => setActiveTab('exams')}>
            <BookOpen className="w-4 h-4" /> Exams
          </Button>
          <Button variant={activeTab === 'live' ? 'primary' : 'outline'} onClick={() => setActiveTab('live')}>
            <Activity className="w-4 h-4" /> Live Monitoring
          </Button>
          <Button variant={activeTab === 'results' ? 'primary' : 'outline'} onClick={() => setActiveTab('results')}>
            <FileText className="w-4 h-4" /> Results
          </Button>
          <Button variant={activeTab === 'analytics' ? 'primary' : 'outline'} onClick={() => setActiveTab('analytics')}>
            <BarChart2 className="w-4 h-4" /> Analytics
          </Button>
          <Button variant={activeTab === 'evidence' ? 'primary' : 'outline'} onClick={() => setActiveTab('evidence')}>
            <Camera className="w-4 h-4" /> Evidence
          </Button>
        </div>
      </div>

      {activeTab === 'exams' ? (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">Your Examinations</h2>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4" /> Create Exam
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {exams.map(exam => (
              <ExamCard key={exam.id} exam={exam} onViewDetails={() => setSelectedExam(exam)} />
            ))}
            {exams.length === 0 && (
              <div className="col-span-full py-20 text-center bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
                <BookOpen className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">No exams created yet</h3>
                <p className="text-slate-500 dark:text-slate-400 mb-6">Start by creating your first examination.</p>
                <Button variant="outline" onClick={() => setShowCreate(true)}>
                  <Plus className="w-4 h-4" /> Create Exam
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'live' ? (
        <LiveMonitoring socket={socket} exams={exams} />
      ) : activeTab === 'results' ? (
        <ResultsView exams={exams} notify={notify} />
      ) : activeTab === 'analytics' ? (
        <AnalyticsDashboard exams={exams} />
      ) : (
        <EvidenceView exams={exams} />
      )}

      <AnimatePresence>
        {showCreate && (
          <CreateExamModal onClose={() => setShowCreate(false)} creatorId={profile.uid} notify={notify} />
        )}
        {selectedExam && (
          <ExamDetailsModal exam={selectedExam} onClose={() => setSelectedExam(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function ExamCard({ exam, onViewDetails }: { exam: Exam, onViewDetails: () => void }) {
  return (
    <Card className="hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors group">
      <div className="p-6 space-y-4">
        <div className="flex justify-between items-start">
          <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg group-hover:bg-indigo-600 transition-colors">
            <BookOpen className="w-6 h-6 text-indigo-600 dark:text-indigo-400 group-hover:text-white" />
          </div>
          <Badge variant={exam.isActive ? 'success' : 'warning'}>
            {exam.isActive ? 'Active' : 'Draft'}
          </Badge>
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">{exam.title}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">{exam.description}</p>
        </div>
        <div className="flex items-center gap-4 text-xs font-medium text-slate-400 dark:text-slate-500">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> {exam.duration}m
          </div>
          <div className="flex items-center gap-1">
            <FileText className="w-3 h-3" /> {exam.questions.length} Questions
          </div>
          <div className="flex items-center gap-1">
            <img src="/logo.png" alt="Logo" className="w-4 h-4" /> Code: <span className="text-indigo-600 dark:text-indigo-400 font-bold">{exam.code}</span>
          </div>
        </div>
      </div>
      <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
        <span className="text-xs text-slate-400 dark:text-slate-500">Created on {new Date(exam.startTime).toLocaleDateString()}</span>
        <Button variant="ghost" className="text-xs p-0 h-auto font-bold text-indigo-600 dark:text-indigo-400 hover:bg-transparent" onClick={onViewDetails}>
          View Details <ChevronRight className="w-3 h-3" />
        </Button>
      </div>
    </Card>
  );
}

function ExamDetailsModal({ exam, onClose }: { exam: Exam, onClose: () => void }) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'submissions'), where('examId', '==', exam.id), orderBy('startTime', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSubmissions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Submission)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'submissions');
    });
    return unsubscribe;
  }, [exam.id]);

  const handleDelete = async () => {
    try {
      await deleteDoc(doc(db, 'exams', exam.id));
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `exams/${exam.id}`);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800"
      >
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-indigo-600 rounded-lg">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">{exam.title}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Exam Code: <span className="font-bold text-indigo-600 dark:text-indigo-400">{exam.code}</span></p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="danger" className="text-xs px-3 py-1 h-auto" onClick={() => setShowDeleteConfirm(true)}>
              Delete Exam
            </Button>
            <Button variant="ghost" onClick={onClose} className="p-2 h-auto"><XCircle className="w-6 h-6" /></Button>
          </div>
        </div>

        <AnimatePresence>
          {showDeleteConfirm && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 z-[110] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-6"
            >
              <Card className="max-w-md w-full p-8 text-center space-y-6 shadow-2xl border-rose-100">
                <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">Delete Examination?</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">This action will permanently delete <span className="font-bold text-slate-700 dark:text-slate-300">{exam.title}</span> and all associated student submissions. This cannot be undone.</p>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                  <Button variant="danger" className="flex-1" onClick={handleDelete}>Yes, Delete Everything</Button>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3 space-y-8">
            {selectedSubmission ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <Button variant="outline" className="text-xs" onClick={() => setSelectedSubmission(null)}>
                    ← Back to Submissions
                  </Button>
                  <div className="text-right">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">{selectedSubmission.studentName}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Submission ID: {selectedSubmission.id}</p>
                  </div>
                </div>

                <div className="space-y-8">
                  {exam.questions.map((q, idx) => (
                    <Card key={q.id} className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Question {idx + 1} • {q.type}</span>
                        <span className="text-xs font-bold text-slate-400">{q.points} Points</span>
                      </div>
                      <p className="text-slate-800 dark:text-slate-200 font-medium mb-6">{q.text}</p>
                      
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Student Answer:</h4>
                        {q.type === 'coding' ? (
                          <pre className="p-4 bg-slate-900 text-indigo-300 rounded-lg font-mono text-xs overflow-x-auto">
                            {selectedSubmission.answers[q.id] || "// No answer provided"}
                          </pre>
                        ) : (
                          <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                            {selectedSubmission.answers[q.id] || "No answer provided"}
                          </p>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>

                {selectedSubmission.evidence && selectedSubmission.evidence.length > 0 && (
                  <div className="mt-8 space-y-4">
                    <h3 className="text-sm font-bold text-rose-500 uppercase tracking-widest flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" /> Proctoring Evidence ({selectedSubmission.evidence.length})
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedSubmission.evidence.map((ev, idx) => (
                        <Card key={idx} className="overflow-hidden border-rose-100">
                          <div className="p-2 bg-rose-50 border-b border-rose-100 flex justify-between items-center">
                            <span className="text-xs font-bold text-rose-700 truncate mr-2" title={ev.reason}>{ev.reason}</span>
                            <span className="text-[10px] text-rose-400 shrink-0">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <img src={`data:image/jpeg;base64,${ev.image}`} alt="Evidence" className="w-full h-auto object-cover" />
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <section className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Description</h3>
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{exam.description || "No description provided."}</p>
                </section>

                <section className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Questions ({exam.questions.length})</h3>
                    <div className="flex gap-4 text-xs font-medium text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {exam.duration}m</span>
                      <span className="flex items-center gap-1"><img src="/logo.png" alt="Logo" className="w-4 h-4" /> Secure</span>
                    </div>
                  </div>
                  <div className="space-y-4">
                    {exam.questions.map((q, idx) => (
                      <Card key={q.id} className="p-6 bg-slate-50/50 border-slate-100">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Question {idx + 1} • {q.type}</span>
                          <span className="text-xs font-bold text-slate-400">{q.points} Points</span>
                        </div>
                        <p className="text-slate-800 dark:text-slate-200 font-medium mb-4">{q.text}</p>
                        {q.type === 'objective' && q.options && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {q.options.map((opt, optIdx) => (
                              <div key={optIdx} className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-600 dark:text-slate-400">
                                {opt}
                              </div>
                            ))}
                          </div>
                        )}
                        {q.type === 'coding' && q.testCases && (
                          <div className="mt-4 space-y-2">
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase">Test Cases ({q.testCases.length})</h4>
                            <div className="flex gap-2 overflow-x-auto pb-2">
                              {q.testCases.map((tc, tcIdx) => (
                                <div key={tcIdx} className="px-2 py-1 bg-white border border-slate-200 rounded text-[10px] whitespace-nowrap">
                                  In: {tc.input} → Out: {tc.expectedOutput}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </Card>
                    ))}
                  </div>
                </section>
              </>
            )}
          </div>

          <div className="space-y-8">
            <section className="space-y-4">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Submissions ({submissions.length})</h3>
              <Card className="overflow-hidden border-slate-100">
                <div className="max-h-[500px] overflow-y-auto">
                  {loading ? (
                    <div className="p-8 text-center text-slate-400 italic text-sm">Loading submissions...</div>
                  ) : submissions.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 italic text-sm">No submissions yet.</div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {submissions.map(sub => (
                        <div 
                          key={sub.id} 
                          className={cn(
                            "p-4 hover:bg-slate-50 transition-colors cursor-pointer",
                            selectedSubmission?.id === sub.id && "bg-indigo-50"
                          )}
                          onClick={() => setSelectedSubmission(sub)}
                        >
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-bold text-slate-900 dark:text-white text-sm">{sub.studentName}</span>
                            <Badge variant={sub.status === 'submitted' ? 'success' : sub.status === 'terminated' ? 'error' : 'warning'}>
                              {sub.status}
                            </Badge>
                          </div>
                          <div className="flex justify-between items-center text-[10px] text-slate-400">
                            <span>{new Date(sub.id).toLocaleDateString()}</span>
                            {sub.score !== undefined && <span className="font-bold text-indigo-600">Score: {sub.score}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Exam Stats</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                  <div className="text-2xl font-bold text-indigo-600">{submissions.length}</div>
                  <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Total Attempts</div>
                </div>
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                  <div className="text-2xl font-bold text-emerald-600">
                    {submissions.filter(s => s.status === 'submitted').length}
                  </div>
                  <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Completed</div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function CreateExamModal({ onClose, creatorId, notify }: { onClose: () => void, creatorId: string, notify: (m: string, t?: 'info' | 'error' | 'success') => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(60);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const addQuestion = (type: QuestionType) => {
    const newQuestion: Question = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      text: '',
      points: 10,
    };
    if (type === 'objective') {
      newQuestion.options = ['', '', '', ''];
    }
    if (type === 'coding') {
      newQuestion.testCases = [{ input: '', expectedOutput: '' }];
    }
    setQuestions([...questions, newQuestion]);
  };

  const handleGenerateQuestions = async () => {
    if (!aiPrompt) return;
    setIsGenerating(true);
    try {
      const generated = await generateQuestions(aiPrompt);
      if (generated && generated.length > 0) {
        const newQuestions = generated.map(q => ({
          ...q,
          id: Math.random().toString(36).substr(2, 9)
        }));
        setQuestions(prev => [...prev, ...newQuestions]);
        notify(`Successfully generated ${generated.length} questions.`, 'success');
        setAiPrompt('');
      } else {
        notify('Failed to generate questions. Try a different prompt.', 'error');
      }
    } catch (error) {
      console.error(error);
      notify('Error generating questions.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!title || questions.length === 0) return;
    setLoading(true);
    try {
      const code = Math.random().toString(36).substr(2, 6).toUpperCase();
      await addDoc(collection(db, 'exams'), {
        title,
        description,
        duration,
        questions,
        creatorId,
        code,
        isActive: true,
        startTime: new Date().toISOString(),
      });
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'exams');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800"
      >
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Create New Examination</h2>
          <Button variant="ghost" onClick={onClose} className="p-2 h-auto"><XCircle className="w-6 h-6" /></Button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Exam Title</label>
              <input 
                type="text" 
                value={title} 
                onChange={e => setTitle(e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="e.g. Computer Science Midterm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Duration (minutes)</label>
              <input 
                type="number" 
                value={duration} 
                onChange={e => setDuration(parseInt(e.target.value))}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div className="col-span-full space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Description</label>
              <textarea 
                value={description} 
                onChange={e => setDescription(e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none h-24 resize-none"
                placeholder="Briefly describe the exam..."
              />
            </div>
          </div>

          <div className="p-6 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800/50 space-y-4">
            <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 font-bold">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              AI Question Generator
            </div>
            <div className="flex gap-4">
              <input 
                type="text" 
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                placeholder="e.g., Generate 5 multiple choice questions about React hooks..."
                className="flex-1 px-4 py-2 border border-indigo-200 dark:border-indigo-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-800"
                disabled={isGenerating}
              />
              <Button 
                variant="primary" 
                onClick={handleGenerateQuestions} 
                disabled={!aiPrompt || isGenerating}
                className="shrink-0"
              >
                {isGenerating ? 'Generating...' : 'Generate Questions'}
              </Button>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Questions ({questions.length})</h3>
              <div className="flex gap-2">
                <Button variant="outline" className="text-xs" onClick={() => addQuestion('objective')}>+ Objective</Button>
                <Button variant="outline" className="text-xs" onClick={() => addQuestion('subjective')}>+ Subjective</Button>
                <Button variant="outline" className="text-xs" onClick={() => addQuestion('coding')}>+ Coding</Button>
              </div>
            </div>

            <div className="space-y-4">
              {questions.map((q, idx) => (
                <Card key={q.id} className="p-6 bg-slate-50/50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-700">
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Question {idx + 1} • {q.type}</span>
                    <Button variant="ghost" className="p-1 h-auto text-rose-500" onClick={() => setQuestions(questions.filter(item => item.id !== q.id))}>
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </div>
                  <textarea 
                    value={q.text}
                    onChange={e => {
                      const newQs = [...questions];
                      newQs[idx].text = e.target.value;
                      setQuestions(newQs);
                    }}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg mb-4 h-20 resize-none outline-none"
                    placeholder="Enter question text..."
                  />
                  {q.type === 'objective' && q.options && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {q.options.map((opt, optIdx) => (
                        <input 
                          key={optIdx}
                          type="text"
                          value={opt}
                          onChange={e => {
                            const newQs = [...questions];
                            newQs[idx].options![optIdx] = e.target.value;
                            setQuestions(newQs);
                          }}
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm outline-none"
                          placeholder={`Option ${optIdx + 1}`}
                        />
                      ))}
                    </div>
                  )}

                  {q.type === 'coding' && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Test Cases</h4>
                        <Button variant="outline" className="text-[10px] py-1 h-auto" onClick={() => {
                          const newQs = [...questions];
                          newQs[idx].testCases = [...(newQs[idx].testCases || []), { input: '', expectedOutput: '' }];
                          setQuestions(newQs);
                        }}>+ Add Case</Button>
                      </div>
                      <div className="space-y-3">
                        {q.testCases?.map((tc, tcIdx) => (
                          <div key={tcIdx} className="grid grid-cols-2 gap-4 p-3 bg-white border border-slate-100 rounded-lg relative group/tc">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase">Input</label>
                              <input 
                                type="text" 
                                value={tc.input}
                                onChange={e => {
                                  const newQs = [...questions];
                                  newQs[idx].testCases![tcIdx].input = e.target.value;
                                  setQuestions(newQs);
                                }}
                                className="w-full px-2 py-1 border border-slate-100 rounded text-xs outline-none"
                                placeholder="e.g. 'hello'"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase">Expected Output</label>
                              <input 
                                type="text" 
                                value={tc.expectedOutput}
                                onChange={e => {
                                  const newQs = [...questions];
                                  newQs[idx].testCases![tcIdx].expectedOutput = e.target.value;
                                  setQuestions(newQs);
                                }}
                                className="w-full px-2 py-1 border border-slate-100 rounded text-xs outline-none"
                                placeholder="e.g. 'olleh'"
                              />
                            </div>
                            <button 
                              className="absolute -top-2 -right-2 p-1 bg-rose-500 text-white rounded-full opacity-0 group-hover/tc:opacity-100 transition-opacity"
                              onClick={() => {
                                const newQs = [...questions];
                                newQs[idx].testCases = newQs[idx].testCases?.filter((_, i) => i !== tcIdx);
                                setQuestions(newQs);
                              }}
                            >
                              <XCircle className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading || !title || questions.length === 0}>
            {loading ? 'Creating...' : 'Create Examination'}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function LiveMonitoring({ socket, exams }: { socket: Socket | null, exams: Exam[] }) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [activeAlert, setActiveAlert] = useState<any | null>(null);
  const [listeningTo, setListeningTo] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextTimeRef = useRef<number>(0);

  useEffect(() => {
    if (exams.length === 0) return;
    const examIds = exams.map(e => e.id).slice(0, 10);
    const q = query(collection(db, 'submissions'), where('examId', 'in', examIds), where('status', '==', 'active'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSubmissions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Submission)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'submissions');
    });
    return unsubscribe;
  }, [exams]);

  useEffect(() => {
    if (!socket) return;
    
    socket.on('admin-alert', (alert) => {
      setAlerts(prev => [alert, ...prev].slice(0, 50));
      setActiveAlert(alert);
      
      // Auto-dismiss the prominent alert after 8 seconds
      setTimeout(() => {
        setActiveAlert(current => current === alert ? null : current);
      }, 8000);
    });

    socket.on('admin-audio', async (data) => {
      if (listeningTo !== data.submissionId) return;
      
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        nextTimeRef.current = audioContextRef.current.currentTime;
      }

      try {
        const arrayBuffer = await new Blob([data.chunk]).arrayBuffer();
        const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
        
        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current.destination);
        
        if (nextTimeRef.current < audioContextRef.current.currentTime) {
          nextTimeRef.current = audioContextRef.current.currentTime;
        }
        source.start(nextTimeRef.current);
        nextTimeRef.current += audioBuffer.duration;
      } catch (e) {
        console.error("Error decoding audio chunk", e);
      }
    });

    return () => { 
      socket.off('admin-alert'); 
      socket.off('admin-audio');
    };
  }, [socket, listeningTo]);

  useEffect(() => {
    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);

  return (
    <div className="space-y-6">
      <AnimatePresence>
        {activeAlert && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="bg-rose-600 text-white p-6 rounded-xl shadow-2xl flex items-center justify-between gap-6 border-2 border-rose-400"
          >
            <div className="flex items-center gap-4">
              <div className="bg-white/20 p-3 rounded-full">
                <AlertTriangle className="w-8 h-8 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-xl mb-1 uppercase tracking-wide">Violation Detected: {activeAlert.alertType}</h3>
                <p className="text-rose-100">{activeAlert.message}</p>
                <p className="text-xs text-rose-200 mt-2 font-mono">Submission ID: {activeAlert.submissionId}</p>
              </div>
            </div>
            <div className="flex gap-3 shrink-0">
              <Button 
                variant="outline" 
                className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                onClick={() => {
                  socket?.emit('admin-command', { submissionId: activeAlert.submissionId, command: 'warn', message: 'Please stay focused on the screen. A violation was recorded.' });
                  setActiveAlert(null);
                }}
              >
                Warn Student
              </Button>
              <Button 
                variant="danger" 
                className="bg-rose-900 hover:bg-rose-950 text-white border-none"
                onClick={async () => {
                  socket?.emit('admin-command', { submissionId: activeAlert.submissionId, command: 'terminate', message: 'Exam terminated due to severe violation.' });
                  try {
                    await updateDoc(doc(db, 'submissions', activeAlert.submissionId), {
                      status: 'terminated',
                      endTime: serverTimestamp(),
                    });
                  } catch (e) {
                    console.error("Failed to terminate submission in db", e);
                  }
                  setActiveAlert(null);
                }}
              >
                Terminate Exam
              </Button>
              <Button 
                variant="ghost" 
                className="text-white hover:bg-white/10"
                onClick={() => setActiveAlert(null)}
              >
                Dismiss
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3 space-y-6">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">Active Students ({submissions.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {submissions.map(sub => (
              <Card key={sub.id} className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
                  <User className="w-6 h-6 text-slate-400 dark:text-slate-500" />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-slate-900 dark:text-white">{sub.studentName}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Exam ID: {sub.examId}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge variant={sub.warnings.length > 0 ? 'warning' : 'success'}>
                    {sub.warnings.length} Warnings
                  </Badge>
                  <div className="flex gap-1">
                    <Button 
                      variant={listeningTo === sub.id ? 'primary' : 'outline'} 
                      className="p-1 h-auto text-[10px]" 
                      onClick={() => setListeningTo(listeningTo === sub.id ? null : sub.id)}
                    >
                      {listeningTo === sub.id ? 'Listening...' : 'Listen'}
                    </Button>
                    <Button variant="outline" className="p-1 h-auto text-[10px]" onClick={() => socket?.emit('admin-command', { submissionId: sub.id, command: 'warn', message: 'Please stay focused on the screen.' })}>Warn</Button>
                    <Button variant="danger" className="p-1 h-auto text-[10px]" onClick={() => socket?.emit('admin-command', { submissionId: sub.id, command: 'terminate', message: 'Exam terminated due to multiple violations.' })}>Terminate</Button>
                  </div>
                </div>
              </Card>
            ))}
            {submissions.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-400 italic">
                No active students at the moment.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">Real-time Alerts</h2>
          <Card className="h-[600px] flex flex-col">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {alerts.map((alert, idx) => (
                <div key={idx} className="p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 rounded-lg animate-in fade-in slide-in-from-right-4">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4 text-rose-500 dark:text-rose-400" />
                    <span className="text-xs font-bold text-rose-700 dark:text-rose-300 uppercase">{alert.alertType}</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">{alert.message}</p>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 block">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
              {alerts.length === 0 && (
                <div className="h-full flex items-center justify-center text-slate-300 dark:text-slate-600 text-sm italic">
                  Listening for alerts...
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function EvidenceView({ exams }: { exams: Exam[] }) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (exams.length === 0) {
      setLoading(false);
      return;
    }

    const examIds = exams.map(e => e.id);
    const chunks = [];
    for (let i = 0; i < examIds.length; i += 10) {
      chunks.push(examIds.slice(i, i + 10));
    }

    const unsubscribes: (() => void)[] = [];
    let allSubmissions: Submission[] = [];
    let completedChunks = 0;

    chunks.forEach(chunk => {
      const q = query(collection(db, 'submissions'), where('examId', 'in', chunk));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const chunkSubs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Submission));
        
        setSubmissions(prev => {
          const others = prev.filter(s => !chunk.includes(s.examId));
          const updated = [...others, ...chunkSubs.filter(s => s.evidence && s.evidence.length > 0)];
          return updated;
        });
        
        completedChunks++;
        if (completedChunks === chunks.length) {
          setLoading(false);
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'submissions');
      });
      unsubscribes.push(unsubscribe);
    });

    return () => unsubscribes.forEach(u => u());
  }, [exams]);

  if (loading) return <div className="py-20 text-center text-slate-500">Loading evidence...</div>;

  if (submissions.length === 0) {
    return (
      <div className="py-20 text-center bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
        <Camera className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">No Evidence Recorded</h3>
        <p className="text-slate-500 dark:text-slate-400">There are no screenshots or evidence captured for any submissions yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">Proctoring Evidence</h2>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {submissions.map(sub => {
          const exam = exams.find(e => e.id === sub.examId);
          return (
            <Card key={sub.id} className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{sub.studentName}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Exam: {exam?.title || sub.examId}</p>
                </div>
                <Badge variant="warning">{sub.evidence?.length || 0} Captures</Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sub.evidence?.map((ev, idx) => (
                  <div key={idx} className="space-y-2 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                    <div className="aspect-video bg-black rounded-lg overflow-hidden relative">
                      <img src={`data:image/jpeg;base64,${ev.image}`} alt="Evidence" className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-rose-600 dark:text-rose-400">{ev.reason}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">{new Date(ev.timestamp).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

function AnalyticsDashboard({ exams }: { exams: Exam[] }) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (exams.length === 0) {
      setLoading(false);
      return;
    }

    const examIds = exams.map(e => e.id);
    const chunks = [];
    for (let i = 0; i < examIds.length; i += 10) {
      chunks.push(examIds.slice(i, i + 10));
    }

    const unsubscribes: (() => void)[] = [];
    let allSubmissions: Submission[] = [];
    let completedChunks = 0;

    chunks.forEach(chunk => {
      const q = query(collection(db, 'submissions'), where('examId', 'in', chunk));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const chunkSubs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Submission));
        allSubmissions = [...allSubmissions.filter(s => !chunk.includes(s.examId)), ...chunkSubs];
        
        completedChunks++;
        if (completedChunks >= chunks.length) {
          setSubmissions(allSubmissions);
          setLoading(false);
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'submissions');
      });
      unsubscribes.push(unsubscribe);
    });

    return () => unsubscribes.forEach(u => u());
  }, [exams]);

  if (loading) return <div className="py-20 text-center text-slate-500">Loading analytics...</div>;

  const examStats = exams.map(exam => {
    const examSubs = submissions.filter(s => s.examId === exam.id);
    const completedSubs = examSubs.filter(s => s.status === 'submitted');
    const totalScore = completedSubs.reduce((sum, s) => sum + (s.score || 0), 0);
    const avgScore = completedSubs.length > 0 ? Math.round((totalScore / completedSubs.length) * 10) / 10 : 0;
    const completionRate = examSubs.length > 0 ? Math.round((completedSubs.length / examSubs.length) * 100) : 0;

    // Calculate common mistakes
    const mistakes: Record<string, number> = {};
    completedSubs.forEach(sub => {
      exam.questions.forEach(q => {
        if (q.type === 'objective' && sub.answers[q.id] !== q.correctAnswer) {
          mistakes[q.id] = (mistakes[q.id] || 0) + 1;
        }
      });
    });

    const topMistakes = Object.entries(mistakes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([qId, count]) => {
        const q = exam.questions.find(q => q.id === qId);
        return { question: q?.text || 'Unknown', count };
      });

    return {
      name: exam.title,
      avgScore,
      completionRate,
      totalAttempts: examSubs.length,
      topMistakes
    };
  });

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">Performance Analytics</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="p-6">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6">Average Scores by Exam</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={examStats} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} tickFormatter={(val) => val.length > 15 ? val.substring(0, 15) + '...' : val} />
                <YAxis />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f8fafc' }}
                  itemStyle={{ color: '#818cf8' }}
                />
                <Legend />
                <Bar dataKey="avgScore" name="Average Score" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6">Completion Rates (%)</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={examStats} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} tickFormatter={(val) => val.length > 15 ? val.substring(0, 15) + '...' : val} />
                <YAxis domain={[0, 100]} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f8fafc' }}
                  itemStyle={{ color: '#10b981' }}
                />
                <Legend />
                <Bar dataKey="completionRate" name="Completion Rate %" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Common Mistakes</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {examStats.map((stat, idx) => (
            <Card key={idx} className="p-6">
              <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-4 truncate" title={stat.name}>{stat.name}</h4>
              {stat.topMistakes.length > 0 ? (
                <div className="space-y-3">
                  {stat.topMistakes.map((mistake, mIdx) => (
                    <div key={mIdx} className="bg-rose-50 dark:bg-rose-900/20 p-3 rounded-lg border border-rose-100 dark:border-rose-800/50">
                      <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2 mb-2">{mistake.question}</p>
                      <div className="flex items-center gap-2 text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                        <AlertTriangle className="w-3 h-3" />
                        {mistake.count} Students Failed
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400 italic">No significant mistakes recorded yet.</p>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function ResultsView({ exams, notify }: { exams: Exam[], notify: (m: string, t?: 'info' | 'error' | 'success') => void }) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmails, setUserEmails] = useState<Record<string, string>>({});
  const fetchedEmailsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (exams.length === 0) {
      setLoading(false);
      return;
    }
    const examIds = exams.map(e => e.id);
    // Firestore 'in' query supports up to 10 items. For simplicity, we fetch all submissions for the first 10 exams.
    // In a real app, you'd filter by selected exam or paginate.
    const q = query(collection(db, 'submissions'), where('examId', 'in', examIds.slice(0, 10)), orderBy('startTime', 'desc'));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const subs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Submission));
      setSubmissions(subs);
      
      // Fetch missing emails for older submissions
      const missingEmailStudentIds = [...new Set(subs.filter(s => !s.studentEmail).map(s => s.studentId))];
      const idsToFetch = missingEmailStudentIds.filter(uid => !fetchedEmailsRef.current.has(uid));
      
      if (idsToFetch.length > 0) {
        idsToFetch.forEach(uid => fetchedEmailsRef.current.add(uid));
        const newEmails: Record<string, string> = {};
        for (const uid of idsToFetch) {
          try {
            const userDoc = await getDoc(doc(db, 'users', uid));
            if (userDoc.exists()) {
              newEmails[uid] = userDoc.data().email;
            }
          } catch (e) {
            console.error("Failed to fetch user email", e);
            fetchedEmailsRef.current.delete(uid);
          }
        }
        setUserEmails(prev => ({ ...prev, ...newEmails }));
      }
      
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'submissions');
    });
    return unsubscribe;
  }, [exams]);

  const handleSendEmail = async (sub: Submission) => {
    let email = sub.studentEmail || userEmails[sub.studentId];
    
    if (!email) {
      try {
        const userDoc = await getDoc(doc(db, 'users', sub.studentId));
        if (userDoc.exists()) {
          email = userDoc.data().email;
          setUserEmails(prev => ({ ...prev, [sub.studentId]: email }));
        }
      } catch (e) {
        console.error("Failed to fetch user email", e);
      }
    }

    if (!email) {
      notify("Student email not available for this submission.", 'error');
      return;
    }
    const exam = exams.find(e => e.id === sub.examId);
    const subject = encodeURIComponent(`Your Exam Results: ${exam?.title || 'AlphaProctor Exam'}`);
    const body = encodeURIComponent(`Hello ${sub.studentName},\n\nYour results for ${exam?.title || 'the exam'} are ready.\n\nScore: ${sub.score !== undefined ? sub.score : 'Pending Grading'}\nStatus: ${sub.status}\nWarnings: ${sub.warnings.length}\n\nThank you,\nAlphaProctor Admin`);
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
    notify("Opened email client to send results.", 'success');
  };

  if (loading) return <div className="py-20 text-center text-slate-500">Loading results...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">Exam Results</h2>
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-900/50 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-6 py-4">Student</th>
                <th className="px-6 py-4">Exam</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Score</th>
                <th className="px-6 py-4">Warnings</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map(sub => {
                const exam = exams.find(e => e.id === sub.examId);
                return (
                  <tr key={sub.id} className="bg-white dark:bg-slate-900 border-b dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                      <div>{sub.studentName}</div>
                      <div className="text-xs text-slate-500 font-normal">{sub.studentEmail || userEmails[sub.studentId] || 'No email'}</div>
                    </td>
                    <td className="px-6 py-4">{exam?.title || 'Unknown Exam'}</td>
                    <td className="px-6 py-4">
                      <Badge variant={sub.status === 'submitted' ? 'success' : sub.status === 'terminated' ? 'error' : 'warning'}>
                        {sub.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 font-bold">
                      {sub.score !== undefined ? sub.score : '-'}
                    </td>
                    <td className="px-6 py-4 text-rose-500 font-medium">
                      {sub.warnings.length}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="outline" className="text-xs py-1 h-auto" onClick={() => handleSendEmail(sub)}>
                        <Send className="w-3 h-3 mr-1" /> Email Result
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {submissions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500 dark:text-slate-400">
                    No submissions found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// --- Student Dashboard ---

function StudentDashboard({ profile, socket, notify }: { profile: UserProfile, socket: Socket | null, notify: (m: string, t?: 'info' | 'error' | 'success') => void }) {
  const [examCode, setExamCode] = useState('');
  const [activeExam, setActiveExam] = useState<Exam | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [step, setStep] = useState<'join' | 'verify' | 'exam' | 'finished'>('join');
  const [loading, setLoading] = useState(false);

  if (profile.role !== 'student') return null;

  const handleJoin = async () => {
    if (!examCode) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'exams'), where('code', '==', examCode.toUpperCase()), where('isActive', '==', true));
      let querySnapshot;
      try {
        querySnapshot = await getDocs(q);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'exams');
        return;
      }
      if (querySnapshot.empty) {
        notify("Invalid exam code or exam is not active.", 'error');
        return;
      }
      const exam = { id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() } as Exam;
      setActiveExam(exam);
      setStep('verify');
    } catch (error) {
      console.error("Failed to join exam:", error);
    } finally {
      setLoading(false);
    }
  };

  const startExam = async () => {
    if (!activeExam) return;
    setLoading(true);
    try {
      let subRef;
      try {
        subRef = await addDoc(collection(db, 'submissions'), {
          examId: activeExam.id,
          studentId: profile.uid,
          studentName: profile.displayName,
          studentEmail: profile.email,
          status: 'active',
          answers: {},
          warnings: [],
          logs: [],
          verified: true,
          startTime: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'submissions');
        return;
      }
      
      let subSnap;
      try {
        subSnap = await getDoc(subRef);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `submissions/${subRef.id}`);
        return;
      }
      
      setSubmission({ id: subSnap.id, ...subSnap.data() } as Submission);
      setStep('exam');
      socket?.emit('join-exam', subSnap.id);
    } catch (error) {
      console.error("Failed to start exam:", error);
    } finally {
      setLoading(false);
    }
  };

  if (step === 'join') {
    return (
      <div className="max-w-md mx-auto py-20">
        <div className="text-center mb-12">
          <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <BookOpen className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Join Examination</h1>
          <p className="text-slate-500 dark:text-slate-400">Enter the unique code provided by your instructor.</p>
        </div>

        <Card className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Exam Code</label>
            <input 
              type="text" 
              value={examCode}
              onChange={e => setExamCode(e.target.value.toUpperCase())}
              className="w-full px-6 py-4 border-2 border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl text-2xl font-bold text-center tracking-[0.5em] focus:border-indigo-500 dark:focus:border-indigo-400 text-slate-900 dark:text-white outline-none transition-all"
              placeholder="XXXXXX"
              maxLength={6}
            />
          </div>
          <Button onClick={handleJoin} disabled={loading || examCode.length < 6} className="w-full py-4 h-14 text-lg">
            {loading ? 'Verifying...' : 'Join Exam'}
          </Button>
        </Card>
      </div>
    );
  }

  if (step === 'verify') {
    return <IdentityVerificationView onVerified={startExam} exam={activeExam!} />;
  }

  if (step === 'exam') {
    return <ExamInterface exam={activeExam!} submission={submission!} profile={profile} socket={socket} onFinished={() => setStep('finished')} notify={notify} />;
  }

  return (
    <div className="max-w-md mx-auto py-20 text-center">
      <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <CheckCircle className="w-10 h-10 text-emerald-600" />
      </div>
      <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Exam Submitted</h1>
      <p className="text-slate-500 dark:text-slate-400 mb-8">Your examination has been successfully submitted and is under review.</p>
      <Button variant="outline" onClick={() => window.location.reload()}>Back to Dashboard</Button>
    </div>
  );
}

function IdentityVerificationView({ onVerified, exam }: { onVerified: () => void, exam: Exam }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (videoRef.current) {
          videoRef.current.muted = true;
          const videoStream = new MediaStream([stream.getVideoTracks()[0]]);
          videoRef.current.srcObject = videoStream;
        }
      } catch (err) {
        setError("Camera and microphone access denied. Please enable them to proceed.");
      }
    };
    startCamera();
    return () => {
      const stream = videoRef.current?.srcObject as MediaStream;
      stream?.getTracks().forEach(track => track.stop());
    };
  }, []);

  const handleVerify = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setStatus('verifying');
    
    const context = canvasRef.current.getContext('2d');
    context?.drawImage(videoRef.current, 0, 0, 640, 480);
    const imageData = canvasRef.current.toDataURL('image/jpeg').split(',')[1];

    const result = await verifyIdentity(imageData);
    if (result.verified) {
      setStatus('success');
      setTimeout(onVerified, 1500);
    } else {
      setStatus('error');
      setError(result.reason || "Identity verification failed. Please ensure your face is clearly visible.");
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-10">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Identity Verification</h1>
        <p className="text-slate-500 dark:text-slate-400">Position yourself in front of the camera for AI verification.</p>
      </div>

      <Card className="p-8 space-y-6">
        <div className="relative aspect-video bg-slate-900 rounded-xl overflow-hidden border-4 border-slate-100 dark:border-slate-800 shadow-inner">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          <canvas ref={canvasRef} width={640} height={480} className="hidden" />
          
          <AnimatePresence>
            {status === 'verifying' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-indigo-600/20 backdrop-blur-[2px] flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin" />
                  <span className="text-white font-bold text-shadow">AI Verifying...</span>
                </div>
              </motion.div>
            )}
            {status === 'success' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-emerald-500/80 flex items-center justify-center">
                <div className="flex flex-col items-center gap-2">
                  <CheckCircle className="w-16 h-16 text-white" />
                  <span className="text-white font-bold text-xl">Verified Successfully</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="absolute top-4 right-4 flex gap-2">
            <div className="px-2 py-1 bg-black/50 backdrop-blur-md rounded text-[10px] text-white font-bold flex items-center gap-1">
              <Video className="w-3 h-3" /> LIVE
            </div>
          </div>
        </div>

        {status === 'error' && (
          <div className="p-4 bg-rose-50 border border-rose-100 rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-700 font-medium">{error}</p>
          </div>
        )}

        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">Exam Details:</h3>
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 flex justify-between items-center">
              <div>
                <div className="font-bold text-slate-900 dark:text-white">{exam.title}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{exam.duration} minutes • {exam.questions.length} questions</div>
              </div>
              <Badge variant="info">Ready to Start</Badge>
            </div>
          </div>
          
          <Button onClick={handleVerify} disabled={status === 'verifying' || status === 'success'} className="w-full py-4 h-14 text-lg">
            {status === 'verifying' ? 'Processing...' : 'Verify & Start Exam'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function ExamInterface({ exam, submission, profile, socket, onFinished, notify }: { exam: Exam, submission: Submission, profile: UserProfile, socket: Socket | null, onFinished: () => void, notify: (m: string, t?: 'info' | 'error' | 'success') => void }) {
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const answersRef = useRef(answers);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const [timeLeft, setTimeLeft] = useState(exam.duration * 60);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [tabViolations, setTabViolations] = useState(0);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('javascript');
  const [executionOutput, setExecutionOutput] = useState<any[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isMonitoring, setIsMonitoring] = useState(true);

  const [pyodide, setPyodide] = useState<any>(null);
  const [isPyodideLoading, setIsPyodideLoading] = useState(false);

  useEffect(() => {
    const loadPy = async () => {
      if ((window as any).loadPyodide && !pyodide && !isPyodideLoading) {
        setIsPyodideLoading(true);
        try {
          const py = await (window as any).loadPyodide({
            indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/"
          });
          setPyodide(py);
          notify("Python IDE initialized", "success");
        } catch (e) {
          console.error("Pyodide loading failed", e);
          notify("Failed to load Python IDE", "error");
        } finally {
          setIsPyodideLoading(false);
        }
      }
    };
    loadPy();
  }, []);

  const currentQuestion = exam.questions[currentQuestionIdx];

  const captureEvidence = async (reason: string) => {
    if (!videoRef.current || !canvasRef.current) return;
    const context = canvasRef.current.getContext('2d');
    context?.drawImage(videoRef.current, 0, 0, 320, 240);
    const imageData = canvasRef.current.toDataURL('image/jpeg', 0.5).split(',')[1];
    
    try {
      await updateDoc(doc(db, 'submissions', submission.id), {
        evidence: arrayUnion({
          timestamp: new Date().toISOString(),
          image: imageData,
          reason
        })
      });
    } catch (e) {
      console.error("Failed to save evidence", e);
    }
  };

  // Timer and Periodic Screenshot
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const screenshotTimer = setInterval(() => {
      if (isMonitoring) {
        captureEvidence('Periodic 30-second screenshot');
      }
    }, 30000);

    return () => {
      clearInterval(timer);
      clearInterval(screenshotTimer);
    };
  }, [isMonitoring]);

  // Proctoring: Tab focus
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTabViolations(prev => {
          const newVal = prev + 1;
          const msg = `Student switched tabs (Violation #${newVal})`;
          socket?.emit('student-alert', { 
            submissionId: submission.id, 
            alertType: 'tab-switch', 
            message: msg 
          });
          captureEvidence(msg);
          return newVal;
        });
      }
    };
    const handleBlur = () => {
      setTabViolations(prev => {
        const newVal = prev + 1;
        const msg = `Student navigated away from window (Violation #${newVal})`;
        socket?.emit('student-alert', { 
          submissionId: submission.id, 
          alertType: 'tab-switch', 
          message: msg 
        });
        captureEvidence(msg);
        return newVal;
      });
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [submission.id, socket]);

  // Proctoring: Fullscreen
  useEffect(() => {
    const handleFullScreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
      if (!document.fullscreenElement) {
        const msg = 'Student exited full-screen mode';
        socket?.emit('student-alert', { 
          submissionId: submission.id, 
          alertType: 'fullscreen-exit', 
          message: msg 
        });
        captureEvidence(msg);
      }
    };
    document.addEventListener('fullscreenchange', handleFullScreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullScreenChange);
  }, [submission.id, socket]);

  // Proctoring: AI Monitoring & Audio Tracking
  useEffect(() => {
    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let microphone: MediaStreamAudioSourceNode | null = null;
    let dataArray: Uint8Array | null = null;
    let audioInterval: NodeJS.Timeout;
    let mediaRecorder: MediaRecorder | null = null;

    const startCameraAndMic = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (videoRef.current) {
          videoRef.current.muted = true;
          const videoStream = new MediaStream([stream.getVideoTracks()[0]]);
          videoRef.current.srcObject = videoStream;
        }

        // Setup Audio Streaming to Admin
        if (socket && MediaRecorder.isTypeSupported('audio/webm')) {
          mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0 && isMonitoring) {
              socket.emit('audio-chunk', { submissionId: submission.id, chunk: e.data });
            }
          };
          mediaRecorder.start(1000); // Send chunk every 1 second
        }

        // Setup Audio Tracking
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);

        audioInterval = setInterval(() => {
          if (!analyser || !dataArray || !isMonitoring) return;
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const average = sum / bufferLength;
          
          // Threshold for detecting talking/noise (adjust as needed)
          if (average > 30) {
            const warning: Warning = {
              type: 'audio-detected',
              timestamp: new Date().toISOString(),
              message: 'Audio detected: Please remain quiet during the exam.'
            };
            notify(warning.message, 'error');
            
            // Save to DB
            try {
              updateDoc(doc(db, 'submissions', submission.id), {
                warnings: arrayUnion(warning)
              });
            } catch (error) {
              console.error("Failed to save audio warning", error);
            }

            socket?.emit('student-alert', { 
              submissionId: submission.id, 
              alertType: 'audio-detected', 
              message: 'Audio detected from student' 
            });
            captureEvidence('Audio detected from student');
          }
        }, 3000); // Check audio every 3 seconds

      } catch (err) {
        console.error("Camera/Mic access error:", err);
      }
    };
    startCameraAndMic();

    const monitorInterval = setInterval(async () => {
      if (!videoRef.current || !canvasRef.current || !isMonitoring) return;
      
      const context = canvasRef.current.getContext('2d');
      context?.drawImage(videoRef.current, 0, 0, 320, 240);
      const imageData = canvasRef.current.toDataURL('image/jpeg', 0.5).split(',')[1];

      const result = await monitorFrame(imageData);
      if (result.violations && result.violations.length > 0) {
        result.violations.forEach(v => {
          socket?.emit('student-alert', { 
            submissionId: submission.id, 
            alertType: 'ai-violation', 
            message: v 
          });
          captureEvidence(v);
        });
      }
    }, 15000); // Every 15 seconds

    return () => {
      clearInterval(monitorInterval);
      clearInterval(audioInterval);
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
      }
      const stream = videoRef.current?.srcObject as MediaStream;
      stream?.getTracks().forEach(track => track.stop());
    };
  }, [submission.id, socket, isMonitoring]);

  // Socket commands from admin
  useEffect(() => {
    if (!socket) return;
    socket.on('student-command', async (data) => {
      if (data.command === 'terminate') {
        setIsMonitoring(false);
        try {
          let score = 0;
          const currentAnswers = answersRef.current;
          exam.questions.forEach(q => {
            if (q.type === 'objective' && currentAnswers[q.id] === q.correctAnswer) {
              score += q.points;
            }
          });
          await updateDoc(doc(db, 'submissions', submission.id), {
            status: 'terminated',
            answers: currentAnswers,
            score,
            endTime: serverTimestamp(),
          });
        } catch (e) {
          console.error("Failed to terminate exam", e);
        }
        notify(data.message, 'error');
        onFinished();
      } else if (data.command === 'warn') {
        notify("ADMIN WARNING: " + data.message, 'warning' as any);
      }
    });
    return () => { socket.off('student-command'); };
  }, [socket, onFinished]);

  const handleSubmit = async () => {
    setIsMonitoring(false);
    try {
      let score = 0;
      const currentAnswers = answersRef.current;
      exam.questions.forEach(q => {
        if (q.type === 'objective' && currentAnswers[q.id] === q.correctAnswer) {
          score += q.points;
        }
      });

      await updateDoc(doc(db, 'submissions', submission.id), {
        status: 'submitted',
        answers: currentAnswers,
        score,
        endTime: serverTimestamp(),
      });
      onFinished();
    } catch (error) {
      console.error("Failed to submit exam:", error);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const enterFullScreen = () => {
    document.documentElement.requestFullscreen();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'v' || e.key === 'x')) {
      e.preventDefault();
      notify("Copy/Paste is disabled during the examination.", 'error');
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-white dark:bg-slate-950 z-[200] flex flex-col overflow-hidden select-none transition-colors duration-300"
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
    >
      {/* Exam Header */}
      <header className="h-16 border-b border-slate-200 dark:border-slate-800 px-6 flex items-center justify-between bg-white dark:bg-slate-900 shrink-0 transition-colors">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <img src="/logo.png" alt="Logo" className="w-8 h-8" />
          </div>
          <h2 className="font-bold text-slate-900 dark:text-white">{exam.title}</h2>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-full">
            <Clock className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <span className={cn("font-mono font-bold", timeLeft < 300 ? "text-rose-600 animate-pulse" : "text-slate-700 dark:text-slate-200")}>
              {formatTime(timeLeft)}
            </span>
          </div>
          <Button variant="primary" onClick={handleSubmit}>Submit Exam</Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar: Proctoring & Questions */}
        <aside className="w-80 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex flex-col shrink-0 transition-colors">
          <div className="p-4 space-y-4">
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden border-2 border-white dark:border-slate-800 shadow-lg">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <canvas ref={canvasRef} width={320} height={240} className="hidden" />
              <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-indigo-600 rounded text-[8px] text-white font-bold uppercase tracking-widest">AI Proctoring Active</div>
            </div>

            <div className="space-y-2">
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Security Status</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs p-2 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
                  <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300"><Monitor className="w-3 h-3" /> Fullscreen</span>
                  {isFullScreen ? <CheckCircle className="w-3 h-3 text-emerald-500" /> : <XCircle className="w-3 h-3 text-rose-500" />}
                </div>
                {!isFullScreen && (
                  <Button variant="outline" className="w-full py-1 h-auto text-[10px]" onClick={enterFullScreen}>Enter Fullscreen</Button>
                )}
                <div className="flex items-center justify-between text-xs p-2 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
                  <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300"><Eye className="w-3 h-3" /> Tab Switches</span>
                  <span className={cn("font-bold", tabViolations > 0 ? "text-rose-600" : "text-emerald-600")}>{tabViolations}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 border-t border-slate-200 dark:border-slate-800">
            <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Question Navigator</h4>
            <div className="grid grid-cols-5 gap-2">
              {exam.questions.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentQuestionIdx(idx)}
                  className={cn(
                    "w-10 h-10 rounded-lg text-xs font-bold transition-all",
                    currentQuestionIdx === idx ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-900/40" : 
                    answers[exam.questions[idx].id] ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800" :
                    "bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600"
                  )}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Main Content: Question */}
        <main className="flex-1 overflow-y-auto bg-white dark:bg-slate-900 p-12 transition-colors">
          <div className="max-w-3xl mx-auto space-y-10">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Badge variant="info">Question {currentQuestionIdx + 1}</Badge>
                <span className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{currentQuestion.type} • {currentQuestion.points} Points</span>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white leading-tight">
                {currentQuestion.text}
              </h3>
            </div>

            <div className="space-y-6">
              {currentQuestion.type === 'objective' && currentQuestion.options && (
                <div className="grid grid-cols-1 gap-4">
                  {currentQuestion.options.map((opt, idx) => (
                    <button
                      key={idx}
                      onClick={() => setAnswers({ ...answers, [currentQuestion.id]: opt })}
                      className={cn(
                        "w-full p-6 text-left rounded-xl border-2 transition-all flex items-center gap-4 group",
                        answers[currentQuestion.id] === opt ? "border-indigo-600 bg-indigo-50/50 dark:bg-indigo-900/20" : "border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 bg-slate-50/30 dark:bg-slate-800/30"
                      )}
                    >
                      <div className={cn(
                        "w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                        answers[currentQuestion.id] === opt ? "border-indigo-600 bg-indigo-600" : "border-slate-300 dark:border-slate-600 group-hover:border-indigo-400"
                      )}>
                        {answers[currentQuestion.id] === opt && <div className="w-2 h-2 bg-white rounded-full" />}
                      </div>
                      <span className={cn("font-medium", answers[currentQuestion.id] === opt ? "text-indigo-900 dark:text-indigo-100" : "text-slate-700 dark:text-slate-300")}>{opt}</span>
                    </button>
                  ))}
                </div>
              )}

              {currentQuestion.type === 'subjective' && (
                <textarea 
                  value={answers[currentQuestion.id] || ''}
                  onChange={e => setAnswers({ ...answers, [currentQuestion.id]: e.target.value })}
                  className="w-full h-64 p-6 border-2 border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl focus:border-indigo-500 dark:focus:border-indigo-400 outline-none resize-none font-medium text-slate-800 dark:text-slate-200 leading-relaxed"
                  placeholder="Type your answer here..."
                />
              )}

              {currentQuestion.type === 'coding' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between bg-slate-900 p-4 rounded-t-2xl border-b border-slate-700">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-widest">
                        <Terminal className="w-4 h-4" /> IDE v1.0
                      </div>
                      <select 
                        value={selectedLanguage}
                        onChange={(e) => setSelectedLanguage(e.target.value)}
                        className="bg-slate-800 text-slate-300 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded border border-slate-700 outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="javascript">JavaScript</option>
                        <option value="python">Python</option>
                        <option value="cpp">C++ (Mock)</option>
                        <option value="java">Java (Mock)</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-3">
                      <Button variant="primary" className="text-xs px-4 py-1.5 h-auto flex items-center gap-2" onClick={async () => {
                        const code = answers[currentQuestion.id] || '';
                        const results: any[] = [];
                        
                        if (selectedLanguage === 'python') {
                          if (!pyodide) {
                            notify("Python IDE is still loading...", "info");
                            return;
                          }
                          
                          for (const tc of (currentQuestion.testCases || [])) {
                            try {
                              // Inject input
                              pyodide.globals.set('input_data', tc.input);

                              // Reset stdout and mock input
                              pyodide.runPython(`
import sys
from io import StringIO
sys.stdout = StringIO()
_input_list = str(input_data).split('\\n')
_input_idx = 0
def input():
    global _input_idx
    if _input_idx < len(_input_list):
        val = _input_list[_input_idx]
        _input_idx += 1
        return val
    return ""
                              `);
                              
                              // Run code
                              // We wrap it to handle potential print statements and return values
                              await pyodide.runPythonAsync(code);
                              
                              const stdout = pyodide.runPython("sys.stdout.getvalue()");
                              const actual = stdout.trim();
                              
                              results.push({
                                input: tc.input,
                                expected: tc.expectedOutput,
                                actual: actual,
                                passed: String(actual).trim() === String(tc.expectedOutput).trim()
                              });
                            } catch (err: any) {
                              results.push({
                                input: tc.input,
                                expected: tc.expectedOutput,
                                actual: "Error: " + err.message,
                                passed: false
                              });
                            }
                          }
                          setExecutionOutput(results);
                          return;
                        }

                        if (selectedLanguage !== 'javascript') {
                          notify(`${selectedLanguage.toUpperCase()} execution is currently simulated. Only JavaScript and Python are supported for live running.`, 'info');
                          return;
                        }

                        currentQuestion.testCases?.forEach(tc => {
                          try {
                            // Enhanced JS runner
                            const runner = new Function('input', `
                              let output = [];
                              const console = { log: (...args) => { output.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')); } };
                              
                              let parsedInput = input;
                              try { parsedInput = JSON.parse(input); } catch(e) {}

                              try {
                                // Try to see if the user defined a 'solution' function
                                ${code}
                                
                                if (typeof solution === 'function') {
                                  const result = solution(parsedInput);
                                  if (result !== undefined && output.length === 0) return String(result);
                                }
                                
                                // If no solution function, or it didn't return anything, return the logs
                                return output.join('\\n');
                              } catch (e) {
                                throw e;
                              }
                            `);
                            
                            const actual = runner(tc.input);
                            results.push({
                              input: tc.input,
                              expected: tc.expectedOutput,
                              actual: actual,
                              passed: String(actual).trim() === String(tc.expectedOutput).trim()
                            });
                          } catch (err: any) {
                            results.push({
                              input: tc.input,
                              expected: tc.expectedOutput,
                              actual: "Error: " + err.message,
                              passed: false
                            });
                          }
                        });
                        setExecutionOutput(results);
                      }}>
                        <PlayCircle className="w-4 h-4" /> Run Code
                      </Button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 rounded-b-2xl overflow-hidden border border-slate-200 shadow-xl">
                    <div className="lg:col-span-2 bg-[#2d2d2d] min-h-[500px] relative">
                      <div className="absolute top-0 left-0 w-12 h-full bg-[#1e1e1e] border-r border-slate-700 flex flex-col items-center pt-4 text-[10px] text-slate-500 font-mono select-none">
                        {Array.from({ length: 20 }).map((_, i) => <div key={i} className="h-[21px]">{i + 1}</div>)}
                      </div>
                      <div className="pl-14 pt-4 pr-4 h-full overflow-auto custom-scrollbar">
                        <Editor
                          value={answers[currentQuestion.id] || `// Write a function named 'solution' that takes 'input' as an argument\n// or just use console.log() to output your answer.\n\nfunction solution(input) {\n  // Your code here\n  return input;\n}`}
                          onValueChange={code => setAnswers({ ...answers, [currentQuestion.id]: code })}
                          highlight={code => {
                            const lang = selectedLanguage === 'cpp' ? 'cpp' : selectedLanguage === 'java' ? 'java' : selectedLanguage;
                            try {
                              return hljs.highlight(code, { language: lang }).value;
                            } catch (e) {
                              return hljs.highlightAuto(code).value;
                            }
                          }}
                          padding={20}
                          style={{
                            fontFamily: '"JetBrains Mono", "Fira Mono", monospace',
                            fontSize: 13,
                            minHeight: '100%',
                            backgroundColor: 'transparent',
                            color: '#e2e8f0',
                            lineHeight: '1.6'
                          }}
                          className="outline-none"
                          textareaClassName="outline-none focus:ring-0"
                          preClassName="outline-none"
                        />
                      </div>
                    </div>
                    
                    <div className="bg-slate-900 border-l border-slate-700 flex flex-col h-[500px]">
                      <div className="p-3 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Console Output</span>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => setExecutionOutput([])}
                            className="text-[10px] text-slate-500 hover:text-slate-300 font-bold uppercase tracking-widest"
                          >
                            Clear
                          </button>
                          <div className="flex gap-1">
                            <div className="w-2 h-2 rounded-full bg-rose-500" />
                            <div className="w-2 h-2 rounded-full bg-amber-500" />
                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-4 custom-scrollbar">
                        {executionOutput.length === 0 ? (
                          <div className="text-slate-600 dark:text-slate-400 italic">Click 'Run Code' to see results...</div>
                        ) : (
                          executionOutput.map((res, idx) => (
                            <div key={idx} className={cn("p-3 rounded border", res.passed ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20")}>
                              <div className="flex justify-between items-center mb-2">
                                <span className={cn("font-bold uppercase text-[10px]", res.passed ? "text-emerald-400" : "text-rose-400")}>
                                  Test Case {idx + 1}: {res.passed ? 'Passed' : 'Failed'}
                                </span>
                                {res.passed ? <CheckCircle className="w-3 h-3 text-emerald-500" /> : <XCircle className="w-3 h-3 text-rose-500" />}
                              </div>
                              <div className="space-y-1 text-[10px]">
                                <div className="flex gap-2"><span className="text-slate-500 w-16">Input:</span> <span className="text-slate-300">{res.input}</span></div>
                                <div className="flex gap-2"><span className="text-slate-500 w-16">Expected:</span> <span className="text-emerald-400">{res.expected}</span></div>
                                <div className="flex gap-2"><span className="text-slate-500 w-16">Actual:</span> <span className={res.passed ? "text-emerald-400" : "text-rose-400"}>{res.actual}</span></div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      
                      <div className="p-4 bg-slate-950 border-t border-slate-800">
                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                          <span>Status: {executionOutput.length > 0 ? (executionOutput.every(r => r.passed) ? 'All Passed' : 'Some Failed') : 'Idle'}</span>
                          <span>UTF-8</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-10 border-t border-slate-100">
              <Button 
                variant="outline" 
                disabled={currentQuestionIdx === 0}
                onClick={() => setCurrentQuestionIdx(prev => prev - 1)}
              >
                Previous Question
              </Button>
              <Button 
                variant={currentQuestionIdx === exam.questions.length - 1 ? 'primary' : 'outline'}
                onClick={() => {
                  if (currentQuestionIdx < exam.questions.length - 1) {
                    setCurrentQuestionIdx(prev => prev + 1);
                  } else {
                    handleSubmit();
                  }
                }}
              >
                {currentQuestionIdx === exam.questions.length - 1 ? 'Finish Exam' : 'Next Question'}
              </Button>
            </div>
          </div>
        </main>
      </div>

    </div>
  );
}
