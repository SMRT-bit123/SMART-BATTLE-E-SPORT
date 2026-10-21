import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useParams } from 'react-router-dom';
import { 
  ChevronLeft, 
  Loader2, 
  Trophy, 
  Users, 
  X, 
  ShieldCheck, 
  Calendar, 
  AlertCircle, 
  Search, 
  CheckCircle2, 
  Info,
  Sparkles,
  Swords,
  Lock,
  Key
} from 'lucide-react';
import { Page, Tournament, User } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import SafeImage from '../components/SafeImage';

interface MatchDetailsProps {
  user: User | null;
  onPageChange: (page: Page, id?: string) => void;
  joinedMatchIds: string[];
}

// Reusable Golden Coin Component for ₹ Token / Coins
function GoldenCoinIcon({ size = 16 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-gradient-to-br from-amber-300 via-amber-500 to-yellow-600 p-[1px] shadow-xs flex items-center justify-center shrink-0 inline-flex"
    >
      <div className="w-full h-full rounded-full bg-gradient-to-tr from-amber-600 to-yellow-400 flex items-center justify-center text-black font-black text-[9px] leading-none select-none">
        ₹
      </div>
    </div>
  );
}

// Format tournament date/time string to "DD/MM/YYYY at hh:mm A"
function formatMatchSchedule(timeStr?: string) {
  if (!timeStr) return '21/08/2026 at 08:40 AM';
  try {
    const d = new Date(timeStr);
    if (isNaN(d.getTime())) {
      return timeStr;
    }
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strHours = hours.toString().padStart(2, '0');
    return `${day}/${month}/${year} at ${strHours}:${minutes} ${ampm}`;
  } catch {
    return timeStr;
  }
}

// Default Fallback Esports artwork based on Section/Mode (Instant local assets)
function getDefaultEsportsImage(section?: string, mode?: string) {
  const s = (section || '').toLowerCase();
  const m = (mode || '').toLowerCase();

  if (s.includes('clash') || m.includes('cs') || m.includes('headshot')) {
    return '/images/regenerated_image_1791756005244.png';
  }
  if (s.includes('lone') || m.includes('wolf')) {
    return '/images/regenerated_image_1791735950149.jpg';
  }
  if (s.includes('free') || m.includes('free')) {
    return '/images/regenerated_image_1791756013539.png';
  }
  if (m.includes('squad') || s.includes('squad')) {
    return '/images/regenerated_image_1791755551692.png';
  }
  if (m.includes('solo') || s.includes('solo')) {
    return '/images/regenerated_image_1791735926796.jpg';
  }
  return '/images/regenerated_image_1791755547255.png';
}

