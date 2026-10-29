import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useParams } from 'react-router-dom';
import { Page, User, Transaction, Wallet, Tournament, HostAssignment } from '../types';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  doc, 
  onSnapshot, 
  updateDoc, 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs,
  serverTimestamp,
  addDoc,
  writeBatch
} from 'firebase/firestore';
import { 
  ChevronLeft, 
  Shield, 
  ShieldAlert, 
  Wallet as WalletIcon, 
  Trophy, 
  History, 
  Plus, 
  Minus, 
  User as UserIcon, 
  Mail, 
  Phone,
  Gamepad2,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  X,
  Swords,
  Clock
} from 'lucide-react';
import { getAllAvailableGameModes, getGameModeTitle, matchBelongsToMode } from '../utils/modeUtils';

interface AdminUserDetailProps {
  onPageChange: (page: Page, id?: string) => void;
}

export default function AdminUserDetail({ onPageChange }: AdminUserDetailProps) {
  const { id: userId } = useParams();
  const [userData, setUserData] = useState<User | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [joinedMatches, setJoinedMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [balanceModal, setBalanceModal] = useState<{ open: boolean; type: 'add' | 'deduct'; walletType: keyof Wallet } | null>(null);

  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  // Host Management State (Game Mode Based)
  const [hostAssignment, setHostAssignment] = useState<HostAssignment | null>(null);
  const [availableMatches, setAvailableMatches] = useState<Tournament[]>([]);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isRemoveConfirmOpen, setIsRemoveConfirmOpen] = useState(false);
  const [selectedModeId, setSelectedModeId] = useState('cs_headshot');
  const [isHostActionLoading, setIsHostActionLoading] = useState(false);
  const [hostFeedback, setHostFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!userId) return;

    // Real-time user data
    const unsubscribeUser = onSnapshot(doc(db, 'users', userId), (doc) => {
      if (doc.exists()) {
        setUserData({ id: doc.id, ...doc.data() } as User);
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${userId}`);
      setLoading(false);
    });

    // Transactions
    const qTransactions = query(
      collection(db, 'transactions'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const unsubscribeTransactions = onSnapshot(qTransactions, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      setTransactions(txs);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'transactions'));

    // Realtime Host Assignment
    const unsubscribeHost = onSnapshot(doc(db, 'hosts', userId), (docSnap) => {
      if (docSnap.exists() && docSnap.data().assignmentStatus === 'active') {
        setHostAssignment({ id: docSnap.id, ...docSnap.data() } as HostAssignment);
      } else {
        setHostAssignment(null);
      }
    });

    // Joined Matches
    const fetchMatches = async () => {
      try {
        const qReg = query(collection(db, 'registrations'), where('userId', '==', userId));
        const regSnap = await getDocs(qReg);
        const matchIds = regSnap.docs.map(d => d.data().tournamentId);
        
        if (matchIds.length > 0) {
          // Use documentId() 'in' for better performance (limit 30)
          const qMatches = query(
            collection(db, 'matches'), 
            where('__name__', 'in', matchIds.slice(0, 30))
          );
          const matchSnap = await getDocs(qMatches);
          const matches = matchSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          setJoinedMatches(matches);
        }
      } catch (error) {
        console.error("Error fetching matches:", error);
      }
    };

    // Fetch Eligible Active/Upcoming Matches for Host Assignment
    const fetchAvailableMatches = async () => {
      try {
        const matchSnap = await getDocs(collection(db, 'matches'));
        const matches = matchSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as Tournament))
          .filter(m => m.status !== 'completed');
        setAvailableMatches(matches);
      } catch (err) {
        console.error("Error fetching available matches:", err);
      }
    };

    fetchMatches();
    fetchAvailableMatches();

    return () => {
      unsubscribeUser();
      unsubscribeTransactions();
      unsubscribeHost();
    };
  }, [userId]);

  const handleToggleBan = async () => {
    if (!userData || !userId) return;
    const newBanStatus = !userData.isBanned;
    if (confirm(`Are you sure you want to ${newBanStatus ? 'BAN' : 'UNBAN'} this player account?`)) {
      try {
        await updateDoc(doc(db, 'users', userId), {
          isBanned: newBanStatus
        });
        setHostFeedback({
          type: 'success',
          message: `Player has been successfully ${newBanStatus ? 'BANNED' : 'UNBANNED'}.`
        });
        setTimeout(() => setHostFeedback(null), 4000);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
      }
    }
  };

  // Host Action: Make Host (Game Mode Based)
  const handleAssignHost = async () => {
    if (!userId || !selectedModeId || isHostActionLoading) return;

    setIsHostActionLoading(true);
    setHostFeedback(null);
    const modeTitle = getGameModeTitle(selectedModeId);

    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/assign-host', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          hostUserId: userId,
          modeId: selectedModeId,
          modeTitle
        })
      });

      const data = await res.json();
      if (data.success) {
        setHostFeedback({
          type: 'success',
          message: data.message || `Player successfully designated as official Host for ${modeTitle}!`
        });
        setIsAssignModalOpen(false);
      } else {
        setHostFeedback({
          type: 'error',
          message: data.error || 'Failed to assign host'
        });
      }
    } catch (err: any) {
      setHostFeedback({
        type: 'error',
        message: err.message || 'Network error while assigning host'
      });
    } finally {
      setIsHostActionLoading(false);
      setTimeout(() => setHostFeedback(null), 5000);
    }
  };

  // Host Action: Remove Host
  const handleRemoveHost = async () => {
    if (!userId || isHostActionLoading) return;

    setIsHostActionLoading(true);
    setHostFeedback(null);

    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/remove-host', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          hostUserId: userId
        })
      });

      const data = await res.json();
      if (data.success) {
        setHostFeedback({
          type: 'success',
          message: 'Host privileges have been revoked.'
        });
        setIsRemoveConfirmOpen(false);
      } else {
        setHostFeedback({
          type: 'error',
          message: data.error || 'Failed to remove host'
        });
      }
    } catch (err: any) {
      setHostFeedback({
        type: 'error',
        message: err.message || 'Network error while removing host'
      });
    } finally {
      setIsHostActionLoading(false);
      setTimeout(() => setHostFeedback(null), 5000);
    }
  };

  const handleUpdateBalance = async () => {
    if (!userData || !userId || !balanceModal || !amount) return;
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) return;

    try {
      const batch = writeBatch(db);
      const userRef = doc(db, 'users', userId);
      const newBalance = balanceModal.type === 'add' 
        ? userData.wallet[balanceModal.walletType] + numAmount 
        : Math.max(0, userData.wallet[balanceModal.walletType] - numAmount);

      batch.update(userRef, {
        [`wallet.${balanceModal.walletType}`]: newBalance
      });

      // Add transaction record
      const txRef = doc(collection(db, 'transactions'));
      batch.set(txRef, {
        userId,
        type: balanceModal.type === 'add' ? 'deposit' : 'withdraw',
        amount: numAmount,
        status: 'completed',
        title: reason || `Admin ${balanceModal.type} balance (${balanceModal.walletType})`,
        createdAt: serverTimestamp()
      });

      await batch.commit();
      setBalanceModal(null);
      setAmount('');
      setReason('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  if (loading) {
    return (
      <div className="pt-24 flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="pt-24 px-4 text-center">
        <p className="text-neutral-500">User not found</p>
        <button onClick={() => onPageChange(Page.ADMIN)} className="mt-4 text-primary text-xs font-black uppercase">Go Back</button>
      </div>
    );
  }

  return (
    <div className="pt-6 pb-24 px-4">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button 
          onClick={() => onPageChange(Page.ADMIN)}
          className="p-2 bg-neutral-900 rounded-xl text-neutral-400 hover:text-white transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-black text-white italic">User Profile</h1>
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Management Panel</p>
        </div>
      </div>

      {/* User Info Card */}
      <div className="bg-neutral-900/50 border border-neutral-800/50 rounded-3xl p-6 mb-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-2xl flex items-center justify-center border border-white/5">
              <UserIcon size={32} className="text-white/50" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white italic">{userData.username}</h2>
              <p className="text-xs text-neutral-500 font-medium">ID: {userId}</p>
              {userData.isBanned && (
                <span className="inline-block mt-2 px-2 py-0.5 bg-red-500/10 text-red-500 text-[8px] font-black uppercase tracking-widest rounded-full border border-red-500/20">
                  Banned
                </span>
              )}
            </div>
          </div>
          <button 
            onClick={handleToggleBan}
            className={`p-3 rounded-2xl border transition-all ${
              userData.isBanned 
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/20' 
                : 'bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500/20'
            }`}
          >
            {userData.isBanned ? <Shield size={20} /> : <ShieldAlert size={20} />}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 mb-5">
          <div className="flex items-center gap-3 p-3 bg-white/5 rounded-2xl border border-white/5">
            <Mail size={16} className="text-neutral-500" />
            <div className="flex-1 min-w-0">
              <p className="text-[8px] font-black uppercase text-neutral-500 tracking-widest">Email Address</p>
              <p className="text-sm font-medium text-white truncate">{userData.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-white/5 rounded-2xl border border-white/5">
            <Phone size={16} className="text-neutral-500" />
            <div>
              <p className="text-[8px] font-black uppercase text-neutral-500 tracking-widest">Phone Number</p>
              <p className="text-sm font-medium text-white">{userData.phone || 'Not provided'}</p>
            </div>
          </div>
        </div>

        {/* Feedback Alert Banner */}
        {hostFeedback && (
          <div className={`p-3.5 mb-5 rounded-2xl border flex items-center gap-2.5 text-xs font-bold ${
            hostFeedback.type === 'success' 
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}>
            {hostFeedback.type === 'success' ? <CheckCircle2 size={16} className="shrink-0" /> : <AlertCircle size={16} className="shrink-0" />}
            <span>{hostFeedback.message}</span>
          </div>
        )}

        {/* TASK 1: ADMINISTRATIVE ACTIONS - BAN PLAYER & MAKE/REMOVE HOST */}
        <div className="pt-4 border-t border-white/10">
          <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400 mb-3">
            Administrative Player Controls
          </p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {/* Action 1: Ban / Unban Player */}
            <button
              onClick={handleToggleBan}
              className={`py-3.5 px-4 rounded-2xl border text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 ${
                userData.isBanned
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                  : 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
              }`}
            >
              {userData.isBanned ? <Shield size={16} /> : <ShieldAlert size={16} />}
              {userData.isBanned ? 'Unban Player' : 'Ban Player'}
            </button>

            {/* Action 2: Make Host / Remove Host */}
            {hostAssignment ? (
              <button
                onClick={() => setIsRemoveConfirmOpen(true)}
                disabled={isHostActionLoading}
                className="py-3.5 px-4 rounded-2xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
              >
                <X size={16} />
                Remove Host
              </button>
            ) : (
              <button
                onClick={() => setIsAssignModalOpen(true)}
                disabled={isHostActionLoading || userData.isBanned}
                title={userData.isBanned ? 'Cannot make a banned player a host' : 'Assign match to host'}
                className="py-3.5 px-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/5"
              >
                <Gamepad2 size={16} />
                Make Host
              </button>
            )}
          </div>

          {/* Hosting Status & Assigned Match Details */}
          <div className="bg-black/50 border border-neutral-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Hosting Status</span>
              {hostAssignment ? (
                <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
                  <CheckCircle2 size={10} /> Active Host
                </span>
              ) : (
                <span className="px-2.5 py-0.5 bg-neutral-800 text-neutral-400 rounded-full text-[9px] font-black uppercase tracking-wider">
                  Standard Player
                </span>
              )}
            </div>

            {hostAssignment ? (
              <div className="space-y-1.5 pt-2 border-t border-neutral-800/80">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-neutral-400">Assigned Mode:</span>
                  <span className="font-black text-emerald-400 italic">
                    {hostAssignment.modeTitle || hostAssignment.modeId || hostAssignment.matchTitle || 'Active Mode'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-neutral-400">Mode ID:</span>
                  <span className="text-neutral-300 font-bold">{hostAssignment.modeId || hostAssignment.matchId}</span>
                </div>
                {hostAssignment.assignedByAdminEmail && (
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-neutral-500">Assigned By:</span>
                    <span className="text-neutral-300">{hostAssignment.assignedByAdminEmail}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-neutral-500 mt-1">
                This player is not currently assigned to host any game mode.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Wallet Breakdown */}
      <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-4 ml-2">Wallet Breakdown</h3>
      <div className="grid grid-cols-1 gap-3 mb-8">
        {(['deposit', 'winnings', 'bonus'] as (keyof Wallet)[]).map((type) => (
          <div key={type} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-white/5 rounded-xl text-neutral-400">
                <WalletIcon size={18} />
              </div>
              <div>
                <p className="text-[8px] font-black uppercase text-neutral-500 tracking-widest">{type}</p>
                <p className="text-base font-black text-white italic">₹{(userData.wallet?.[type] || 0).toLocaleString()}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => setBalanceModal({ open: true, type: 'deduct', walletType: type })}
                className="p-2 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500/20 transition-colors"
                title={`Deduct from ${type}`}
              >
                <Minus size={18} />
              </button>
              <button 
                onClick={() => setBalanceModal({ open: true, type: 'add', walletType: type })}
                className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl hover:bg-emerald-500/20 transition-colors"
                title={`Add to ${type}`}
              >
                <Plus size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Stats & Matches */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5">
           <Trophy size={20} className="text-amber-500 mb-3" />
           <p className="text-[8px] font-black uppercase text-neutral-500 tracking-widest mb-1">Matches Played</p>
           <p className="text-2xl font-black text-white italic">{userData.stats.matchesPlayed}</p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5">
           <History size={20} className="text-primary mb-3" />
           <p className="text-[8px] font-black uppercase text-neutral-500 tracking-widest mb-1">Recent Matches</p>
           <p className="text-2xl font-black text-white italic">{joinedMatches.length}</p>
        </div>
      </div>

      {/* Joined Matches List */}
      <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-4 ml-2">Recent Joined Matches</h3>
      <div className="space-y-3 mb-8">
        {joinedMatches.length > 0 ? (
          joinedMatches.map((match) => (
            <div key={match.id} className="bg-neutral-900/50 border border-neutral-800/50 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-primary uppercase italic mb-1">{match.section}</p>
                <h4 className="text-sm font-black text-white italic">{match.title}</h4>
                <p className="text-[10px] text-neutral-500">{match.time}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-black text-white italic">₹{match.entryFee}</p>
                <span className={`text-[8px] font-black uppercase tracking-widest ${match.status === 'completed' ? 'text-emerald-500' : 'text-amber-500'}`}>
                  {match.status || 'Active'}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-neutral-900/50 border border-dashed border-neutral-800 rounded-2xl p-8 text-center">
            <p className="text-xs text-neutral-500">No matches joined yet</p>
          </div>
        )}
      </div>

      {/* Transactions History */}
      <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-4 ml-2">Transaction History</h3>
      <div className="space-y-3">
        {transactions.map((tx) => (
          <div key={tx.id} className="bg-neutral-900/50 border border-neutral-800/50 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${
                tx.type === 'deposit' || tx.type === 'win' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
              }`}>
                {tx.type === 'deposit' || tx.type === 'win' ? <Plus size={14} /> : <Minus size={14} />}
              </div>
              <div>
                <h4 className="text-xs font-black text-white italic">{tx.title || tx.type.toUpperCase()}</h4>
                <p className="text-[8px] font-black uppercase text-neutral-500 tracking-widest">
                  {tx.createdAt?.toDate ? tx.createdAt.toDate().toLocaleString() : 'Recent'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-sm font-black italic ${
                tx.type === 'deposit' || tx.type === 'win' ? 'text-emerald-500' : 'text-red-500'
              }`}>
                {tx.type === 'deposit' || tx.type === 'win' ? '+' : '-'}₹{tx.amount}
              </p>
              <p className={`text-[8px] font-black uppercase tracking-widest ${
                tx.status === 'completed' ? 'text-emerald-500' : 'text-amber-500'
              }`}>
                {tx.status}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Balance Modal */}
      {balanceModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setBalanceModal(null)}
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-[2.5rem] p-8 shadow-2xl"
          >
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border ${
              balanceModal.type === 'add' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-red-500/10 border-red-500/20 text-red-500'
            }`}>
              {balanceModal.type === 'add' ? <Plus size={32} /> : <Minus size={32} />}
            </div>
            
            <h2 className="text-2xl font-black text-white italic mb-2">
              {balanceModal.type === 'add' ? 'Add' : 'Deduct'} Balance
            </h2>
            <p className="text-xs text-neutral-500 font-medium mb-8">
              Adjusting <span className="text-white font-black uppercase italic">{balanceModal.walletType}</span> for {userData.username}
            </p>

            <div className="space-y-4 mb-8">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500 ml-1">Amount (₹)</label>
                <input 
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-2xl px-5 py-3.5 text-white font-medium placeholder:text-neutral-700 focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500 ml-1">Reason (Optional)</label>
                <input 
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Winning Prize"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-2xl px-5 py-3.5 text-white font-medium placeholder:text-neutral-700 focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => setBalanceModal(null)}
                className="flex-1 px-4 py-4 bg-neutral-800 text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-neutral-700 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleUpdateBalance}
                disabled={!amount}
                className={`flex-1 px-4 py-4 text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-all disabled:opacity-50 ${
                  balanceModal.type === 'add' ? 'bg-emerald-600 shadow-[0_8px_20px_-6px_rgba(16,185,129,0.4)]' : 'bg-red-600 shadow-[0_8px_20px_-6px_rgba(220,38,38,0.4)]'
                }`}
              >
                Confirm
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* TASK 2: MAKE HOST ASSIGNMENT MODAL */}
      <AnimatePresence>
        {isAssignModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isHostActionLoading && setIsAssignModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-[2.5rem] p-7 shadow-2xl z-10"
            >
              <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mb-5">
                <Gamepad2 size={28} />
              </div>

              <h2 className="text-xl font-black text-white italic mb-1">Make Game Mode Host</h2>
              <p className="text-xs text-neutral-400 mb-6">
                Assign <span className="text-emerald-400 font-bold">{userData.username}</span> (ID: <span className="font-mono text-neutral-300">{userId}</span>) to manage matches for an official game mode.
              </p>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">
                    Select Canonical Game Mode
                  </label>
                  <select
                    value={selectedModeId}
                    onChange={(e) => setSelectedModeId(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-2xl px-4 py-3.5 text-xs text-white font-medium focus:outline-none focus:border-emerald-500"
                  >
                    {getAllAvailableGameModes().map((m) => (
                      <option key={m.id} value={m.id} className="bg-neutral-900 text-white">
                        {m.title} ({m.category} • ID: {m.id})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Selected Mode Details Preview */}
                {(() => {
                  const sel = getAllAvailableGameModes().find(m => m.id === selectedModeId);
                  const matchingCount = availableMatches.filter(m => matchBelongsToMode(m, selectedModeId, sel?.title)).length;
                  return (
                    <div className="bg-neutral-950/80 border border-neutral-800 rounded-2xl p-4 text-xs space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-neutral-500">Selected Mode:</span>
                        <span className="text-emerald-400 font-black italic">{sel?.title || selectedModeId}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-neutral-500">Category:</span>
                        <span className="text-white uppercase font-black text-[10px]">{sel?.category || 'Custom'}</span>
                      </div>
                      <div className="flex justify-between items-center font-mono text-[11px]">
                        <span className="text-neutral-500">Mode ID:</span>
                        <span className="text-neutral-300">{selectedModeId}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-neutral-500">Active Matches in Mode:</span>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {matchingCount} matches ready
                        </span>
                      </div>
                      <p className="text-[10px] text-neutral-400 pt-1 border-t border-neutral-800/80">
                        Host will be authorized to update room details and submit scorecards for all matches in this mode.
                      </p>
                    </div>
                  );
                })()}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  disabled={isHostActionLoading}
                  className="flex-1 py-3.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-black uppercase tracking-wider rounded-2xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAssignHost}
                  disabled={isHostActionLoading}
                  className="flex-1 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black uppercase tracking-wider rounded-2xl shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isHostActionLoading ? (
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  ) : (
                    'Confirm Mode Host'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* TASK 6: REMOVE HOST CONFIRMATION MODAL */}
      <AnimatePresence>
        {isRemoveConfirmOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isHostActionLoading && setIsRemoveConfirmOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-[2.5rem] p-7 shadow-2xl z-10 text-center"
            >
              <div className="w-14 h-14 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <ShieldAlert size={28} />
              </div>

              <h2 className="text-xl font-black text-white italic mb-2">Revoke Host Privileges?</h2>
              <p className="text-xs text-neutral-400 mb-6 leading-relaxed">
                Are you sure you want to remove host status from <span className="text-white font-bold">{userData.username}</span> for game mode <span className="text-emerald-400 font-bold">"{hostAssignment?.modeTitle || hostAssignment?.modeId || hostAssignment?.matchTitle}"</span>? They will immediately lose mode match management access.
              </p>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsRemoveConfirmOpen(false)}
                  disabled={isHostActionLoading}
                  className="flex-1 py-3.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-black uppercase tracking-wider rounded-2xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRemoveHost}
                  disabled={isHostActionLoading}
                  className="flex-1 py-3.5 bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase tracking-wider rounded-2xl shadow-lg shadow-red-600/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isHostActionLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    'Confirm & Revoke'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
