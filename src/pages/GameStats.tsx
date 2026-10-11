import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Trophy, Target, Sword, TrendingUp, History, Gamepad2, Loader2, IndianRupee } from 'lucide-react';
import { Page, User, Tournament } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, orderBy, limit } from 'firebase/firestore';

interface GameStatsProps {
  user: User;
  onPageChange: (page: Page) => void;
}

export default function GameStats({ user, onPageChange }: GameStatsProps) {
  const [history, setHistory] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!user.id) {
        setLoading(false);
        return;
      }
      try {
        // Fetch participant records for this user
        const q = query(
          collection(db, 'registrations'),
          where('userId', '==', user.id),
          orderBy('joinedAt', 'desc'),
          limit(10)
        );
        const snap = await getDocs(q);
        
        const tournamentPromises = snap.docs.map(async (pDoc) => {
          const tData = pDoc.data();
          const tDoc = await getDoc(doc(db, 'matches', tData.tournamentId));
          if (tDoc.exists()) {
            return { id: tDoc.id, ...tDoc.data() } as Tournament;
          }
          // Fallback to searching in tournaments collection if matches fails (legacy support)
          const legacyTDoc = await getDoc(doc(db, 'tournaments', tData.tournamentId));
          return { id: legacyTDoc.id, ...legacyTDoc.data() } as Tournament;
        });

        const tournaments = await Promise.all(tournamentPromises);
        setHistory(tournaments.filter(t => t.title)); // Ensure it's valid data
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, 'registrations');
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [user.id]);

  const stats = user.stats || { matchesPlayed: 0, totalWins: 0, totalKills: 0, totalWinnings: 0 };
  const matchesPlayed = stats.matchesPlayed || 0;
  const totalWins = stats.totalWins || 0;
  const totalKills = stats.totalKills || 0;
  const totalWinnings = stats.totalWinnings || 0;

  const winRate = matchesPlayed > 0 
    ? ((totalWins / matchesPlayed) * 100).toFixed(1) 
    : '0.0';

  return (
    <div className="pb-24 max-w-lg mx-auto bg-background min-h-screen">
      <div className="px-5 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-10">
          <button 
            onClick={() => onPageChange(Page.PROFILE)}
            className="p-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-neutral-500 hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-xl font-bold tracking-tighter uppercase italic text-white leading-none">
              Game <span className="text-purple-500">Statistics</span>
            </h2>
            <p className="text-[8px] font-black uppercase tracking-widest text-neutral-600 mt-1">Warrior's Performance Metrics</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mb-8">
           <StatCard icon={Gamepad2} label="Matches" value={matchesPlayed.toString()} color="text-blue-500" />
           <StatCard icon={Trophy} label="Wins" value={totalWins.toString()} color="text-amber-500" />
           <StatCard icon={Sword} label="Kills" value={totalKills.toString()} color="rose-500" />
           <StatCard icon={TrendingUp} label="Win Rate" value={`${winRate}%`} color="text-emerald-500" />
        </div>

        <div className="p-6 bg-neutral-900/60 border border-neutral-800 rounded-[2rem] mb-8">
           <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-600">Lifetime Earnings</span>
              <IndianRupee size={16} className="text-purple-500" />
           </div>
           <div className="text-3xl font-black italic text-white leading-none">
             ₹{(totalWinnings || 0).toLocaleString()}
           </div>
        </div>

        {/* Match History */}
        <div className="space-y-4">
           <div className="flex items-center gap-3 px-1">
              <History size={16} className="text-purple-500" />
              <h3 className="text-xs font-black uppercase tracking-widest text-neutral-400">Match History</h3>
           </div>

           {loading ? (
             <div className="py-20 flex flex-col items-center justify-center">
                <Loader2 className="text-purple-500 animate-spin mb-4" size={32} />
                <p className="text-[9px] font-black uppercase tracking-widest text-neutral-700 italic">Retreiving battle logs...</p>
             </div>
           ) : history.length === 0 ? (
             <div className="py-12 bg-neutral-950 border border-neutral-900 border-dashed rounded-3xl flex flex-col items-center justify-center text-center px-8">
                <History size={32} className="text-neutral-800 mb-4" />
                <p className="text-[10px] font-black uppercase tracking-widest text-neutral-600 italic">No matches history found</p>
             </div>
           ) : (
             history.map((t, idx) => (
                <div key={t.id + idx} className="p-4 bg-neutral-900 border border-neutral-800 rounded-2xl flex items-center gap-4">
                   <div className="w-12 h-12 bg-black rounded-xl border border-neutral-800 flex items-center justify-center text-neutral-700">
                      <Gamepad2 size={24} />
                   </div>
                   <div className="flex-1">
                      <h4 className="text-[11px] font-black uppercase tracking-tight text-white line-clamp-1">{t.title}</h4>
                      <p className="text-[9px] font-bold text-neutral-600 uppercase tracking-widest mt-1">{t.section} • {t.displayId}</p>
                   </div>
                   <div className="text-right">
                      <span className="text-[10px] font-black text-purple-500">ENTRY</span>
                      <p className="text-[11px] font-bold text-white">₹{t.entryFee}</p>
                   </div>
                </div>
             ))
           )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: any) {
  return (
    <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-3xl relative overflow-hidden group">
       <div className={`absolute top-0 right-0 p-4 ${color} opacity-5 group-hover:opacity-10 transition-opacity`}>
          <Icon size={40} />
       </div>
       <div className={`w-8 h-8 rounded-xl bg-black border border-neutral-800 flex items-center justify-center ${color} mb-4`}>
          <Icon size={14} />
       </div>
       <div className="text-xs font-black uppercase tracking-widest text-neutral-600 mb-1 leading-none">{label}</div>
       <div className="text-xl font-black italic text-white uppercase leading-none">{value}</div>
    </div>
  );
}
