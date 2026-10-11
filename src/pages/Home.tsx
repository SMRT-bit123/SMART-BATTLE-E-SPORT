import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Star, Plus, X, Loader2 } from 'lucide-react';
import { Page, User, Tournament, Banner } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { useModalBackHandler } from '../hooks/useModalBackHandler';

import HomeHeader from '../components/HomeHeader';
import AnnouncementBar from '../components/AnnouncementBar';
import HeroBannerCarousel from '../components/HeroBannerCarousel';
import MyMatches from '../components/MyMatches';
import EsportsGamesGrid from '../components/EsportsGamesGrid';
import RulesModal from '../components/RulesModal';
import NotificationsModal from '../components/NotificationsModal';

interface HomeProps {
  user: User;
  onPageChange: (page: Page, id?: string) => void;
  joinedMatchIds: string[];
}

export default function Home({ user, onPageChange, joinedMatchIds }: HomeProps) {
  const [selectedPrizeMatch, setSelectedPrizeMatch] = useState<Tournament | null>(null);
  const [selectedResultsMatch, setSelectedResultsMatch] = useState<Tournament | null>(null);
  const [selectedRulesMatch, setSelectedRulesMatch] = useState<Tournament | null>(null);
  
  const [isGeneralRulesOpen, setIsGeneralRulesOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  
  // Use custom back button hook for modals
  useModalBackHandler(!!selectedPrizeMatch, () => setSelectedPrizeMatch(null));
  useModalBackHandler(!!selectedResultsMatch, () => setSelectedResultsMatch(null));
  useModalBackHandler(!!selectedRulesMatch || isGeneralRulesOpen, () => {
    setSelectedRulesMatch(null);
    setIsGeneralRulesOpen(false);
  });
  useModalBackHandler(isNotificationsOpen, () => setIsNotificationsOpen(false));
  
  const [matchResults, setMatchResults] = useState<any>(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [matches, setMatches] = useState<Tournament[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [heroBanners, setHeroBanners] = useState<Banner[]>([]);
  const [showIdPass, setShowIdPass] = useState<{ isOpen: boolean; roomId?: string; roomPass?: string }>({ isOpen: false });

  useModalBackHandler(showIdPass.isOpen, () => setShowIdPass({ isOpen: false }));

  const handleCopy = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
  };

  useEffect(() => {
    // Realtime matches subscription
    const q = query(collection(db, 'matches'), orderBy('matchNumber', 'desc'));
    const unsubMatches = onSnapshot(
      q,
      (snapshot) => {
        setMatches(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Tournament)));
        setLoadingMatches(false);
      },
      (err) => {
        console.error('Error fetching matches for home:', err);
        handleFirestoreError(err, OperationType.LIST, 'matches');
        setLoadingMatches(false);
      }
    );

    // Realtime active banners
    const unsubBanners = onSnapshot(
      query(collection(db, 'banners'), where('isActive', '!=', false), orderBy('order', 'asc')),
      (snapshot) => {
        const fetchedBanners = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Banner));
        setBanners(fetchedBanners);
        setHeroBanners(fetchedBanners.filter((b) => b.type === 'main' || b.type === 'offer'));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'banners')
    );

    return () => {
      unsubMatches();
      unsubBanners();
    };
  }, []);

  useEffect(() => {
    if (selectedResultsMatch) {
      setLoadingResults(true);
      const fetchResults = async () => {
        try {
          const { getDocs, query, collection, where } = await import('firebase/firestore');
          const resSnap = await getDocs(
            query(collection(db, 'matchResults'), where('matchId', '==', selectedResultsMatch.id))
          );
          if (!resSnap.empty) {
            setMatchResults(resSnap.docs[0].data());
          } else {
            alert('Results not found for this match.');
            setSelectedResultsMatch(null);
          }
        } catch (error) {
          console.error('Error fetching results:', error);
        } finally {
          setLoadingResults(false);
        }
      };
      fetchResults();
    } else {
      setMatchResults(null);
    }
  }, [selectedResultsMatch]);

  return (
    <div className="pb-28 max-w-lg mx-auto bg-[#07152b] min-h-screen text-white select-none">
      {/* 1. Top Header */}
      <HomeHeader 
        user={user} 
        onPageChange={onPageChange} 
        onOpenNotifications={() => setIsNotificationsOpen(true)}
      />

      {/* 2. Announcement / Rules Bar */}
      <AnnouncementBar
        text="SMART BATTLE — MAIN RULES & TELEGRAM CHANNEL"
        onClick={() => {
          if (matches.length > 0) {
            setSelectedRulesMatch(matches[0]);
          } else {
            setIsGeneralRulesOpen(true);
          }
        }}
      />

      {/* 3. Hero Banner Carousel */}
      <HeroBannerCarousel banners={heroBanners} onPageChange={onPageChange} />

      {/* 4. My Matches (3 Cards: Ongoing, Upcoming, Completed) */}
      <MyMatches
        matches={matches}
        joinedMatchIds={joinedMatchIds}
        onPageChange={onPageChange}
      />

      {/* 5. Esports Games (3-Column Grid with Tournament/Solo toggle) */}
      <EsportsGamesGrid
        matches={matches}
        onPageChange={onPageChange}
      />

      {/* Prize Pool Breakdown Modal */}
      <AnimatePresence>
        {selectedPrizeMatch && (() => {
          const isSurvival = selectedPrizeMatch.prizeType === 'survival';
          const distribution = isSurvival
            ? selectedPrizeMatch.prizeDistribution || {}
            : selectedPrizeMatch.positionPrizeDistribution || {};
          
          const validEntries = Object.entries(distribution)
            .sort(([a], [b]) => Number(a) - Number(b))
            .filter(([_, amount]) => (Number(amount) || 0) > 0);

          const calculatedTotal = validEntries.length > 0
            ? validEntries.reduce((sum, [_, amt]) => sum + (Number(amt) || 0), 0)
            : (selectedPrizeMatch.prizePool || 0);

          const displayTotalPool = calculatedTotal > 0 ? calculatedTotal : (selectedPrizeMatch.prizePool || 0);
          const winnersCount = validEntries.length > 0 
            ? validEntries.length 
            : (selectedPrizeMatch.winnersCount || (isSurvival ? 1 : 0));

          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/90 backdrop-blur-sm"
              onClick={() => setSelectedPrizeMatch(null)}
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="w-full max-w-sm bg-[#0a1226] border border-[#1e3461] rounded-[2.5rem] p-6 shadow-2xl relative overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="absolute top-5 right-5">
                  <button
                    onClick={() => setSelectedPrizeMatch(null)}
                    className="p-2 bg-white/5 text-neutral-400 rounded-xl hover:text-white transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="flex items-center gap-3.5 mb-4">
                  <div className="w-11 h-11 rounded-2xl bg-amber-500/15 flex items-center justify-center text-amber-400 border border-amber-500/30 shrink-0">
                    <Trophy size={22} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-tight text-white">Prize Breakdown</h3>
                    <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest truncate max-w-[200px]">
                      {selectedPrizeMatch.title}
                    </p>
                  </div>
                </div>

                {/* Summary Banner */}
                <div className="bg-[#0e2042] border border-[#1e3c75] rounded-2xl p-3.5 mb-4 grid grid-cols-2 gap-2 text-center">
                  <div className="border-r border-[#1e3c75] pr-2">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 block">
                      Total Prize Pool
                    </span>
                    <span className="text-base font-black text-amber-400 mt-0.5 block">
                      ₹{displayTotalPool}
                    </span>
                  </div>
                  <div className="pl-2 flex flex-col justify-center">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 block">
                      {isSurvival ? 'Per Kill Reward' : 'Per Kill'}
                    </span>
                    <span className="text-base font-black text-emerald-400 mt-0.5 block">
                      {isSurvival ? '₹0' : `₹${selectedPrizeMatch.perKillAmount || 0}`}
                    </span>
                  </div>
                </div>

                {/* Top Winners Tag */}
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-purple-300">
                    {winnersCount > 1 ? `Top ${winnersCount} Players Rewarded` : `Top 1 Winner`}
                  </span>
                  <span className="text-[9px] font-bold text-neutral-400 uppercase">
                    Rank System
                  </span>
                </div>

                {/* Distribution List */}
                <div className="max-h-[40vh] overflow-y-auto no-scrollbar space-y-2 pr-0.5">
                  {validEntries.length > 0 ? (
                    validEntries.map(([pos, amount]) => {
                      const posNum = Number(pos);
                      const isFirst = posNum === 1;
                      const isSecond = posNum === 2;
                      const isThird = posNum === 3;
                      
                      const rankTitle = isFirst 
                        ? '1st Place (Winner)' 
                        : isSecond 
                        ? '2nd Place' 
                        : isThird 
                        ? '3rd Place' 
                        : `Rank #${posNum}`;

                      return (
                        <div
                          key={pos}
                          className={`flex items-center justify-between p-3 rounded-2xl border ${
                            isFirst
                              ? 'bg-amber-500/10 border-amber-500/30'
                              : 'bg-[#0f1d3b] border-white/5'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`text-[10px] font-black w-8 ${isFirst ? 'text-amber-400' : 'text-neutral-400'}`}>
                              #{pos}
                            </span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-300">
                              {rankTitle}
                            </span>
                          </div>
                          <span className="text-sm font-black text-emerald-400">₹{amount}</span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black text-amber-400 w-8">#1</span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-neutral-300">
                          1st Place (Winner)
                        </span>
                      </div>
                      <span className="text-sm font-black text-emerald-400">₹{displayTotalPool}</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setSelectedPrizeMatch(null)}
                  className="w-full h-11 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all mt-5 shadow-lg shadow-blue-600/30"
                >
                  Close Details
                </button>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Match Results Modal */}
      <AnimatePresence>
        {selectedResultsMatch && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/90 backdrop-blur-sm"
            onClick={() => setSelectedResultsMatch(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-sm bg-[#0a1226] border border-[#1e3461] rounded-[2.5rem] p-7 shadow-2xl relative overflow-hidden flex flex-col max-h-[85vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6 relative">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-400 border border-amber-500/20">
                    <Trophy size={24} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-tight text-white line-clamp-1">
                      {selectedResultsMatch.title}
                    </h3>
                    <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">
                      Match Results View
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedResultsMatch(null)}
                  className="p-2 bg-white/5 text-neutral-400 rounded-xl hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {loadingResults ? (
                <div className="flex-1 flex flex-col items-center justify-center py-20">
                  <Loader2 size={32} className="text-blue-500 animate-spin mb-4" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                    Fetching standings...
                  </p>
                </div>
              ) : matchResults ? (
                <div className="flex-1 overflow-hidden flex flex-col">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="p-3 bg-[#0f1d3b] rounded-2xl border border-white/5">
                      <p className="text-[8px] font-black uppercase text-neutral-400 tracking-widest mb-0.5">
                        Participants
                      </p>
                      <p className="text-sm font-black text-white">{matchResults.results?.length || 0}</p>
                    </div>
                    <div className="p-3 bg-[#0f1d3b] rounded-2xl border border-white/5">
                      <p className="text-[8px] font-black uppercase text-neutral-400 tracking-widest mb-0.5">
                        Total Distributed
                      </p>
                      <p className="text-sm font-black text-emerald-400">
                        ₹{((matchResults.results || []).reduce((sum: number, r: any) => sum + (r.winningAmount || 0), 0) || 0).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto no-scrollbar space-y-2.5 pr-1">
                    {matchResults.results
                      ?.sort((a: any, b: any) => {
                        const isSurvival =
                          matchResults.prizeType === 'survival' || matchResults.section !== 'Battle Royale';
                        if (isSurvival) return a.rankOrKills - b.rankOrKills;
                        return b.rankOrKills - a.rankOrKills;
                      })
                      .map((res: any, idx: number) => {
                        const isWinner =
                          res.rankOrKills === 1 &&
                          (matchResults.prizeType === 'survival' || matchResults.section !== 'Battle Royale');

                        return (
                          <div
                            key={`${res.userId}_${res.slot || idx}`}
                            className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                              isWinner
                                ? 'bg-amber-500/10 border-amber-500/30'
                                : 'bg-[#0f1d3b] border-white/5'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black border ${
                                  isWinner
                                    ? 'bg-amber-500 text-black border-amber-400'
                                    : 'bg-white/5 text-neutral-400 border-white/10'
                                }`}
                              >
                                {matchResults.prizeType === 'perKill' ? 'K' : `#${res.rankOrKills}`}
                              </div>
                              <div>
                                <h4 className={`text-xs font-bold ${isWinner ? 'text-amber-400' : 'text-white'}`}>
                                  {res.ign || res.username}
                                </h4>
                                {matchResults.prizeType === 'perKill' && (
                                  <p className="text-[8px] font-black uppercase text-neutral-400 tracking-widest">
                                    {res.rankOrKills} Kills
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <p
                                className={`text-sm font-black ${
                                  res.winningAmount > 0 ? 'text-emerald-400' : 'text-neutral-500'
                                }`}
                              >
                                {res.winningAmount > 0 ? `+₹${res.winningAmount}` : '₹0'}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center py-20">
                  <p className="text-xs text-neutral-400">Results pending declaration</p>
                </div>
              )}

              <button
                onClick={() => setSelectedResultsMatch(null)}
                className="mt-6 w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-blue-600/30"
              >
                Close Results
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ID Pass Modal */}
      <AnimatePresence>
        {showIdPass.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/90 backdrop-blur-md"
            onClick={() => setShowIdPass({ isOpen: false })}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-sm bg-[#0a1226] border border-[#1e3461] rounded-[2.5rem] p-7 shadow-2xl relative overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6 relative">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-400 border border-amber-500/20">
                    <Star size={24} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-tight text-white line-clamp-1">
                      Room Credentials
                    </h3>
                    <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">
                      Entry strictly for joined players
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowIdPass({ isOpen: false })}
                  className="p-2 bg-white/5 text-neutral-400 rounded-xl hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3.5 mb-6">
                <div className="p-3.5 bg-[#0f1d3b] rounded-2xl border border-white/5">
                  <p className="text-[7px] font-black uppercase text-neutral-400 tracking-widest mb-1">Room ID</p>
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-black text-white tracking-wider">{showIdPass.roomId || 'PENDING'}</p>
                    <button
                      onClick={() => handleCopy(showIdPass.roomId || '')}
                      className="p-2 bg-white/5 text-neutral-400 rounded-xl hover:text-white transition-colors"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
                <div className="p-3.5 bg-[#0f1d3b] rounded-2xl border border-white/5">
                  <p className="text-[7px] font-black uppercase text-neutral-400 tracking-widest mb-1">Password</p>
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-black text-white tracking-wider">{showIdPass.roomPass || 'PENDING'}</p>
                    <button
                      onClick={() => handleCopy(showIdPass.roomPass || '')}
                      className="p-2 bg-white/5 text-neutral-400 rounded-xl hover:text-white transition-colors"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              </div>

              <p className="text-[8px] text-amber-400/80 uppercase font-bold tracking-wider bg-amber-500/10 p-3 rounded-xl border border-amber-500/20 mb-6 leading-relaxed">
                Notice: Sharing these credentials with non-joined players will result in an immediate match disqualification.
              </p>

              <button
                onClick={() => setShowIdPass({ isOpen: false })}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-blue-600/30 active:scale-95"
              >
                Close Portal
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <RulesModal
        isOpen={!!selectedRulesMatch || isGeneralRulesOpen}
        onClose={() => {
          setSelectedRulesMatch(null);
          setIsGeneralRulesOpen(false);
        }}
        section={selectedRulesMatch?.section || 'Battle Royale'}
        isJoined={joinedMatchIds.includes(selectedRulesMatch?.id || '')}
        onJoin={() => onPageChange(Page.JOIN_MATCH, selectedRulesMatch?.id || '')}
      />

      <NotificationsModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        onPageChange={onPageChange}
        user={user}
        joinedMatchIds={joinedMatchIds}
      />
    </div>
  );
}
