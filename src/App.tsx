import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Routes, Route, useNavigate, useLocation, Navigate, useParams } from 'react-router-dom';
import { Page, User } from './types';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp, collection, query, where, getDocs, writeBatch, onSnapshot, increment, updateDoc } from 'firebase/firestore';
import { GAMES } from './constants';

// Pages
import Auth from './pages/Auth';
import Home from './pages/Home';
import Tournaments from './pages/Tournaments';
import JoinMatch from './pages/JoinMatch';
import WalletPage from './pages/Wallet';
import AddMoney from './pages/AddMoney';
import Withdraw from './pages/Withdraw';
import ProfilePage from './pages/Profile';
import AdminPage from './pages/Admin';
import AdminUserDetail from './pages/AdminUserDetail';
import AdminEditMatch from './pages/AdminEditMatch';
import AdminCreateMatch from './pages/AdminCreateMatch';
import ReferralPage from './pages/Referral';
import ProfileDetails from './pages/ProfileDetails';
import GameStats from './pages/GameStats';
import GameModes from './pages/GameModes';
import AdminModes from './pages/AdminModes';
import Leaderboard from './pages/Leaderboard';
import MatchDetails from './pages/MatchDetails';
import GlobalNotificationListener from './components/GlobalNotificationListener';

const DEFAULT_USER_DATA = {
  wallet: {
    deposit: 0,
    winnings: 0,
    bonus: 0,
  },
  isKycVerified: false,
  isAdmin: false,
  stats: {
    matchesPlayed: 0,
    totalWins: 0,
    totalKills: 0,
    totalWinnings: 0,
  }
};

const pageToPath = {
  [Page.LOGIN]: '/login',
  [Page.SIGNUP]: '/signup',
  [Page.HOME]: '/home',
  [Page.TOURNAMENTS]: '/tournaments',
  [Page.JOIN_MATCH]: '/match',
  [Page.WALLET]: '/wallet',
  [Page.ADD_MONEY]: '/wallet/add',
  [Page.WITHDRAW]: '/wallet/withdraw',
  [Page.PROFILE]: '/profile',
  [Page.ADMIN]: '/admin',
  [Page.ADMIN_USER_PROFILE]: '/admin/user',
  [Page.ADMIN_EDIT_MATCH]: '/admin/match/edit',
  [Page.ADMIN_CREATE_MATCH]: '/admin/match/create',
  [Page.REFERRAL]: '/referral',
  [Page.PROFILE_DETAILS]: '/profile/details',
  [Page.GAME_STATS]: '/profile/stats',
  [Page.GAME_MODES]: '/game-modes',
  [Page.ADMIN_MODES]: '/admin/modes',
  [Page.LEADERBOARD]: '/leaderboard',
  [Page.MATCH_DETAILS]: '/match-details'
};

