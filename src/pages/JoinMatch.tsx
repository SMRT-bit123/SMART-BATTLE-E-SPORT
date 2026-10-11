import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useParams } from 'react-router-dom';
import { ChevronLeft, User as UserIcon, Check, Loader2, X, AlertCircle, Sparkles, Trophy, Calendar, CheckCircle2 } from 'lucide-react';
import { Page, User as UserType, Tournament } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, 
  doc, 
  serverTimestamp,
  onSnapshot,
  arrayUnion,
  increment,
  updateDoc,
  runTransaction
} from 'firebase/firestore';

interface JoinMatchProps {
  user: UserType;
  onPageChange: (page: Page, id?: string) => void;
  joinedMatchIds: string[];
  onJoinSuccess: (matchId: string) => void;
}

// 3D Wallet Illustration Component
function WalletIllustration() {
  return (
    <div className="relative w-20 h-20 sm:w-24 sm:h-24 shrink-0 drop-shadow-xl">
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        {/* Money Bills poking out */}
        <g transform="translate(18, 8) rotate(-12)">
          <rect x="0" y="0" width="34" height="24" rx="3" fill="#22c55e" stroke="#15803d" strokeWidth="1.5" />
          <circle cx="17" cy="12" r="4" fill="#86efac" />
          <line x1="4" y1="4" x2="30" y2="4" stroke="#86efac" strokeWidth="1.5" strokeLinecap="round" />
        </g>
        <g transform="translate(32, 10) rotate(8)">
          <rect x="0" y="0" width="34" height="24" rx="3" fill="#4ade80" stroke="#16a34a" strokeWidth="1.5" />
          <circle cx="17" cy="12" r="4" fill="#bbf7d0" />
        </g>

        {/* Wallet Back */}
        <rect x="12" y="24" width="76" height="56" rx="14" fill="#c25e00" />
        
        {/* Wallet Body Main */}
        <rect x="10" y="28" width="78" height="54" rx="12" fill="url(#walletGrad)" stroke="#7c2d12" strokeWidth="1.5" />
        
        {/* Flap Stitching */}
        <path d="M16 38 H82" stroke="#7c2d12" strokeWidth="1" strokeDasharray="3 2" opacity="0.6" />
        
        {/* Front Flap Clasp */}
        <path d="M56 46 H88 V66 H56 C50 66 50 46 56 46 Z" fill="#b45309" stroke="#78350f" strokeWidth="1.2" />
        <circle cx="78" cy="56" r="4" fill="#fbbf24" stroke="#78350f" strokeWidth="1" />
        <circle cx="78" cy="56" r="1.5" fill="#d97706" />

        <defs>
          <linearGradient id="walletGrad" x1="10" y1="28" x2="88" y2="82" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f59e0b" />
            <stop offset="1" stopColor="#d97706" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

export default function JoinMatch({ user, onPageChange, joinedMatchIds, onJoinSuccess }: JoinMatchProps) {
  const { id: matchId } = useParams();
  const isJoined = matchId ? joinedMatchIds.includes(matchId) : false;

  // Flow steps: 'select_position' | 'summary' | 'success'
  const [currentStep, setCurrentStep] = useState<'select_position' | 'summary' | 'success'>('select_position');
  
  // State for positions & IGN
  const [selectedSlots, setSelectedSlots] = useState<number[]>([]);
  const [inGameName, setInGameName] = useState('');
  const [ignModalOpen, setIgnModalOpen] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [tempIgn, setTempIgn] = useState('');
  const [activeEditingSlotIndex, setActiveEditingSlotIndex] = useState<number>(0);
  const [teammateIGNs, setTeammateIGNs] = useState<string[]>(['', '', '']); // For multi-slot/teammates

  const [loading, setLoading] = useState(false);
  const [matchData, setMatchData] = useState<Tournament | null>(null);
  const [takenSlots, setTakenSlots] = useState<number[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Determine game key for IGN retrieval
  const getGameKey = (gameId?: string, section?: string) => {
    const g = (gameId || '').toLowerCase();
    const s = (section || '').toLowerCase();
    if (g.includes('freefire') || s.includes('battle royale') || s.includes('clash squad') || s.includes('lone wolf')) {
      return 'freefire';
    }
    if (g.includes('cod') || g.includes('call of duty')) {
      return 'codm';
    }
    if (g.includes('bgmi') || g.includes('pubg')) {
      return 'bgmi';
    }
    return g || 'freefire';
  };

  // Real-time listener for current match
  useEffect(() => {
    if (!matchId) return;

    const unsubscribe = onSnapshot(doc(db, 'matches', matchId), (doc) => {
      if (doc.exists()) {
        const data = doc.data() as Tournament;
        setMatchData({ id: doc.id, ...data });
        if (data.players) {
          setTakenSlots((data.players as any[]).map((p: any) => p.slot));
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `matches/${matchId}`);
    });

    return () => unsubscribe();
  }, [matchId]);

  // Autofill Game-Specific IGN from Profile
  useEffect(() => {
    if (matchData && user) {
      const gameKey = getGameKey(matchData.gameId, matchData.section);
      const savedGameIGN = user.gameIGNs?.[gameKey] || user.gameIGNs?.[matchData.gameId] || user.ign || (user as any)[`${gameKey}IGN`];
      
      if (savedGameIGN && !inGameName) {
        setInGameName(savedGameIGN);
      }
    }
  }, [matchData, user]);

  const isUserJoined = (matchData?.players as any[])?.some((p: any) => p.userId === auth.currentUser?.uid) || isJoined;

  const totalSlots = matchData?.totalSlots || matchData?.maxPlayers || 48;
  const maxTeamSlots = matchData?.mode === 'Duo' ? 2 : matchData?.mode === 'Squad' ? 4 : 1;

  // Toggle position selection in Step 1
  const toggleSlot = (slotId: number) => {
    if (takenSlots.includes(slotId) || isUserJoined) return;

    if (maxTeamSlots > 1) {
      if (selectedSlots.includes(slotId)) {
        setSelectedSlots(selectedSlots.filter(id => id !== slotId));
      } else {
        if (selectedSlots.length < maxTeamSlots) {
          setSelectedSlots([...selectedSlots, slotId].sort((a, b) => a - b));
        } else {
          // If already at max, replace the last one or single slot
          setSelectedSlots([slotId]);
        }
      }
    } else {
      if (selectedSlots.includes(slotId)) {
        setSelectedSlots([]);
      } else {
        setSelectedSlots([slotId]);
      }
    }
  };

  // Proceed from Step 1 to Step 2
  const handleProceedToSummary = () => {
    if (selectedSlots.length === 0) return;
    
    // If user doesn't have an IGN yet, we can open the summary with "ADD IGN" button or open the modal directly
    setCurrentStep('summary');
  };

  // Open IGN Modal
  const openIgnModal = (slotIndex: number = 0) => {
    setActiveEditingSlotIndex(slotIndex);
    if (slotIndex === 0) {
      setTempIgn(inGameName || '');
    } else {
      setTempIgn(teammateIGNs[slotIndex - 1] || '');
    }
    setIgnModalOpen(true);
  };

  // Save IGN from Modal
  const handleSaveIgnModal = async () => {
    const trimmed = tempIgn.trim();
    if (!trimmed) {
      alert('Please enter a valid in-game name');
      return;
    }

    if (activeEditingSlotIndex === 0) {
      setInGameName(trimmed);
      // Persist to user profile in Firestore
      if (auth.currentUser) {
        try {
          const gameKey = getGameKey(matchData?.gameId, matchData?.section);
          await updateDoc(doc(db, 'users', auth.currentUser.uid), {
            [`gameIGNs.${gameKey}`]: trimmed,
            ign: trimmed
          });
        } catch (e) {
          console.warn('Could not auto-save IGN to profile:', e);
        }
      }
    } else {
      const updated = [...teammateIGNs];
      updated[activeEditingSlotIndex - 1] = trimmed;
      setTeammateIGNs(updated);
    }

    setIgnModalOpen(false);
  };

  // Final Join Action in Step 4
  const handleFinalJoin = async () => {
    if (selectedSlots.length === 0 || !matchId || !auth.currentUser) return;
    
    // Check if main IGN is provided
    if (!inGameName) {
      openIgnModal(0);
      return;
    }

    // Check teammate IGNs if multiple slots
    if (selectedSlots.length > 1) {
      for (let i = 0; i < selectedSlots.length - 1; i++) {
        if (!teammateIGNs[i]) {
          openIgnModal(i + 1);
          return;
        }
      }
    }

    if (isUserJoined) {
      alert('You have already joined this match!');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const matchRef = doc(db, 'matches', matchId);
      const regId = `${matchId}_${auth.currentUser.uid}`;
      const regRef = doc(db, 'registrations', regId);

      const entryFeePerSlot = matchData?.entryFee || 0;
      const totalFee = entryFeePerSlot * selectedSlots.length;

      await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        const matchDoc = await transaction.get(matchRef);

        if (!userDoc.exists()) throw new Error('User profile not found. Please log in again.');
        if (!matchDoc.exists()) throw new Error('Match not found.');

        const userData = userDoc.data() as UserType;
        const tournamentData = matchDoc.data() as Tournament;

        if ((tournamentData.players as any[])?.some((p: any) => p.userId === auth.currentUser?.uid)) {
          throw new Error('You have already joined this match.');
        }

        const deposit = userData.wallet?.deposit || 0;
        const winnings = userData.wallet?.winnings || 0;
        const bonus = userData.wallet?.bonus || 0;
        const totalPayable = deposit + winnings + bonus;

        if (totalPayable < totalFee) {
          throw new Error('NOT_ENOUGH_BALANCE');
        }

        const updatedPlayers = (tournamentData.players as any[]) || [];
        // Check if any of the selected slots are taken
        for (const slotId of selectedSlots) {
          if (updatedPlayers.some((p: any) => p.slot === slotId)) {
            throw new Error(`Position ${slotId} was just taken. Please choose another position.`);
          }
        }

        if (updatedPlayers.length + selectedSlots.length > (tournamentData.totalSlots || tournamentData.maxPlayers || 48)) {
          throw new Error('Match does not have enough slots left.');
        }

        // Deduction Logic: Bonus -> Deposit -> Winnings
        let remaining = totalFee;
        let newBonus = bonus;
        let newDeposit = deposit;
        let newWinnings = winnings;

        // 1. Use Bonus first
        if (newBonus >= remaining) {
          newBonus -= remaining;
          remaining = 0;
        } else {
          remaining -= newBonus;
          newBonus = 0;
        }

        // 2. Use Deposit next
        if (remaining > 0) {
          if (newDeposit >= remaining) {
            newDeposit -= remaining;
            remaining = 0;
          } else {
            remaining -= newDeposit;
            newDeposit = 0;
          }
        }

        // 3. Use Winnings last
        if (remaining > 0) {
          newWinnings = Math.max(0, newWinnings - remaining);
          remaining = 0;
        }

        transaction.update(userRef, {
          "wallet.deposit": newDeposit,
          "wallet.winnings": newWinnings,
          "wallet.bonus": newBonus
        });

        // Prepare team members array
        const teamMembers = [
          { name: inGameName, isOwner: true }
        ];
        for (let i = 0; i < selectedSlots.length - 1; i++) {
          teamMembers.push({ name: teammateIGNs[i], isOwner: false } as any);
        }

        // Prepare match players to add
        const playersToAdd = selectedSlots.map((slot, index) => ({
          userId: auth.currentUser!.uid,
          username: user.username,
          ign: index === 0 ? inGameName : teammateIGNs[index - 1],
          slot: slot
        }));

        // Update Match
        transaction.update(matchRef, {
          players: arrayUnion(...playersToAdd),
          playersCount: increment(selectedSlots.length)
        });

        // Create registration
        transaction.set(regRef, {
          tournamentId: matchId,
          userId: auth.currentUser!.uid,
          ign: inGameName,
          slots: selectedSlots,
          teamMembers: teamMembers,
          totalSlotsBooked: selectedSlots.length,
          joinedAt: serverTimestamp(),
          gameId: tournamentData.gameId || 'freefire',
          status: 'active'
        });

        // Add transaction log
        if (totalFee > 0) {
          const transRef = doc(collection(db, 'transactions'));
          transaction.set(transRef, {
            userId: auth.currentUser!.uid,
            type: 'entry',
            amount: totalFee,
            matchId: matchId,
            status: 'completed',
            title: `JOINED MATCH: ${tournamentData.title || tournamentData.displayId || '#000'} (${selectedSlots.length} Slots)`,
            createdAt: serverTimestamp()
          });
        }
      });

      onJoinSuccess(matchId);
      setShowSuccessModal(true);
      setCurrentStep('summary');
    } catch (error: any) {
      console.error('Registration failed:', error);
      const errorMsg = error.message || '';
      if (errorMsg === 'NOT_ENOUGH_BALANCE' || errorMsg.includes('Insufficient') || errorMsg.includes('balance')) {
        setErrorMessage('Insufficient wallet balance. Please recharge your wallet.');
        setTimeout(() => {
          onPageChange(Page.WALLET);
        }, 1500);
      } else {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to join match');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!matchData) {
    return (
      <div className="min-h-screen bg-[#070e20] flex flex-col items-center justify-center text-white">
        <Loader2 size={32} className="text-cyan-400 animate-spin mb-4" />
        <p className="text-xs font-black uppercase tracking-widest text-neutral-400">Loading Contest Positions...</p>
      </div>
    );
  }

  // Display calculations
  const entryFeePerSlot = matchData.entryFee !== undefined && matchData.entryFee !== null ? matchData.entryFee : 5;
  const totalAmount = entryFeePerSlot * Math.max(1, selectedSlots.length);
  const userBalance = ((user.wallet?.deposit || 0) + (user.wallet?.winnings || 0) + (user.wallet?.bonus || 0));
  const teamLabel = matchData.mode ? `${matchData.mode} Match` : 'Solo Match';

  // ==========================================
  // STEP 5: SUCCESS SCREEN
  // ==========================================
  if (currentStep === 'success') {
    return (
      <div className="min-h-screen bg-white text-neutral-900 flex flex-col justify-between p-6 max-w-lg mx-auto select-none">
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          {/* Large Circular Success / Check Icon */}
          <motion.div
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', damping: 14, stiffness: 180 }}
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-[#45c4a0] flex items-center justify-center text-white shadow-2xl shadow-emerald-400/40 mb-8"
          >
            <Check size={52} className="stroke-[3.5]" />
          </motion.div>

          {/* Tournament Title */}
          <h2 className="text-base sm:text-lg font-black uppercase tracking-tight text-neutral-900 px-4 max-w-xs leading-tight mb-2">
            {matchData.title || 'BR SOLO BATTLE'}
          </h2>

          {/* Subtitle */}
          <p className="text-sm font-bold text-[#45c4a0] tracking-wide">
            Match Joined Successfully
          </p>
        </div>

        {/* Large Full-Width HOME Button */}
        <div className="w-full pt-6">
          <button
            onClick={() => onPageChange(Page.HOME)}
            className="w-full py-4 bg-[#45c4a0] hover:bg-[#3db392] text-white rounded-xl text-base font-black tracking-wider uppercase shadow-lg shadow-emerald-500/25 active:scale-98 transition-all"
          >
            HOME
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // STEP 2 & 4: JOINING MATCH SUMMARY SCREEN
  // ==========================================
  if (currentStep === 'summary') {
    return (
      <div className="min-h-screen bg-[#197843] text-white flex flex-col justify-between max-w-lg mx-auto select-none">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-[#0a1835] border-b border-[#142850] px-4 py-3.5 flex items-center">
          <button
            onClick={() => setCurrentStep('select_position')}
            className="p-1 -ml-1 text-white hover:text-cyan-400 active:scale-95 transition-transform"
            aria-label="Back to positions"
          >
            <ChevronLeft size={26} className="stroke-[2.5]" />
          </button>
          <h1 className="text-base font-black uppercase tracking-tight text-white flex-1 text-center pr-6">
            JOINING MATCH
          </h1>
        </header>

        {/* Content Body */}
        <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between">
          <div>
            {/* Top Wallet Card Summary */}
            <div className="flex items-center gap-3 sm:gap-4 mb-6 pt-2">
              <WalletIllustration />
              <div className="flex-1 space-y-1.5 text-xs sm:text-[13px]">
                <div className="flex items-center justify-between text-white font-bold">
                  <span className="opacity-90">CURRENT BALANCE:</span>
                  <span className="text-sm font-black">₹{userBalance.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-white font-bold">
                  <span className="opacity-90">PER SLOT ENTRY FEE:</span>
                  <span className="text-sm font-black">₹{entryFeePerSlot}</span>
                </div>
                <div className="flex items-center justify-between text-white font-bold">
                  <span className="opacity-90">SELECTED SLOTS:</span>
                  <span className="text-sm font-black">{selectedSlots.length}</span>
                </div>
                <div className="flex items-center justify-between font-black pt-1 border-t border-white/20">
                  <span className="text-white">TOTAL AMOUNT:</span>
                  <span className="text-base font-black text-amber-300">₹{totalAmount}</span>
                </div>
              </div>
            </div>

            {/* Error Alert if any */}
            {errorMessage && (
              <div className="mb-4 p-3 bg-red-600/90 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg">
                <AlertCircle size={16} className="shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Selected Position Table Card */}
            <div className="bg-white text-neutral-900 rounded-2xl overflow-hidden shadow-2xl mb-4">
              {/* Purple Top Banner */}
              <div className="bg-[#6320ee] text-white text-center py-2.5 px-4 font-black text-xs uppercase tracking-wider">
                SELECTED POSITION TABLE
              </div>

              {/* Table Column Headers */}
              <div className="grid grid-cols-3 text-center py-2.5 px-3 border-b border-neutral-100 text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                <div>TEAM</div>
                <div>POSITION</div>
                <div>IGN</div>
              </div>

              {/* Table Rows */}
              <div className="divide-y divide-neutral-100 max-h-[36vh] overflow-y-auto">
                {selectedSlots.map((slotNum, idx) => {
                  const currentSlotIgn = idx === 0 ? inGameName : teammateIGNs[idx - 1];
                  return (
                    <div key={slotNum} className="grid grid-cols-3 items-center text-center py-3 px-3">
                      {/* Team column */}
                      <span className="text-xs sm:text-[13px] font-bold text-neutral-800">
                        {teamLabel}
                      </span>

                      {/* Position column */}
                      <span className="text-sm font-black text-[#6320ee]">
                        {slotNum}
                      </span>

                      {/* IGN column */}
                      <div className="flex items-center justify-center">
                        {currentSlotIgn ? (
                          <button
                            onClick={() => openIgnModal(idx)}
                            className="text-xs sm:text-[13px] font-extrabold text-neutral-900 hover:text-blue-600 truncate max-w-[110px]"
                            title="Click to edit IGN"
                          >
                            {currentSlotIgn}
                          </button>
                        ) : (
                          <button
                            onClick={() => openIgnModal(idx)}
                            className="bg-[#111827] hover:bg-black text-white text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full active:scale-95 transition-transform"
                          >
                            ADD IGN
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bottom Actions & Footer Note */}
          <div className="pt-4">
            {/* CANCEL and JOIN Buttons */}
            <div className="flex items-center gap-3 mb-3">
              <button
                onClick={() => setCurrentStep('select_position')}
                disabled={loading}
                className="flex-1 py-3.5 bg-[#1f2937] hover:bg-[#111827] text-white rounded-xl font-black text-sm tracking-wider uppercase shadow-md active:scale-95 transition-transform"
              >
                CANCEL
              </button>

              <button
                onClick={handleFinalJoin}
                disabled={loading}
                className="flex-1 py-3.5 bg-[#6320ee] hover:bg-[#5318d1] text-white rounded-xl font-black text-sm tracking-wider uppercase shadow-xl shadow-purple-950/40 active:scale-95 transition-transform flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>JOINING...</span>
                  </>
                ) : (
                  <span>JOIN</span>
                )}
              </button>
            </div>

            {/* Helper Note */}
            <p className="text-[10px] text-center text-emerald-100 font-medium leading-relaxed px-2">
              Note - Please Enter Your In Game Username/Name accurately.
            </p>
          </div>
        </div>

        {/* STEP 3: IGN Modal Overlay */}
        <AnimatePresence>
          {ignModalOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/80 backdrop-blur-xs"
              onClick={() => setIgnModalOpen(false)}
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="w-full max-w-xs bg-white rounded-2xl overflow-hidden shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal Dark Navy Header */}
                <div className="bg-[#121c32] text-white text-center py-3.5 px-4 font-black text-sm uppercase tracking-wider">
                  JOIN MATCH
                </div>

                {/* Modal Body */}
                <div className="p-5 text-neutral-900">
                  <label className="block text-[11px] font-black uppercase text-neutral-700 tracking-wider mb-2">
                    ENTER IN GAME NAME {activeEditingSlotIndex > 0 ? `(PLAYER ${activeEditingSlotIndex + 1})` : ''}
                  </label>

                  {/* Input with User Icon */}
                  <div className="relative mb-3">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                      <UserIcon size={18} />
                    </div>
                    <input
                      type="text"
                      value={tempIgn}
                      onChange={(e) => setTempIgn(e.target.value)}
                      placeholder="e.g. Mps thakur"
                      autoFocus
                      className="w-full pl-10 pr-3 py-2.5 border-2 border-neutral-300 focus:border-[#45c4a0] rounded-xl text-sm font-bold text-neutral-900 focus:outline-hidden transition-colors"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveIgnModal();
                      }}
                    />
                  </div>

                  <p className="text-[10px] text-neutral-500 font-medium leading-normal mb-5">
                    Make sure you have entered the exact case-sensitive in-game tag.
                  </p>

                  {/* Modal Action Buttons: CANCEL & JOIN */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setIgnModalOpen(false)}
                      className="flex-1 py-2.5 bg-[#ef4444] hover:bg-[#dc2626] text-white rounded-xl text-xs font-black uppercase tracking-wider active:scale-95 transition-transform"
                    >
                      CANCEL
                    </button>
                    <button
                      onClick={handleSaveIgnModal}
                      className="flex-1 py-2.5 bg-[#45c4a0] hover:bg-[#3db392] text-white rounded-xl text-xs font-black uppercase tracking-wider active:scale-95 transition-transform"
                    >
                      JOIN
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* STEP 5: SUCCESS POP-UP MODAL */}
        <AnimatePresence>
          {showSuccessModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
              onClick={() => onPageChange(Page.HOME)}
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0, y: 25 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.8, opacity: 0, y: 20 }}
                transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                className="w-full max-w-sm bg-[#0a1835] border border-emerald-500/40 rounded-3xl p-6 text-white shadow-2xl shadow-emerald-500/20 text-center relative overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Decorative Top Accent Glow */}
                <div className="absolute -top-16 -left-16 w-32 h-32 bg-emerald-500/20 rounded-full blur-2xl pointer-events-none" />
                <div className="absolute -top-16 -right-16 w-32 h-32 bg-cyan-500/20 rounded-full blur-2xl pointer-events-none" />

                {/* Close Button */}
                <button
                  onClick={() => onPageChange(Page.HOME)}
                  className="absolute top-4 right-4 p-1.5 text-neutral-400 hover:text-white bg-white/5 rounded-full transition-colors"
                >
                  <X size={18} />
                </button>

                {/* Pulsing Animated Check Icon */}
                <div className="relative mb-5 flex items-center justify-center mt-2">
                  <div className="absolute w-20 h-20 rounded-full bg-[#45c4a0]/25 animate-ping opacity-60 pointer-events-none" />
                  <div className="relative w-16 h-16 rounded-full bg-gradient-to-tr from-[#2da380] to-[#45c4a0] flex items-center justify-center text-white shadow-xl shadow-emerald-500/40 border border-emerald-300/40">
                    <Check size={36} className="stroke-[3.5]" />
                  </div>
                </div>

                {/* Success Title & Subtitle */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/15 border border-emerald-500/30 rounded-full text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2">
                  <Sparkles size={12} />
                  <span>REGISTRATION CONFIRMED</span>
                </div>

                <h2 className="text-lg sm:text-xl font-black uppercase tracking-tight text-white mb-1">
                  MATCH JOINED SUCCESSFULLY!
                </h2>
                <p className="text-xs text-neutral-300 font-medium mb-5 px-2">
                  You are registered for <span className="text-white font-bold">{matchData.title || 'BR SOLO BATTLE'}</span>. Get ready for battle!
                </p>

                {/* Match Summary Receipt Card */}
                <div className="bg-[#050c1c] border border-white/10 rounded-2xl p-4 text-left space-y-2.5 mb-6 text-xs">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-neutral-400 font-bold text-[11px] uppercase">Contest</span>
                    <span className="font-extrabold text-white truncate max-w-[170px]">{matchData.title || 'BR BATTLE'}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-neutral-400 font-bold text-[11px] uppercase">Booked Position</span>
                    <span className="font-black text-emerald-400">Position #{selectedSlots.join(', #')}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-neutral-400 font-bold text-[11px] uppercase">In-Game Name</span>
                    <span className="font-extrabold text-cyan-300 truncate max-w-[150px]">{inGameName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-400 font-bold text-[11px] uppercase">Entry Fee Paid</span>
                    <span className="font-black text-amber-300">₹{totalAmount}</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2.5">
                  <button
                    onClick={() => onPageChange(Page.HOME)}
                    className="w-full py-3.5 bg-[#45c4a0] hover:bg-[#3db392] text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/25 active:scale-95 transition-transform"
                  >
                    GO TO HOME
                  </button>

                  <button
                    onClick={() => onPageChange(Page.TOURNAMENTS, matchData.gameId)}
                    className="w-full py-3 bg-[#111f3d] hover:bg-[#182a52] text-neutral-300 hover:text-white rounded-xl font-black text-xs uppercase tracking-wider border border-white/10 active:scale-95 transition-transform"
                  >
                    VIEW CONTESTS
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ==========================================
  // STEP 1: SELECT MATCH POSITION SCREEN
  // ==========================================
  const positions = Array.from({ length: totalSlots }, (_, i) => i + 1);

  return (
    <div className="min-h-screen bg-[#070e20] text-white flex flex-col justify-between max-w-lg mx-auto select-none">
      {/* 1. Header (Dark Navy Header with Match Title) */}
      <header className="sticky top-0 z-40 bg-[#0a1835] border-b border-[#142850] px-4 py-3.5 flex items-center">
        <button
          onClick={() => onPageChange(Page.TOURNAMENTS, matchData.gameId)}
          className="p-1 -ml-1 text-white hover:text-cyan-400 active:scale-95 transition-transform"
          aria-label="Back to tournaments"
        >
          <ChevronLeft size={26} className="stroke-[2.5]" />
        </button>
        <h1 className="text-sm sm:text-base font-black uppercase tracking-tight text-white flex-1 text-center pr-6 truncate">
          {matchData.title || 'BR SOLO BATTLE'}
        </h1>
      </header>

      {/* 2. Positions Area */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col">
        {/* Mint/Teal Header Banner */}
        <div className="bg-[#45c4a0] text-white text-center py-2.5 px-4 font-black text-xs sm:text-sm uppercase tracking-wider rounded-t-2xl shadow-md">
          SELECT MATCH POSITION
        </div>

        {/* 4-Column Positions Card Grid */}
        <div className="bg-white text-neutral-900 rounded-b-2xl p-4 sm:p-5 shadow-2xl flex-1 max-h-[68vh] overflow-y-auto">
          <div className="grid grid-cols-4 gap-2.5 sm:gap-3.5">
            {positions.map((pos) => {
              const isOccupied = takenSlots.includes(pos);
              const isSelected = selectedSlots.includes(pos);

              return (
                <div
                  key={pos}
                  onClick={() => toggleSlot(pos)}
                  className={`flex items-center justify-between px-2.5 py-2.5 rounded-lg border transition-all select-none ${
                    isOccupied
                      ? 'bg-neutral-100 border-neutral-200 cursor-not-allowed opacity-60'
                      : isSelected
                      ? 'bg-emerald-50 border-[#45c4a0] shadow-sm cursor-pointer'
                      : 'bg-white border-neutral-200 hover:border-neutral-400 cursor-pointer active:scale-95'
                  }`}
                >
                  {/* Position Number on Left */}
                  <span className={`text-xs sm:text-sm font-bold ${
                    isOccupied ? 'text-neutral-400' : isSelected ? 'text-[#45c4a0] font-black' : 'text-neutral-700'
                  }`}>
                    {pos}
                  </span>

                  {/* Square Slot Indicator on Right */}
                  <div
                    className={`w-5 h-5 rounded-[4px] flex items-center justify-center shrink-0 transition-all ${
                      isOccupied
                        ? 'bg-neutral-300 border-2 border-neutral-300'
                        : isSelected
                        ? 'bg-[#45c4a0] border-2 border-[#45c4a0] text-white shadow-xs'
                        : 'border-2 border-neutral-300 bg-white'
                    }`}
                  >
                    {isSelected && <Check size={13} className="stroke-[3.5]" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. Bottom Large JOIN NOW Button */}
      <div className="p-4 sm:p-5 bg-[#0a1835] border-t border-[#142850]">
        <button
          onClick={handleProceedToSummary}
          disabled={selectedSlots.length === 0}
          className={`w-full py-4 rounded-xl text-base font-black uppercase tracking-wider shadow-lg transition-all ${
            selectedSlots.length > 0
              ? 'bg-[#45c4a0] hover:bg-[#3db392] text-white shadow-emerald-500/25 active:scale-98 cursor-pointer'
              : 'bg-neutral-700 text-neutral-400 cursor-not-allowed opacity-60'
          }`}
        >
          JOIN NOW
        </button>
      </div>

      {/* SUCCESS POP-UP MODAL OVERLAY */}
      <AnimatePresence>
        {showSuccessModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
            onClick={() => onPageChange(Page.HOME)}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 25 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className="w-full max-w-sm bg-[#0a1835] border border-emerald-500/40 rounded-3xl p-6 text-white shadow-2xl shadow-emerald-500/20 text-center relative overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Decorative Top Accent Glow */}
              <div className="absolute -top-16 -left-16 w-32 h-32 bg-emerald-500/20 rounded-full blur-2xl pointer-events-none" />
              <div className="absolute -top-16 -right-16 w-32 h-32 bg-cyan-500/20 rounded-full blur-2xl pointer-events-none" />

              {/* Close Button */}
              <button
                onClick={() => onPageChange(Page.HOME)}
                className="absolute top-4 right-4 p-1.5 text-neutral-400 hover:text-white bg-white/5 rounded-full transition-colors"
              >
                <X size={18} />
              </button>

              {/* Pulsing Animated Check Icon */}
              <div className="relative mb-5 flex items-center justify-center mt-2">
                <div className="absolute w-20 h-20 rounded-full bg-[#45c4a0]/25 animate-ping opacity-60 pointer-events-none" />
                <div className="relative w-16 h-16 rounded-full bg-gradient-to-tr from-[#2da380] to-[#45c4a0] flex items-center justify-center text-white shadow-xl shadow-emerald-500/40 border border-emerald-300/40">
                  <Check size={36} className="stroke-[3.5]" />
                </div>
              </div>

              {/* Success Title & Subtitle */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/15 border border-emerald-500/30 rounded-full text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2">
                <Sparkles size={12} />
                <span>REGISTRATION CONFIRMED</span>
              </div>

              <h2 className="text-lg sm:text-xl font-black uppercase tracking-tight text-white mb-1">
                MATCH JOINED SUCCESSFULLY!
              </h2>
              <p className="text-xs text-neutral-300 font-medium mb-5 px-2">
                You are registered for <span className="text-white font-bold">{matchData.title || 'BR SOLO BATTLE'}</span>. Get ready for battle!
              </p>

              {/* Match Summary Receipt Card */}
              <div className="bg-[#050c1c] border border-white/10 rounded-2xl p-4 text-left space-y-2.5 mb-6 text-xs">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-neutral-400 font-bold text-[11px] uppercase">Contest</span>
                  <span className="font-extrabold text-white truncate max-w-[170px]">{matchData.title || 'BR BATTLE'}</span>
                </div>
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-neutral-400 font-bold text-[11px] uppercase">Booked Position</span>
                  <span className="font-black text-emerald-400">Position #{selectedSlots.join(', #')}</span>
                </div>
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-neutral-400 font-bold text-[11px] uppercase">In-Game Name</span>
                  <span className="font-extrabold text-cyan-300 truncate max-w-[150px]">{inGameName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400 font-bold text-[11px] uppercase">Entry Fee Paid</span>
                  <span className="font-black text-amber-300">₹{totalAmount}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5">
                <button
                  onClick={() => onPageChange(Page.HOME)}
                  className="w-full py-3.5 bg-[#45c4a0] hover:bg-[#3db392] text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/25 active:scale-95 transition-transform"
                >
                  GO TO HOME
                </button>

                <button
                  onClick={() => onPageChange(Page.TOURNAMENTS, matchData.gameId)}
                  className="w-full py-3 bg-[#111f3d] hover:bg-[#182a52] text-neutral-300 hover:text-white rounded-xl font-black text-xs uppercase tracking-wider border border-white/10 active:scale-95 transition-transform"
                >
                  VIEW CONTESTS
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
