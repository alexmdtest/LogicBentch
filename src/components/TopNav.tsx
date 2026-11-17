import React, { useEffect, useState } from 'react';
import { Cloud, LogIn, LogOut } from 'lucide-react';
import { auth, onAuthStateChanged, signInWithGoogle, signOutUser, type User } from '../firebase';
import { AppView, useLabStore } from '../store/useLabStore';

interface TopNavProps {
  onSaveAndExport: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({ onSaveAndExport }) => {
  const activeView = useLabStore((s) => s.activeView);
  const setActiveView = useLabStore((s) => s.setActiveView);
  const refreshRecentProjects = useLabStore((s) => s.refreshRecentProjects);
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      void refreshRecentProjects();
    });
    return () => unsub();
  }, [refreshRecentProjects]);

  const handleAuthAction = async () => {
    setAuthBusy(true);
    try {
      if (user) {
        await signOutUser();
      } else {
        await signInWithGoogle();
      }
    } catch (err) {
      console.error('Firebase Auth error:', err);
    } finally {
      setAuthBusy(false);
    }
  };

  const links: Array<{ id: AppView; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'workspace', label: 'Trainer Lab' },
    { id: 'library', label: 'IC Library' },
    { id: 'experiments', label: 'Experiments' },
  ];

  return (
    <header className="min-h-14 bg-[#20252B] text-[#F1F0EB] border-b border-[#303840] px-3 sm:px-6 py-2 sm:py-0 flex flex-wrap sm:flex-nowrap items-center justify-between gap-x-4 gap-y-2 shrink-0">
      {/* Zone 1: Single-line Brand Wordmark */}
      <button
        type="button"
        onClick={() => setActiveView('dashboard')}
        className="text-base sm:text-lg font-semibold tracking-tight text-[#F1F0EB] whitespace-nowrap shrink-0 hover:text-white transition-colors cursor-pointer"
      >
        LogicBench
      </button>

      {/* Zone 2: Concise single-line navigation links */}
      <nav
        aria-label="Primary navigation"
        className="order-3 sm:order-2 w-full sm:w-auto flex items-center justify-between sm:justify-center gap-3 sm:gap-6 border-t sm:border-t-0 border-[#303840] pt-1.5 sm:pt-0"
      >
        {links.map((link) => {
          const isActive = activeView === link.id;
          return (
            <button
              key={link.id}
              type="button"
              onClick={() => setActiveView(link.id)}
              className={`text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                isActive
                  ? 'text-[#F1F0EB] border-[#456A83]'
                  : 'text-[#A5ACB2] border-transparent hover:text-[#F1F0EB]'
              }`}
            >
              {link.label}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Firebase Cloud Sync + Primary Save Action */}
      <div className="order-2 sm:order-3 flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => void handleAuthAction()}
          disabled={authBusy}
          title={
            user
              ? `Signed in to Firebase (${user.email ?? user.uid}) — Click to Sign Out`
              : 'Sign in with Google to sync circuits to Firebase Cloud Firestore'
          }
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono bg-[#303840] text-[#D6D5CE] border border-[#47505A] rounded hover:bg-[#3A434D] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Cloud className="w-3.5 h-3.5 text-[#529471]" />
          {user ? (
            <>
              <span className="max-w-[120px] truncate">{user.displayName || user.email || 'Cloud Synced'}</span>
              <LogOut className="w-3 h-3 text-[#A5ACB2]" />
            </>
          ) : (
            <>
              <span>Firebase Sign In</span>
              <LogIn className="w-3 h-3 text-[#A5ACB2]" />
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onSaveAndExport}
          className="px-3 sm:px-4 py-1.5 text-xs font-medium bg-[#456A83] text-[#F1F0EB] rounded hover:bg-[#527B96] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          Save Project
        </button>
      </div>
    </header>
  );
};