const pathToPage: Record<string, Page> = {
  '/login': Page.LOGIN,
  '/signup': Page.SIGNUP,
  '/home': Page.HOME,
  '/tournaments': Page.TOURNAMENTS,
  '/match': Page.JOIN_MATCH,
  '/match-details': Page.MATCH_DETAILS,
  '/wallet': Page.WALLET,
  '/wallet/add': Page.ADD_MONEY,
  '/wallet/withdraw': Page.WITHDRAW,
  '/profile': Page.PROFILE,
  '/admin': Page.ADMIN,
  '/admin/user': Page.ADMIN_USER_PROFILE,
  '/admin/match/edit': Page.ADMIN_EDIT_MATCH,
  '/admin/match/create': Page.ADMIN_CREATE_MATCH,
  '/referral': Page.REFERRAL,
  '/profile/details': Page.PROFILE_DETAILS,
  '/profile/stats': Page.GAME_STATS,
  '/game-modes': Page.GAME_MODES,
  '/admin/modes': Page.ADMIN_MODES,
  '/leaderboard': Page.LEADERBOARD
};

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [pathname]);
  return null;
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<User | null>(() => {
    try {
      const cached = localStorage.getItem('smart_battle_cached_user');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.id) return parsed;
      }
    } catch {
      // Ignore
    }
    return null;
  });
  const [loading, setLoading] = useState(true);
  const [joinedMatchIds, setJoinedMatchIds] = useState<string[]>([]);
  const hasSeededRef = useRef(false);
  const isProcessingReferralRef = useRef(false);

  // Proactively refresh session token when waking from tab suspension / 1-2 hours inactivity
  useEffect(() => {
    const handleWakeSession = async () => {
      if (document.visibilityState === 'visible' && auth.currentUser) {
        try {
          await auth.currentUser.getIdToken(false);
          console.log('[Auth] Session token validated/refreshed on tab wake');
        } catch (err: any) {
          console.warn('[Auth] Wake token refresh warning:', err?.message);
          if (
            err?.code === 'auth/user-disabled' ||
            err?.code === 'auth/user-token-expired' ||
            err?.code === 'auth/user-not-found'
          ) {
            handleLogout();
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleWakeSession);
    window.addEventListener('focus', handleWakeSession);
    window.addEventListener('online', handleWakeSession);

    // Keep session refreshed periodically every 45 minutes
    const sessionKeepAliveInterval = setInterval(async () => {
      if (auth.currentUser) {
        try {
          await auth.currentUser.getIdToken(true);
        } catch {
          // Network errors during background keep-alive must never destroy valid session
        }
      }
    }, 45 * 60 * 1000);

    return () => {
      document.removeEventListener('visibilitychange', handleWakeSession);
      window.removeEventListener('focus', handleWakeSession);
      window.removeEventListener('online', handleWakeSession);
      clearInterval(sessionKeepAliveInterval);
    };
  }, []);

  useEffect(() => {
    let unsubscribeUser: (() => void) | null = null;

    const seedDatabase = async (email: string, uid: string) => {
      if (hasSeededRef.current) return;
      const admins = ["qupagaming@gmail.com", "mahendrathakur9009@gmail.com", "mahendrar9009@gmail.com", "ankushsharma3948@gmail.com"];
      if (!admins.includes(email) && uid !== "XoXyXcnrlzOaMIKKolXnU3mT9xn1") return;
      hasSeededRef.current = true;
      try {
        // Independence seeding for games
        const gamesSnap = await getDocs(collection(db, 'games'));
        if (gamesSnap.empty) {
          const batch = writeBatch(db);
          GAMES.forEach(game => {
            batch.set(doc(db, 'games', game.id), game);
          });
          await batch.commit();
          console.log('Games seeded');
        }

        // Seeding game rules
        const rulesSnap = await getDocs(collection(db, 'gameRules'));
        if (rulesSnap.empty) {
          const batch = writeBatch(db);
          const defaultRules = [
            {
              id: 'battle_royale',
              type: 'Battle Royale',
              rules: [
                'No hacking or cheating allowed.',
                'No emulator players allowed.',
                'Using banned apps will lead to ban.',
                'Screenshot of match is mandatory.',
                'Respect other players.',
                'Late entry is not allowed.',
                'Admin decision will be final.'
              ]
            },
            {
              id: 'clash_squad',
              type: 'Clash Squad',
              rules: [
                'No hacking or cheating allowed.',
                'No emulator players allowed.',
                'Teaming with enemies is banned.',
                'Screenshot of match is mandatory.',
                'Respect other players.',
                'Late entry is not allowed.',
                'Admin decision will be final.'
              ]
            },
            {
              id: 'lone_wolf',
              type: 'Lone Wolf',
              rules: [
                'No hacking or cheating allowed.',
                'No emulator players allowed.',
                'Rank pushing is not allowed.',
                'Screenshot of match is mandatory.',
                'Respect other players.',
                'Late entry is not allowed.',
                'Admin decision will be final.'
              ]
            }
          ];
          defaultRules.forEach(rule => {
            batch.set(doc(db, 'gameRules', rule.id), rule);
          });
          await batch.commit();
          console.log('Game rules seeded');
        }

        // Seeding app settings
        const settingsSnap = await getDoc(doc(db, 'appSettings', 'referral_support'));
        if (!settingsSnap.exists()) {
          await setDoc(doc(db, 'appSettings', 'referral_support'), {
            referral: {
              baseUrl: window.location.origin,
              perReferralReward: 50,
              rewardType: 'bonus',
              depositPercentage: 50,
              bonusPercentage: 50,
              newUserReward: 10
            },
            support: {
              whatsapp: 'https://wa.me/910000000000',
              telegram: 'https://t.me/smartbattle',
              email: 'support@smartbattle.com'
            }
          });
          console.log('App settings seeded');
        }

        // Synchronize Game Modes from constants
        const { GAME_MODES_DATA } = await import('./constants');
        
        // Remove CS Squad if present
        try {
          const csSquadRef = doc(db, 'gameModes', 'freefire_cs_squad');
          const csSquadDoc = await getDoc(csSquadRef);
          if (csSquadDoc.exists()) {
            await deleteDoc(csSquadRef);
            console.log('Removed freefire_cs_squad from gameModes');
          }
        } catch (e) {
          // Ignore permission warnings
        }

        // Ensure Free Match mode
        try {
          const freeMatchRef = doc(db, 'gameModes', 'freefire_free_match');
          const freeMatchDoc = await getDoc(freeMatchRef);
          if (!freeMatchDoc.exists() || freeMatchDoc.data()?.image?.includes('1791755555487')) {
            await setDoc(freeMatchRef, {
              id: 'free_match',
              gameId: 'freefire',
              title: 'FREE MATCH',
              subtitle: 'Free Entry',
              category: 'Free Match',
              image: '/images/regenerated_image_1791756013539.png',
              order: 3
            }, { merge: true });
            console.log('Seeded freefire_free_match');
          }
        } catch (e) {
          // Ignore
        }

        // Ensure CS Headshot mode
        try {
          const csHeadshotRef = doc(db, 'gameModes', 'freefire_cs_headshot');
          const csHeadshotDoc = await getDoc(csHeadshotRef);
          if (!csHeadshotDoc.exists() || csHeadshotDoc.data()?.image?.includes('1791755557083') || csHeadshotDoc.data()?.image?.startsWith('/src/assets/images/')) {
            await setDoc(csHeadshotRef, {
              id: 'cs_headshot',
              gameId: 'freefire',
              title: 'CS HEADSHOT',
              subtitle: 'Only Headshot',
              category: 'CS Headshot',
              image: '/images/regenerated_image_1791756005244.png',
              order: 4
            }, { merge: true });
            console.log('Seeded freefire_cs_headshot');
          }
        } catch (e) {
          // Ignore
        }

        const modesSnap = await getDocs(collection(db, 'gameModes'));
        if (modesSnap.empty) {
          const batch = writeBatch(db);
          Object.entries(GAME_MODES_DATA).forEach(([gameId, modes]) => {
            modes.forEach((mode, index) => {
              const modeId = `${gameId}_${mode.id}`;
              batch.set(doc(db, 'gameModes', modeId), {
                ...mode,
                gameId,
                order: index
              });
            });
          });
          await batch.commit();
          console.log('Game modes seeded from constants');
        } else {
          // Auto-repair any mode in Firestore that has the specific dead test URL or legacy src paths
          for (const mDoc of modesSnap.docs) {
            const data = mDoc.data();
            if (data.image && (data.image.includes('i.ibb.co/v4v8Q5N/freefire.jpg') || data.image.startsWith('/src/assets/images/') || data.image.startsWith('src/assets/images/'))) {
              const cleanId = (data.id || '').replace(/^freefire_/, '');
              const targetImg = (GAME_MODES_DATA['freefire']?.find(m => m.id === cleanId)?.image) || '/images/regenerated_image_1791755547255.png';
              try {
                await setDoc(doc(db, 'gameModes', mDoc.id), {
                  image: targetImg
                }, { merge: true });
                console.log(`Repaired image for mode ${mDoc.id} -> ${targetImg}`);
              } catch (e) {
                // Ignore if client is non-admin
              }
            }
          }
        }
      } catch (error) {
        console.error('Error seeding database:', error);
      }
    };

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubscribeUser) {
        unsubscribeUser();
        unsubscribeUser = null;
      }

      if (firebaseUser) {
        // Seed if admin
        seedDatabase(firebaseUser.email || '', firebaseUser.uid);

        const userDocRef = doc(db, 'users', firebaseUser.uid);
        
        // Listen for user changes (balance, etc.)
        unsubscribeUser = onSnapshot(userDocRef, async (userDoc) => {
          if (userDoc.exists()) {
            const data = userDoc.data() as any;
            
            // Migration check: if user doesn't have the new wallet structure
            if (!data.wallet) {
              console.log("Migrating user wallet structure...");
              const migratedWallet = {
                deposit: data.walletBalance || 0,
                winnings: data.winnings || 0,
                bonus: data.bonus || 0
              };
              
              // Only migrate if we have some old data, otherwise use defaults
              if (data.walletBalance === undefined && data.winnings === undefined && data.bonus === undefined) {
                Object.assign(migratedWallet, { deposit: 0, winnings: 0, bonus: 0 });
              }

              const batch = writeBatch(db);
              batch.update(userDocRef, {
                wallet: migratedWallet
              });
              await batch.commit();
              // The next snapshot will have the right data
              return;
            }

            const currentEmail = (firebaseUser.email || data.email || '').toLowerCase().trim();
            const adminEmails = [
              'qupagaming@gmail.com',
              'mahendrathakur9009@gmail.com',
              'mahendrar9009@gmail.com',
              'ankushsharma3948@gmail.com'
            ];
            const isUserAdmin = Boolean(
              data.isAdmin ||
              adminEmails.includes(currentEmail) ||
              firebaseUser.uid === 'XoXyXcnrlzOaMIKKolXnU3mT9xn1'
            );

            // Persist isAdmin: true to Firestore user document if missing
            if (isUserAdmin && !data.isAdmin) {
              updateDoc(userDocRef, { isAdmin: true }).catch((err) => {
                console.warn('Could not auto-update isAdmin flag in user doc:', err);
              });
            }

            const updatedUser = { id: userDoc.id, ...data, isAdmin: isUserAdmin } as User;
            setUser(updatedUser);
            setIsLoggedIn(true);
            setLoading(false);
            try {
              localStorage.setItem('smart_battle_cached_user', JSON.stringify(updatedUser));
            } catch {
              // Ignore storage exceptions
            }

            // Process referral rewards if eligible
            if (data.referredBy && !data.referralClaimed) {
              processReferralReward(data, firebaseUser.uid);
            }
            
            // Immediate redirect to home if on login/signup pages
            const currentPath = window.location.pathname;
            if (currentPath === '/login' || currentPath === '/signup' || currentPath === '/') {
              console.log("Redirecting to home...");
              navigate('/home', { replace: true });
            }
          } else {
            // For Google Auth or unexpected cases, create default profile
            const isAdmin = firebaseUser.email === 'mahendrathakur9009@gmail.com' || 
                           firebaseUser.email === 'mahendrar9009@gmail.com' || 
                           firebaseUser.email === 'qupagaming@gmail.com' ||
                           firebaseUser.email === 'ankushsharma3948@gmail.com' ||
                           firebaseUser.uid === 'XoXyXcnrlzOaMIKKolXnU3mT9xn1';
            const newUser: User = {
              username: firebaseUser.displayName || `Gamer_${firebaseUser.uid.slice(0, 5)}`,
              email: firebaseUser.email || `gamer_${firebaseUser.uid.slice(0, 6)}@smartbattle.com`,
              phone: firebaseUser.phoneNumber || '',
              ...DEFAULT_USER_DATA,
              isAdmin: isAdmin
            };
            await setDoc(userDocRef, {
              ...newUser,
              createdAt: serverTimestamp(),
            });
            // Snapshot will pick this up
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
          // If cached user exists for this session, keep user authenticated
          try {
            const cached = localStorage.getItem('smart_battle_cached_user');
            if (cached) {
              const parsed = JSON.parse(cached);
              if (parsed && parsed.id === firebaseUser.uid) {
                setUser(parsed);
                setIsLoggedIn(true);
              }
            }
          } catch {}
          setLoading(false);
        });

        // Also fetch registrations
        try {
          const q = query(collection(db, 'registrations'), where('userId', '==', firebaseUser.uid));
          const regSnap = await getDocs(q);
          const matchIds = regSnap.docs.map(doc => doc.data().tournamentId);
          setJoinedMatchIds(matchIds);
        } catch (error) {
          console.error("Error fetching registrations:", error);
        }
      } else {
        setIsLoggedIn(false);
        setUser(null);
        setJoinedMatchIds([]);
        try {
          localStorage.removeItem('smart_battle_cached_user');
        } catch {}
        const currentPath = window.location.pathname;
        if (!['/login', '/signup'].includes(currentPath)) {
          navigate('/login', { replace: true });
        }
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUser) unsubscribeUser();
    };
  }, []);

  const handleLogin = () => {
    console.log("Redirecting to home...");
    navigate('/home', { replace: true });
  };

  const handleLogout = async () => {
    try {
      localStorage.removeItem('smart_battle_cached_user');
      await auth.signOut();
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      setIsLoggedIn(false);
      setUser(null);
      navigate('/login', { replace: true });
    }
  };

  const handlePageChange = (page: Page, id?: string) => {
    let path = pageToPath[page];
    if (id) {
      if (page === Page.TOURNAMENTS) path = `${path}/${id}`;
      else if (page === Page.JOIN_MATCH) path = `${path}/${id}`;
      else if (page === Page.MATCH_DETAILS) path = `${path}/${id}`;
      else if (page === Page.ADMIN_USER_PROFILE) path = `${path}/${id}`;
      else if (page === Page.ADMIN_EDIT_MATCH) path = `${path}/${id}`;
      else if (page === Page.ADMIN_CREATE_MATCH) path = `${path}/${id}`;
      else if (page === Page.GAME_MODES) path = `${path}/${id}`;
    }
    navigate(path);
  };

  const handleJoinSuccess = (matchId: string) => {
    setJoinedMatchIds(prev => [...prev, matchId]);
  };

  const processReferralReward = async (currentUser: any, uid: string) => {
    if (!currentUser.referredBy || currentUser.referralClaimed || isProcessingReferralRef.current) return;
    isProcessingReferralRef.current = true;

    console.log("Checking referral reward for user:", currentUser.username);
    try {
      const settingsSnap = await getDoc(doc(db, 'appSettings', 'referral_support'));
      if (!settingsSnap.exists()) return;
      const settings = settingsSnap.data();
      const refSettings = settings.referral;
      if (!refSettings) return;

      // Find referrer by username
      const q = query(collection(db, 'users'), where('username', '==', currentUser.referredBy));
      const referrerSnap = await getDocs(q);
      if (referrerSnap.empty) {
        console.log("Referrer not found:", currentUser.referredBy);
        // Mark as claimed to stop checking
        await updateDoc(doc(db, 'users', uid), { referralClaimed: true });
        return;
      }

      // Device check: Are there other users with this deviceId who already claimed?
      const qDevice = query(collection(db, 'users'), where('deviceId', '==', currentUser.deviceId || 'unknown'), where('referralClaimed', '==', true));
      const deviceSnap = await getDocs(qDevice);
      if (!deviceSnap.empty) {
        console.warn("Fraud alert: Device already used for referral reward");
        await updateDoc(doc(db, 'users', uid), { referralClaimed: true });
        return;
      }
      
      const referrerDoc = referrerSnap.docs[0];
      const referrerId = referrerDoc.id;

      // Reward Referrer
      const refReward = refSettings.perReferralReward || 0;
      if (refReward > 0) {
        const referrerUpdate: any = {};
        if (refSettings.rewardType === 'deposit') {
          referrerUpdate['wallet.deposit'] = increment(refReward);
        } else if (refSettings.rewardType === 'bonus') {
          referrerUpdate['wallet.bonus'] = increment(refReward);
        } else if (refSettings.rewardType === 'both') {
          const depPercentage = refSettings.depositPercentage || 50;
          const depAmount = (refReward * depPercentage) / 100;
          const bonusAmount = refReward - depAmount;
          referrerUpdate['wallet.deposit'] = increment(depAmount);
          referrerUpdate['wallet.bonus'] = increment(bonusAmount);
        }
        
        const batch = writeBatch(db);
        batch.update(doc(db, 'users', referrerId), referrerUpdate);
        
        // Referrer Transaction
        batch.set(doc(collection(db, 'transactions')), {
          userId: referrerId,
          type: 'bonus',
          amount: refReward,
          status: 'completed',
          title: `Referral Reward: ${currentUser.username}`,
          createdAt: serverTimestamp()
        });

        // 2. Reward New User
        const newUserReward = refSettings.newUserReward || 0;
        if (newUserReward > 0) {
          batch.update(doc(db, 'users', uid), {
            'wallet.bonus': increment(newUserReward),
            referralClaimed: true
          });
          
          batch.set(doc(collection(db, 'transactions')), {
            userId: uid,
            type: 'bonus',
            amount: newUserReward,
            status: 'completed',
            title: `Referral Bonus (from ${currentUser.referredBy})`,
            createdAt: serverTimestamp()
          });
        } else {
          batch.update(doc(db, 'users', uid), { referralClaimed: true });
        }

        await batch.commit();
        console.log("Referral rewards processed successfully");
      }
    } catch (err) {
      console.error("Error processing referral reward:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07152b] flex flex-col items-center justify-center p-6 text-white select-none">
        <div className="relative mb-5">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-b from-[#162238] to-[#0a1220] p-2 border border-cyan-500/30 shadow-xl shadow-cyan-500/10 flex items-center justify-center overflow-hidden animate-pulse">
            <img 
              src="/logo.png" 
              onError={(e) => { e.currentTarget.src = '/logo.svg'; }}
              alt="SMART BATTLE Logo" 
              className="w-full h-full object-contain"
            />
          </div>
          <div className="absolute -inset-1 rounded-3xl bg-cyan-500/20 blur-md -z-10 animate-pulse" />
        </div>
        <h2 className="text-base sm:text-lg font-black tracking-wider uppercase bg-gradient-to-r from-white via-cyan-200 to-blue-400 bg-clip-text text-transparent">
          SMART BATTLE
        </h2>
        <div className="flex items-center gap-2 mt-4">
          <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">
            Restoring Session...
          </p>
        </div>
      </div>
    );
  }

  // Derive currentPage for components that still need it
  const currentPath = location.pathname;
  let currentPage = Page.HOME;
  for (const [path, page] of Object.entries(pathToPage)) {
    if (currentPath.startsWith(path)) {
      currentPage = page;
      break;
    }
  }

  // Protected route wrapper
  const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    if (!isLoggedIn && !loading) {
      return <Navigate to="/login" replace />;
    }
    if (!user && isLoggedIn) {
      return (
        <div className="flex flex-col items-center justify-center pt-24">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-neutral-500">Loading profile...</p>
        </div>
      );
    }
    return <>{children}</>;
  };

  // Pages that display header/nav
  const showChrome = isLoggedIn && !['/login', '/signup'].includes(location.pathname);
  const showHeader = showChrome && !['/home', '/tournaments', '/match/', '/match-details/', '/wallet/add', '/wallet/withdraw', '/admin', '/referral', '/profile/details', '/profile/stats', '/game-modes', '/profile'].some(p => location.pathname.startsWith(p));
  const showNav = showChrome && !['/match/', '/match-details/', '/admin/match/'].some(p => location.pathname.startsWith(p));

  return (
    <div className="min-h-screen bg-background relative selection:bg-primary/20">
      <ScrollToTop />
      {user?.isBanned && (
        <div className="bg-red-600 text-white px-4 py-3 text-center text-[11px] font-black uppercase tracking-wider sticky top-0 z-50 flex items-center justify-center gap-2 shadow-xl backdrop-blur-md border-b border-red-700">
          <span>⚠️ ACCOUNT RESTRICTED: {user.banReason ? `Reason: ${user.banReason}` : 'Account suspended for rule violations'}. Match joining and wallet withdrawals are disabled.</span>
        </div>
      )}
      <GlobalNotificationListener 
        user={user} 
        joinedMatchIds={joinedMatchIds} 
        onPageChange={handlePageChange} 
      />
      {showHeader && <Header user={user!} onPageChange={handlePageChange} />}
      
      <main className="mx-auto max-w-lg min-h-screen bg-background overflow-x-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname.split('/')[1]} // Transition based on base path
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
            className="w-full"
          >
            <Routes location={location}>
              <Route path="/" element={<Navigate to="/home" replace />} />
              <Route path="/login" element={isLoggedIn ? <Navigate to="/home" replace /> : <Auth onLogin={handleLogin} />} />
              <Route path="/signup" element={isLoggedIn ? <Navigate to="/home" replace /> : <Auth onLogin={handleLogin} />} />
              
              <Route path="/home" element={
                <ProtectedRoute>
                  <Home user={user} onPageChange={handlePageChange} joinedMatchIds={joinedMatchIds} />
                </ProtectedRoute>
              } />

              <Route path="/game-modes/:gameId" element={
                <ProtectedRoute>
                  <GameModes onPageChange={handlePageChange} />
                </ProtectedRoute>
              } />
              
              <Route path="/tournaments" element={
                <ProtectedRoute>
                  <Tournaments onPageChange={handlePageChange} joinedMatchIds={joinedMatchIds} />
                </ProtectedRoute>
              } />
              
              <Route path="/tournaments/:gameId" element={
                <ProtectedRoute>
                  <Tournaments onPageChange={handlePageChange} joinedMatchIds={joinedMatchIds} />
                </ProtectedRoute>
              } />

              <Route path="/match-details/:id" element={
                <ProtectedRoute>
                  <MatchDetails 
                    user={user!}
                    onPageChange={handlePageChange} 
                    joinedMatchIds={joinedMatchIds}
                  />
                </ProtectedRoute>
              } />

              <Route path="/match/:id" element={
                <ProtectedRoute>
                  <JoinMatch 
                    user={user!}
                    onPageChange={handlePageChange} 
                    joinedMatchIds={joinedMatchIds}
                    onJoinSuccess={handleJoinSuccess}
                  />
                </ProtectedRoute>
              } />

              <Route path="/wallet" element={
                <ProtectedRoute>
                  <WalletPage user={user} onPageChange={handlePageChange} />
                </ProtectedRoute>
              } />

              <Route path="/wallet/add" element={
                <ProtectedRoute>
                  <AddMoney onPageChange={handlePageChange} />
                </ProtectedRoute>
              } />

              <Route path="/wallet/withdraw" element={
                <ProtectedRoute>
                  <Withdraw user={user} onPageChange={handlePageChange} />
                </ProtectedRoute>
              } />

              <Route path="/profile" element={
                <ProtectedRoute>
                  <ProfilePage user={user} onPageChange={handlePageChange} onLogout={handleLogout} />
                </ProtectedRoute>
              } />

              <Route path="/profile/details" element={
                <ProtectedRoute>
                  <ProfileDetails user={user!} onPageChange={handlePageChange} />
                </ProtectedRoute>
              } />

              <Route path="/profile/stats" element={
                <ProtectedRoute>
                  <GameStats user={user!} onPageChange={handlePageChange} />
                </ProtectedRoute>
              } />

              <Route path="/referral" element={
                <ProtectedRoute>
                  <ReferralPage user={user!} onPageChange={handlePageChange} />
                </ProtectedRoute>
              } />

              <Route path="/admin" element={
                <ProtectedRoute>
                  <AdminPage onPageChange={handlePageChange} />
                </ProtectedRoute>
              } />

              <Route path="/admin/user/:id" element={
                <ProtectedRoute>
                  <AdminUserDetail onPageChange={handlePageChange} />
                </ProtectedRoute>
              } />

              <Route path="/admin/match/edit/:id" element={
                <ProtectedRoute>
                  <AdminEditMatch onPageChange={handlePageChange} />
                </ProtectedRoute>
              } />

              <Route path="/admin/match/create" element={
                <ProtectedRoute>
                  <AdminCreateMatch onPageChange={handlePageChange} />
                </ProtectedRoute>
              } />

              <Route path="/admin/match/create/:duplicateId" element={
                <ProtectedRoute>
                  <AdminCreateMatch onPageChange={handlePageChange} />
                </ProtectedRoute>
              } />

              <Route path="/admin/modes" element={
                <ProtectedRoute>
                  <AdminModes onPageChange={handlePageChange} />
                </ProtectedRoute>
              } />

              <Route path="/leaderboard" element={
                <ProtectedRoute>
                  <Leaderboard />
                </ProtectedRoute>
              } />

              <Route path="*" element={<Navigate to="/home" replace />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>

      {showNav && (
        <BottomNav 
          currentPage={currentPage} 
          onPageChange={handlePageChange} 
          user={user}
        />
      )}
      
      {/* Global Background Glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-lg h-full pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[-10%] left-[-20%] w-[80%] h-[40%] bg-primary/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-20%] w-[80%] h-[40%] bg-secondary/10 blur-[120px] rounded-full" />
      </div>
    </div>
  );
}