export default function MatchDetails({ user, onPageChange, joinedMatchIds }: MatchDetailsProps) {
  const { id } = useParams<{ id: string }>();
  const matchId = id || '';

  const [matchData, setMatchData] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllJoiningsModal, setShowAllJoiningsModal] = useState(false);
  const [joiningsSearch, setJoiningsSearch] = useState('');
  const [showRoomDetailsModal, setShowRoomDetailsModal] = useState(false);
  const [sectionRules, setSectionRules] = useState<string[]>([]);

  useEffect(() => {
    if (!matchData) return;
    if (matchData.rules && Array.isArray(matchData.rules) && matchData.rules.length > 0) {
      setSectionRules(matchData.rules);
      return;
    }
    if (matchData.rules && typeof matchData.rules === 'string' && matchData.rules.trim().length > 0) {
      setSectionRules(matchData.rules.split('\n').filter(r => r.trim().length > 0));
      return;
    }

    const fetchRules = async () => {
      try {
        const sec = (matchData.section || matchData.mode || 'Battle Royale').toLowerCase().trim();
        const normKey = sec.replace(/[^a-z0-9]+/g, '_');
        let snap = await getDoc(doc(db, 'gameRules', normKey));
        if (!snap.exists() && matchData.modeId) {
          snap = await getDoc(doc(db, 'gameRules', matchData.modeId));
        }
        if (!snap.exists()) {
          if (sec.includes('headshot')) snap = await getDoc(doc(db, 'gameRules', 'cs_headshot'));
          else if (sec.includes('free')) snap = await getDoc(doc(db, 'gameRules', 'free_match'));
          else if (sec.includes('clash') || sec.includes('4v4')) snap = await getDoc(doc(db, 'gameRules', 'clash_squad'));
          else if (sec.includes('lone') || sec.includes('wolf') || sec.includes('1v1')) snap = await getDoc(doc(db, 'gameRules', 'lone_wolf'));
          else if (sec.includes('sniper')) snap = await getDoc(doc(db, 'gameRules', 'sniper_only'));
          else if (sec.includes('custom')) snap = await getDoc(doc(db, 'gameRules', 'custom_room'));
          else snap = await getDoc(doc(db, 'gameRules', 'battle_royale'));
        }

        if (snap.exists() && snap.data().rules && snap.data().rules.length > 0) {
          setSectionRules(snap.data().rules);
        }
      } catch (err) {
        console.warn('Failed to load dynamic rules:', err);
      }
    };
    fetchRules();
  }, [matchData?.id, matchData?.section, matchData?.mode, matchData?.modeId, matchData?.rules]);

  useEffect(() => {
    if (!matchId) {
      setError('Match ID not found');
      setLoading(false);
      return;
    }

    const docRef = doc(db, 'matches', matchId);
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = { id: docSnap.id, ...docSnap.data() } as Tournament;
          setMatchData(data);
          setError(null);
        } else {
          setError('Match does not exist or has been removed');
        }
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching match details:', err);
        handleFirestoreError(err, OperationType.GET, `matches/${matchId}`);
        setError('Failed to load match details');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [matchId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070e20] flex flex-col items-center justify-center p-6 text-white">
        <Loader2 className="w-10 h-10 text-emerald-400 animate-spin mb-4" />
        <p className="text-xs font-black uppercase tracking-widest text-neutral-400">Loading Contest Details...</p>
      </div>
    );
  }

  if (error || !matchData) {
    return (
      <div className="min-h-screen bg-[#070e20] flex flex-col items-center justify-center p-6 text-white text-center">
        <div className="w-14 h-14 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 mb-4">
          <AlertCircle size={28} />
        </div>
        <h2 className="text-lg font-black uppercase tracking-tight text-white mb-2">Contest Not Found</h2>
        <p className="text-xs text-neutral-400 mb-6 max-w-xs">{error || 'This tournament is not available.'}</p>
        <button
          onClick={() => onPageChange(Page.TOURNAMENTS)}
          className="px-6 py-3 bg-[#45c4a0] hover:bg-[#3db392] text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20"
        >
          Back to Tournaments
        </button>
      </div>
    );
  }

  // Calculate Match Info Values
  const isJoined = joinedMatchIds.includes(matchId) || (matchData.players && user && matchData.players.some(p => p.userId === user.id || p.userId === auth.currentUser?.uid));
  const isOngoing = matchData.status === 'ongoing';
  const isCompleted = matchData.status === 'completed';

  const totalSlots = matchData.totalSlots || matchData.maxPlayers || 48;
  const players = matchData.players || [];
  const playersCount = matchData.playersCount || players.length;
  const spotsLeft = Math.max(0, totalSlots - playersCount);
  const isFull = spotsLeft <= 0;

  // Match Display ID
  const displayMatchNumber = matchData.displayId 
    ? matchData.displayId.replace(/[^0-9]/g, '') || matchData.displayId
    : (matchData as any).matchNumber 
      ? String((matchData as any).matchNumber)
      : matchId.slice(-6).toUpperCase();

  // Banner image
  const bannerImage = matchData.image || getDefaultEsportsImage(matchData.section, matchData.mode);

  // Title formatting
  const matchTitle = matchData.title || `${(matchData.section || 'BR').toUpperCase()} ${(matchData.mode || 'SOLO').toUpperCase()} BATTLE`;

  // Basic Info Values
  const teamType = matchData.mode ? matchData.mode.charAt(0).toUpperCase() + matchData.mode.slice(1).toLowerCase() : 'Solo';
  const modeName = (matchData.section || 'Battle Royale').toUpperCase();
  const mapName = (matchData.map || 'BERMUDA').toUpperCase();
  const isPaid = (matchData.entryFee || 0) > 0;
  const matchTypeStr = isPaid ? 'Paid' : 'Free';
  const entryFeeStr = isPaid ? matchData.entryFee : 'FREE';
  const scheduleFormatted = formatMatchSchedule(matchData.time);

  // Prize Pool calculations
  const calculateTotalPrizePool = (): number => {
    if (matchData.prizePool && Number(matchData.prizePool) > 0) return Number(matchData.prizePool);
    if (matchData.prizeDistribution && Object.keys(matchData.prizeDistribution).length > 0) {
      const total = Object.values(matchData.prizeDistribution).reduce<number>((sum, val) => sum + (Number(val) || 0), 0);
      if (total > 0) return total;
    }
    if (matchData.prize) {
      const parsed = parseInt(String(matchData.prize).replace(/[^0-9]/g, ''));
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return 300;
  };

  const totalPrizePool = calculateTotalPrizePool();

  // Prize breakdown items
  const getPrizeList = () => {
    const items: { label: string; amount: number | string }[] = [];
    const isSurvival = matchData.prizeType === 'survival';

    // 1. PER KILL row
    if (isSurvival) {
      items.push({ label: 'PER KILL', amount: '₹0' });
    } else {
      items.push({ label: 'PER KILL', amount: `₹${matchData.perKillAmount || 0}` });
    }

    // 2. Rank Distribution
    if (matchData.prizeDistribution && Object.keys(matchData.prizeDistribution).length > 0) {
      const sortedRanks = Object.keys(matchData.prizeDistribution)
        .map(Number)
        .sort((a, b) => a - b);
      
      sortedRanks.forEach((rank) => {
        let label = `${rank}TH`;
        if (rank === 1) label = '1ST (BOOYAH)';
        else if (rank === 2) label = '2ND (RUNNER UP)';
        else if (rank === 3) label = '3RD PLACE';
        items.push({
          label,
          amount: `₹${matchData.prizeDistribution![rank]}`
        });
      });
    } else if (matchData.positionPrizeDistribution && Object.keys(matchData.positionPrizeDistribution).length > 0) {
      const sortedRanks = Object.keys(matchData.positionPrizeDistribution)
        .map(Number)
        .sort((a, b) => a - b);
      
      sortedRanks.forEach((rank) => {
        let label = `${rank}TH`;
        if (rank === 1) label = '1ST (BOOYAH)';
        else if (rank === 2) label = '2ND (RUNNER UP)';
        else if (rank === 3) label = '3RD PLACE';
        items.push({
          label,
          amount: `₹${matchData.positionPrizeDistribution![rank]}`
        });
      });
    } else if (isSurvival) {
      items.push({ label: '1ST (BOOYAH)', amount: `₹${totalPrizePool}` });
    }

    return items;
  };

  const prizeItems = getPrizeList();

  // About description
  const aboutDescription = matchData.description || 
    `This is a ${teamType} ${matchData.section || 'Battle Royale'} match on ${mapName} where only skilled players can survive till the end. Show your skills and be the last one standing!`;

  // Custom or Default Rules
  const getRulesList = () => {
    if (sectionRules && sectionRules.length > 0) {
      return sectionRules;
    }
    if (matchData.rules) {
      if (Array.isArray(matchData.rules)) return matchData.rules;
      if (typeof matchData.rules === 'string') {
        return matchData.rules.split('\n').filter(r => r.trim().length > 0);
      }
    }
    return [
      'Level Requirement: Only players with Level 40+ IDs are eligible to participate.',
      'Headshot Rate: Career headshot rate must not exceed 70%.',
      'Device Requirements: The match must be played exclusively on a smartphone or tablet. Emulators are strictly prohibited.',
      'Registration: Enter exact in-game IGN without unsupported special characters.',
      'Fairplay: No teaming, aimbots, or game modifying software.',
      'Match Result Policy: Scores will be verified by the admin team post-match before prize distribution.',
      'Cancellation & Refund Policy: If a match is cancelled by the admin, 100% of the entry fee will be refunded back to your wallet instantly.'
    ];
  };

  const rulesList = getRulesList();

  // Filtered joinings for the modal
  const filteredPlayers = players.filter((p) => {
    if (!joiningsSearch) return true;
    const term = joiningsSearch.toLowerCase();
    return (
      (p.username && p.username.toLowerCase().includes(term)) ||
      (p.ign && p.ign.toLowerCase().includes(term)) ||
      (p.slot && String(p.slot).includes(term))
    );
  });

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-neutral-900 pb-28 max-w-lg mx-auto select-none relative">
      {/* ========================================================================= */}
      {/* 2. MATCH DETAILS PAGE HEADER                                              */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-30 bg-[#0a1835] text-white shadow-lg rounded-b-2xl border-b border-[#182a52] px-4 py-3.5 flex items-center justify-between">
        <button
          onClick={() => onPageChange(Page.TOURNAMENTS, matchData.gameId)}
          className="p-2 -ml-1 text-white hover:bg-white/10 rounded-full transition-colors active:scale-95"
          aria-label="Back to Tournaments"
        >
          <ChevronLeft size={22} className="stroke-[2.5]" />
        </button>

        <div className="flex-1 text-center pr-6">
          <h1 className="text-sm sm:text-base font-black tracking-wide uppercase">
            Contest Details #{displayMatchNumber}
          </h1>
        </div>

        {/* Room Info Quick Icon if user is joined and room info is ready */}
        {isJoined && (matchData.roomId || matchData.roomPassword) && (
          <button
            onClick={() => setShowRoomDetailsModal(true)}
            className="p-1.5 bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 rounded-lg text-xs font-bold flex items-center gap-1"
          >
            <Key size={14} />
          </button>
        )}
      </header>

      {/* Main Scrollable Content */}
      <div className="p-4 space-y-4">
        {/* ========================================================================= */}
        {/* 3. TOURNAMENT BANNER                                                      */}
        {/* ========================================================================= */}
        <div className="w-full aspect-[16/9] sm:aspect-[16/8.5] bg-[#070e20] rounded-2xl overflow-hidden shadow-md border border-neutral-200 relative">
          <SafeImage
            src={bannerImage}
            alt={matchTitle}
            className="w-full h-full object-cover"
            imgClassName="w-full h-full object-cover"
          />

          {/* Joined Status Badge */}
          {isJoined && (
            <div className="absolute top-3 right-3 z-10 bg-emerald-600/95 backdrop-blur-xs text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider shadow-lg flex items-center gap-1 border border-emerald-400/40">
              <CheckCircle2 size={12} />
              <span>Joined</span>
            </div>
          )}

          {/* Match Status Overlay Badge */}
          <div className="absolute bottom-3 left-3 z-10">
            {isCompleted ? (
              <span className="bg-neutral-800/90 backdrop-blur-xs text-neutral-300 text-[10px] font-black px-2.5 py-0.5 rounded-md uppercase tracking-wider border border-white/10">
                Completed
              </span>
            ) : isOngoing ? (
              <span className="bg-red-600/95 backdrop-blur-xs text-white text-[10px] font-black px-2.5 py-0.5 rounded-md uppercase tracking-wider animate-pulse border border-red-400">
                LIVE NOW
              </span>
            ) : isFull ? (
              <span className="bg-amber-600/90 backdrop-blur-xs text-white text-[10px] font-black px-2.5 py-0.5 rounded-md uppercase tracking-wider">
                Full ({playersCount}/{totalSlots})
              </span>
            ) : (
              <span className="bg-blue-600/90 backdrop-blur-xs text-white text-[10px] font-black px-2.5 py-0.5 rounded-md uppercase tracking-wider">
                {spotsLeft} Spots Left
              </span>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 4. MATCH TITLE / BASIC INFORMATION                                       */}
        {/* ========================================================================= */}
        <div className="space-y-3">
          {/* Match Title */}
          <h2 className="text-base sm:text-lg font-black uppercase text-[#1e3a8a] text-center leading-snug tracking-tight px-1">
            {matchTitle}
          </h2>

          {/* 3-Row Information Cards Grid */}
          <div className="space-y-2">
            {/* Row 1: Team | Mode | Map */}
            <div className="grid grid-cols-3 gap-2">
              {/* Team */}
              <div className="bg-white border border-neutral-200/90 rounded-xl p-2.5 text-center shadow-xs flex flex-col justify-center">
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide">
                  Team:
                </span>
                <span className="text-xs sm:text-[13px] font-black text-neutral-900 uppercase mt-0.5">
                  {teamType}
                </span>
              </div>

              {/* Mode */}
              <div className="bg-white border border-neutral-200/90 rounded-xl p-2.5 text-center shadow-xs flex flex-col justify-center">
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide">
                  Mode:
                </span>
                <span className="text-xs sm:text-[13px] font-black text-neutral-900 uppercase mt-0.5 truncate px-1">
                  {modeName}
                </span>
              </div>

              {/* Map */}
              <div className="bg-white border border-neutral-200/90 rounded-xl p-2.5 text-center shadow-xs flex flex-col justify-center">
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide">
                  Map:
                </span>
                <span className="text-xs sm:text-[13px] font-black text-neutral-900 uppercase mt-0.5 truncate px-1">
                  {mapName}
                </span>
              </div>
            </div>

            {/* Row 2: Match Type | Entry Fee */}
            <div className="grid grid-cols-2 gap-2">
              {/* Match Type */}
              <div className="bg-white border border-neutral-200/90 rounded-xl p-2.5 text-center shadow-xs flex items-center justify-center gap-1.5">
                <span className="text-[10.5px] font-bold text-neutral-500 uppercase tracking-wide">
                  Match Type:
                </span>
                <span className="text-xs sm:text-[13px] font-black text-neutral-900">
                  {matchTypeStr}
                </span>
              </div>

              {/* Entry Fee */}
              <div className="bg-white border border-neutral-200/90 rounded-xl p-2.5 text-center shadow-xs flex items-center justify-center gap-1.5">
                <span className="text-[10.5px] font-bold text-neutral-500 uppercase tracking-wide">
                  Entry Fee:
                </span>
                <div className="inline-flex items-center gap-1 font-black text-xs sm:text-[13px] text-neutral-900">
                  {isPaid ? (
                    <>
                      <GoldenCoinIcon size={15} />
                      <span>{entryFeeStr}</span>
                    </>
                  ) : (
                    <span className="text-emerald-600 font-black">FREE</span>
                  )}
                </div>
              </div>
            </div>

            {/* Row 3: Match Schedule */}
            <div className="bg-white border border-neutral-200/90 rounded-xl p-2.5 sm:p-3 text-center shadow-xs flex items-center justify-center gap-2">
              <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wide">
                Match Schedule:
              </span>
              <span className="text-xs sm:text-[13px] font-black text-neutral-900 tracking-tight">
                {scheduleFormatted}
              </span>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 5. PRIZE DETAILS                                                          */}
        {/* ========================================================================= */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-[#2563eb] tracking-wide">
              Prize Details
            </h3>
            <span className="text-[11px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              Total Pool: ₹{totalPrizePool}
            </span>
          </div>
          <div className="bg-white border border-neutral-200/90 rounded-2xl p-4 shadow-xs space-y-2.5 text-xs sm:text-[13px]">
            {prizeItems.map((item, i) => (
              <div key={i} className="flex items-center justify-between font-extrabold text-neutral-800 border-b border-neutral-100 pb-1.5 last:border-0 last:pb-0">
                <span className="uppercase text-neutral-700 tracking-wide">{item.label}</span>
                <span className="text-neutral-900 font-black">- {item.amount}</span>
              </div>
            ))}
            
            {/* Slot Policy Note */}
            <div className="pt-1 text-[11px] font-extrabold text-neutral-500 uppercase tracking-wider text-left">
              ONLY ON FULL SLOT
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 6. ABOUT THIS MATCH                                                       */}
        {/* ========================================================================= */}
        <div className="space-y-1.5 pt-1">
          <h3 className="text-sm font-black text-[#2563eb] tracking-wide">
            About this Match
          </h3>
          <div className="bg-white border border-neutral-200/90 rounded-2xl p-4 shadow-xs text-xs sm:text-[13px] font-semibold text-neutral-700 leading-relaxed whitespace-pre-line">
            {aboutDescription}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 7. RULES AND REGULATIONS                                                  */}
        {/* ========================================================================= */}
        <div className="space-y-1.5 pt-1">
          <h3 className="text-sm font-black text-[#2563eb] tracking-wide">
            Rules and Regulations
          </h3>
          <div className="bg-white border border-neutral-200/90 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3 text-xs sm:text-[13px] text-neutral-800 leading-relaxed font-medium">
            {rulesList.map((rule, idx) => {
              const isSubHeading = rule.endsWith(':-') || rule.startsWith('To ensure fair');
              if (isSubHeading) {
                return (
                  <p key={idx} className="font-bold text-neutral-900 pt-1">
                    {rule}
                  </p>
                );
              }
              return (
                <div key={idx} className="flex items-start gap-2.5">
                  <span className="text-blue-600 font-black text-sm leading-tight shrink-0">•</span>
                  <p className="flex-1 leading-snug">
                    {rule}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 8. VIEW ALL JOININGS BUTTON                                              */}
        {/* ========================================================================= */}
        <div className="pt-2">
          <button
            onClick={() => setShowAllJoiningsModal(true)}
            className="w-full py-3.5 sm:py-4 bg-[#d99b26] hover:bg-[#c68c20] active:scale-[0.98] text-white rounded-xl font-black text-xs sm:text-[13px] uppercase tracking-wider shadow-md shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
          >
            <Users size={16} />
            <span>VIEW ALL JOININGS ({playersCount}/{totalSlots})</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 9. STICKY / FIXED BOTTOM JOIN MATCH ACTION AREA                           */}
      {/* ========================================================================= */}
      <div className="fixed bottom-0 inset-x-0 max-w-lg mx-auto p-4 bg-white/95 backdrop-blur-md border-t border-neutral-200 shadow-2xl z-40">
        {isCompleted ? (
          <button
            disabled
            className="w-full py-3.5 bg-neutral-400 text-white rounded-xl font-black text-sm uppercase tracking-wider cursor-not-allowed"
          >
            COMPLETED
          </button>
        ) : isOngoing ? (
          <div className="flex gap-2">
            {isJoined && (matchData.roomId || matchData.roomPassword) ? (
              <button
                onClick={() => setShowRoomDetailsModal(true)}
                className="flex-1 py-3.5 bg-amber-500 hover:bg-amber-600 active:scale-98 text-white rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg shadow-amber-500/25 flex items-center justify-center gap-1.5"
              >
                <Key size={16} />
                <span>VIEW ROOM ID & PASSWORD</span>
              </button>
            ) : (
              <button
                disabled
                className="w-full py-3.5 bg-red-600 text-white rounded-xl font-black text-sm uppercase tracking-wider cursor-not-allowed animate-pulse"
              >
                MATCH STARTED
              </button>
            )}
          </div>
        ) : isJoined ? (
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(Page.JOIN_MATCH, matchId)}
              className="flex-1 py-3.5 bg-[#45c4a0] hover:bg-[#3db392] active:scale-98 text-white rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 size={16} />
              <span>JOINED (VIEW SLOTS)</span>
            </button>
            {(matchData.roomId || matchData.roomPassword) && (
              <button
                onClick={() => setShowRoomDetailsModal(true)}
                className="px-4 py-3.5 bg-[#0a1835] hover:bg-[#111f3d] text-white rounded-xl font-black text-xs uppercase tracking-wider border border-white/10"
              >
                <Key size={16} />
              </button>
            )}
          </div>
        ) : isFull ? (
          <button
            disabled
            className="w-full py-3.5 bg-neutral-400 text-white rounded-xl font-black text-sm uppercase tracking-wider cursor-not-allowed"
          >
            MATCH FULL
          </button>
        ) : (
          <button
            onClick={() => onPageChange(Page.JOIN_MATCH, matchId)}
            className="w-full py-3.5 sm:py-4 bg-[#45c4a0] hover:bg-[#3db392] active:scale-98 text-white rounded-xl font-black text-sm sm:text-base uppercase tracking-wider shadow-xl shadow-emerald-500/30 transition-transform flex items-center justify-center gap-2"
          >
            <Swords size={18} />
            <span>JOIN MATCH</span>
          </button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL: VIEW ALL JOININGS                                                  */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {showAllJoiningsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
            onClick={() => setShowAllJoiningsModal(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              className="w-full max-w-sm bg-white rounded-3xl p-5 text-neutral-900 shadow-2xl relative overflow-hidden flex flex-col max-h-[85vh] border border-neutral-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-amber-500/10 text-[#d99b26] rounded-xl">
                    <Users size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase text-neutral-900">
                      All Registered Players
                    </h3>
                    <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                      {playersCount} of {totalSlots} Slots Filled
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setShowAllJoiningsModal(false)}
                  className="p-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 rounded-full transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Search Box */}
              <div className="my-3 relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Search player name, IGN, or slot #..."
                  value={joiningsSearch}
                  onChange={(e) => setJoiningsSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-neutral-100 border border-neutral-200 rounded-xl text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Players List */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 divide-y divide-neutral-100">
                {players.length === 0 ? (
                  <div className="py-12 text-center text-neutral-400">
                    <Users size={32} className="mx-auto mb-2 opacity-40 text-neutral-400" />
                    <p className="text-xs font-bold uppercase tracking-wider">No players joined yet</p>
                    <p className="text-[10px] text-neutral-500 mt-0.5">Be the first player to join this match!</p>
                  </div>
                ) : filteredPlayers.length === 0 ? (
                  <div className="py-8 text-center text-neutral-400">
                    <p className="text-xs font-bold">No players matching "{joiningsSearch}"</p>
                  </div>
                ) : (
                  filteredPlayers.map((player, idx) => (
                    <div key={idx} className="pt-2 first:pt-0 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center font-black text-[11px] text-blue-700">
                          #{player.slot || idx + 1}
                        </div>
                        <div>
                          <p className="font-extrabold text-neutral-900 leading-tight">
                            {player.ign || player.username || 'Gamer'}
                          </p>
                          <p className="text-[10px] font-semibold text-neutral-500">
                            {player.username ? `@${player.username}` : `Player ${idx + 1}`}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                        CONFIRMED
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* Modal Footer */}
              <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center justify-between text-xs">
                <span className="font-bold text-neutral-500">Total Joined: {playersCount}</span>
                <button
                  onClick={() => setShowAllJoiningsModal(false)}
                  className="px-4 py-2 bg-neutral-900 text-white rounded-xl font-bold text-xs uppercase"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL: ROOM ID & PASSWORD (FOR JOINED PLAYERS)                            */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {showRoomDetailsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs"
            onClick={() => setShowRoomDetailsModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-[#0a1835] border border-[#1e3461] rounded-3xl p-6 text-white shadow-2xl relative text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowRoomDetailsModal(false)}
                className="absolute top-4 right-4 p-1.5 text-neutral-400 hover:text-white bg-white/5 rounded-full"
              >
                <X size={18} />
              </button>

              <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto mb-4">
                <Key size={26} />
              </div>

              <h3 className="text-base font-black uppercase text-white mb-1">
                Room Details
              </h3>
              <p className="text-xs text-neutral-400 mb-5">
                Join the custom room in Free Fire before match time
              </p>

              <div className="space-y-3 bg-[#050c1c] border border-white/10 rounded-2xl p-4 text-left text-xs mb-5">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-neutral-400 font-bold uppercase text-[11px]">Room ID:</span>
                  <span className="font-mono font-black text-amber-300 text-sm tracking-wider select-all">
                    {matchData.roomId || 'Available 15 min before'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400 font-bold uppercase text-[11px]">Room Password:</span>
                  <span className="font-mono font-black text-emerald-300 text-sm tracking-wider select-all">
                    {matchData.roomPassword || 'Available 15 min before'}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setShowRoomDetailsModal(false)}
                className="w-full py-3 bg-[#45c4a0] hover:bg-[#3db392] text-white rounded-xl font-black text-xs uppercase tracking-wider"
              >
                GOT IT
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
