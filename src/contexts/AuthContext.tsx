import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile as updateAuthProfile,
  signInWithCredential,
  GoogleAuthProvider
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';

interface UserProfile {
  email: string;
  role: 'student' | 'admin';
  name: string;
  rollNo?: string;
  collegeName?: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isSigningIn: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    // Check for redirect result on mount (important for mobile APKs)
    getRedirectResult(auth).catch(error => {
      console.error('Error getting redirect result', error);
    });

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            setProfile(userDoc.data() as UserProfile);
          } else {
            // Check if this is a brand new email login
            // We want to let signUpWithEmail handle the profile creation so name is accurate
            const isRecent = new Date().getTime() - new Date(currentUser.metadata.creationTime || '').getTime() < 10000;
            const isEmailLogin = currentUser.providerData.some(p => p.providerId === 'password');
            if (isEmailLogin && isRecent && !currentUser.displayName) {
               // Wait for signUpWithEmail to update the auth profile and set the database doc
               return; 
            }

            // Create new student profile by default if it doesn't exist
            // This handles cases where people sign in with Google for the first time
            const newProfile: UserProfile = {
              email: currentUser.email || '',
              role: 'student',
              name: currentUser.displayName || 'Student',
            };
            try {
              await setDoc(userDocRef, newProfile);
              setProfile(newProfile);
            } catch (error) {
              console.error('Initial setDoc error', error);
              // don't throw error here to allow loading to finish
            }
          }
        } catch (error) {
          console.error("Error fetching user profile", error);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signInWithGoogle = async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    try {
      // Google Sign In via Firebase JS SDK does not work reliably in native webviews.
      if ((window as any).Capacitor && (window as any).Capacitor.isNativePlatform()) {
        const result = await FirebaseAuthentication.signInWithGoogle();
        if (result.credential?.idToken) {
          const credential = GoogleAuthProvider.credential(result.credential.idToken);
          await signInWithCredential(auth, credential);
        } else {
          throw new Error('Google Sign-In failed: No ID token returned.');
        }
      } else if (/Android|iPhone|iPad/i.test(navigator.userAgent)) {
        await signInWithRedirect(auth, googleProvider);
      } else {
        await signInWithPopup(auth, googleProvider);
      }
    } catch (error: any) {
      if (error?.code === 'auth/cancelled-popup-request' || error?.code === 'auth/popup-closed-by-user') {
        // User cancelled the popup, ignore gracefully
        console.log('Popup/Redirect closed or cancelled by user');
      } else {
        console.error('Error signing in with Google', error);
        throw error;
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    setIsSigningIn(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error('Error signing in with Email', error);
      throw error;
    } finally {
      setIsSigningIn(false);
    }
  };

  const signUpWithEmail = async (email: string, password: string, name: string) => {
    setIsSigningIn(true);
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await updateAuthProfile(result.user, { displayName: name });
      
      const userDocRef = doc(db, 'users', result.user.uid);
      const newProfile: UserProfile = {
        email: email,
        role: 'student',
        name: name,
      };
      
      try {
        await setDoc(userDocRef, newProfile);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `users/${result.user.uid}`);
      }
      
      setProfile(newProfile);
    } catch (error) {
      console.error('Error signing up', error);
      throw error;
    } finally {
      setIsSigningIn(false);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out', error);
      throw error;
    }
  };

  const updateProfile = async (data: Partial<UserProfile>) => {
    if (!user || !profile) return;
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, data, { merge: true });
      setProfile({ ...profile, ...data as UserProfile });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
      throw error;
    }
  };

  const isAdmin = profile?.role === 'admin' || (user?.email === 'kushalmmahajan@gmail.com' && user?.emailVerified);

  return (
    <AuthContext.Provider value={{ user, profile, loading, isSigningIn, signInWithGoogle, signInWithEmail, signUpWithEmail, logout, isAdmin, updateProfile }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
