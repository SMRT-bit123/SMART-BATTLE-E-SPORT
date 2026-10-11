import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Loader2, Gamepad, X, Trophy, Star, Plus } from 'lucide-react';
import { Page, Tournament } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import RulesModal from '../components/RulesModal';
import SafeImage from '../components/SafeImage';

interface TournamentListProps {
  onPageChange: (page: Page, id?: string) => void;
  selectedGameId?: string | null;
  joinedMatchIds: string[];
}

// Reusable Golden Coin Component for ₹ Token / Coins
function GoldenCoinIcon({ size = 16 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-gradient-to-br from-amber-300 via-amber-500 to-yellow-600 p-[1px] shadow-xs flex items-center justify-center shrink-0"
    >
      <div className="w-full h-full rounded-full bg-gradient-to-tr from-amber-600 to-yellow-400 flex items-center justify-center text-black font-black text-[9px] leading-none select-none">
        ₹
      </div>
    </div>
  );
}

// Format tournament date/time string to "Time : DD/MM/YYYY at hh:mm A"
function formatTournamentSchedule(timeStr?: string) {
  if (!timeStr) return 'Time : 21/08/2026 at 08:00 AM';
  try {
    const d = new Date(timeStr);
    if (isNaN(d.getTime())) {
      return `Time : ${timeStr}`;
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
    return `Time : ${day}/${month}/${year} at ${strHours}:${minutes} ${ampm}`;
  } catch {
    return `Time : ${timeStr}`;
  }
}

// Default Fallback Esports artwork based on Section/Mode
function getDefaultEsportsImage(section?: string, mode?: string) {
  const s = (section || '').toLowerCase();
  const m = (mode || '').toLowerCase();

  if (s.includes('clash') || m.includes('cs')) {
    return 'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1200&auto=format&fit=crop';
  }
  if (s.includes('lone') || m.includes('wolf')) {
    return 'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?q=80&w=1200&auto=format&fit=crop';
  }
  if (m.includes('survival') || m.includes('solo')) {
    return 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=1200&auto=format&fit=crop';
  }
  return 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop';
}

export default function Tournaments({ onPageChange, joinedMatchIds }: TournamentListProps) {
  const { gameId } = useParams();
  const [searchParams] = useSearchParams();
  const selectedGameId = gameId;
  const selectedModeId = searchParams.get('mode');
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [gameModes, setGameModes] = useState<{ id: string; title: string; category?: string; subtitle?: string; gameId?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPrizeMatch, setSelectedPrizeMatch] = useState<Tournament | null>(null);
  const [selectedResultsMatch, setSelectedResultsMatch] = useState<Tournament | null>(null);
  const [selectedRulesMatch, setSelectedRulesMatch] = useState<Tournament | null>(null);
  const [matchResults, setMatchResults] = useState<any>(null);
  const [loadingResults, setLoadingResults] = useState(false);

  // Tabs: Ongoing, Upcoming, Resulted
  const statusParam = searchParams.get('status') as 'upcoming' | 'ongoing' | 'completed' | null;
  const [activeTab, setActiveTab] = useState<'upcoming' | 'ongoing' | 'completed'>(statusParam || 'upcoming');
  const [showIdPass, setShowIdPass] = useState<{ isOpen: boolean; roomId?: string; roomPass?: string }>({ isOpen: false });

  useEffect(() => {
    if (statusParam && (statusParam === 'upcoming' || statusParam === 'ongoing' || statusParam === 'completed')) {
      setActiveTab(statusParam);
    }
  }, [statusParam]);

  const handleCopy = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
  };

  // Derive page title accurately based on the active section / mode
  const getPageTitle = () => {
    if (selectedModeId) {
      const modeIdLower = selectedModeId.toLowerCase().trim();
      const modeIdClean = modeIdLower.replace(/[_-]/g, ' ').trim();

      // 1. Check direct match in Firestore gameModes collection
      const directMode = gameModes.find(
        m => m.id === selectedModeId || m.id.toLowerCase() === modeIdLower
      );
      if (directMode && directMode.title) {
        const titleUpper = directMode.title.trim().toUpperCase();
        return titleUpper.endsWith('CONTESTS') || titleUpper.endsWith('CONTEST')
          ? titleUpper
          : `${titleUpper} CONTESTS`;
      }

      // 2. Fuzzy match in gameModes (by title, subtitle, or category)
      const fuzzyMode = gameModes.find(m => {
        const titleL = (m.title || '').toLowerCase().replace(/[_-]/g, ' ').trim();
        const subL = (m.subtitle || '').toLowerCase().replace(/[_-]/g, ' ').trim();
        const catL = (m.category || '').toLowerCase().replace(/[_-]/g, ' ').trim();
        return (
          titleL === modeIdClean ||
          subL === modeIdClean ||
          catL === modeIdClean ||
          (titleL && modeIdClean.includes(titleL)) ||
          (subL && modeIdClean.includes(subL)) ||
          (catL && modeIdClean.includes(catL))
        );
      });
      if (fuzzyMode && fuzzyMode.title) {
        const titleUpper = fuzzyMode.title.trim().toUpperCase();
        return titleUpper.endsWith('CONTESTS') || titleUpper.endsWith('CONTEST')
          ? titleUpper
          : `${titleUpper} CONTESTS`;
      }

      // 3. Match from tournaments list matching this mode
      const matchedTournament = tournaments.find(m => {
        const mModeId = (m.modeId || '').toLowerCase();
        const mSection = (m.section || '').toLowerCase();
        const mMode = (m.mode || '').toLowerCase();
        const mTitle = (m.title || '').toLowerCase();
        return (
          mModeId === modeIdLower ||
          mSection === modeIdClean ||
          mMode === modeIdClean ||
          mTitle.includes(modeIdClean)
        );
      });

      if (matchedTournament) {
        const s = (matchedTournament.section || '').trim().toUpperCase();
        const mod = (matchedTournament.mode || '').trim().toUpperCase();
        // If section is specific (e.g. HEADSHOT, CS 1V1, LONE WOLF, CUSTOM ROOM)
        if (s && s !== 'BATTLE ROYALE' && !modeIdLower.startsWith('br_')) {
          return s.endsWith('CONTESTS') || s.endsWith('CONTEST') ? s : `${s} CONTESTS`;
        }
        if (mod && mod !== 'SOLO' && mod !== 'DUO' && mod !== 'SQUAD' && mod !== '48') {
          return mod.endsWith('CONTESTS') || mod.endsWith('CONTEST') ? mod : `${mod} CONTESTS`;
        }
      }

      // 4. Format clean slug (e.g. "headshot" -> "HEADSHOT CONTESTS", "cs_1v1" -> "CS 1V1 CONTESTS", "br_solo" -> "BR SOLO CONTESTS")
      let cleanSlug = selectedModeId.replace(/[_-]/g, ' ').trim().toUpperCase();
      if (cleanSlug.startsWith('BR ') || cleanSlug.startsWith('CS ') || cleanSlug.startsWith('LONE WOLF ')) {
        return cleanSlug.endsWith('CONTESTS') || cleanSlug.endsWith('CONTEST')
          ? cleanSlug
          : `${cleanSlug} CONTESTS`;
      }

      return cleanSlug.endsWith('CONTESTS') || cleanSlug.endsWith('CONTEST')
        ? cleanSlug
        : `${cleanSlug} CONTESTS`;
    }

    // 5. If no mode filter is provided, check if all current filtered matches share the exact same section
    if (filteredMatches.length > 0) {
      const firstSection = (filteredMatches[0].section || '').trim().toUpperCase();
      const allSame = filteredMatches.every(
        m => (m.section || '').trim().toUpperCase() === firstSection
      );
      if (allSame && firstSection && firstSection !== 'BATTLE ROYALE') {
        return firstSection.endsWith('CONTESTS') || firstSection.endsWith('CONTEST')
          ? firstSection
          : `${firstSection} CONTESTS`;
      }
    }

    if (selectedGameId) {
      const g = selectedGameId.toLowerCase();
      if (g.includes('free')) return 'FREE MATCH CONTESTS';
      if (g.includes('headshot')) return 'CS HEADSHOT CONTESTS';
      if (g.includes('cs') || g.includes('clash')) return 'CLASH SQUAD CONTESTS';
      if (g.includes('wolf')) return 'LONE WOLF CONTESTS';
      if (g.includes('survival')) return 'BR SURVIVAL CONTESTS';
      if (g.includes('freefire')) return 'BR FULL MAP CONTESTS';
    }

    return 'BR FULL MAP CONTESTS';
  };

  const filteredMatches = tournaments.filter(m => {
    const status = m.status || 'upcoming';
    // Handle legacy 'active' status
    if (status === 'active' && activeTab === 'upcoming') return true;

    // Status filter
    if (status !== activeTab) return false;

    // Mode filter (if provided)
    if (selectedModeId) {
      const modeId = selectedModeId.toLowerCase().trim();
      const modeClean = modeId.replace(/[_-]/g, ' ').trim();

      // Exact modeId match
      if (m.modeId && m.modeId.toLowerCase() === modeId) {
        return true;
      }

      // Check against dynamic gameModes
      const matchedGameMode = gameModes.find(gm => gm.id.toLowerCase() === modeId || gm.id === selectedModeId);
      if (matchedGameMode) {
        const gmTitleL = (matchedGameMode.title || '').toLowerCase();
        const gmSubL = (matchedGameMode.subtitle || '').toLowerCase();
        const gmCatL = (matchedGameMode.category || '').toLowerCase();

        if (
          (m.modeId && m.modeId === matchedGameMode.id) ||
          (m.mode && m.mode.toLowerCase() === gmTitleL) ||
          (m.section && (
            m.section.toLowerCase() === gmTitleL ||
            m.section.toLowerCase() === gmCatL ||
            m.section.toLowerCase() === gmSubL
          )) ||
          (m.title && m.title.toLowerCase().includes(gmTitleL))
        ) {
          return true;
        }
      }

      // Free Match Filters
      if (modeId === 'free_match' || modeId.includes('free')) {
        if (
          m.section?.toLowerCase().includes('free') ||
          m.mode?.toLowerCase().includes('free') ||
          m.entryFee === 0 ||
          (m.title && m.title.toLowerCase().includes('free'))
        ) {
          return true;
        }
      }
      // CS Headshot Filters
      else if (modeId === 'cs_headshot' || modeId.includes('headshot')) {
        if (
          m.section?.toLowerCase().includes('headshot') ||
          m.mode?.toLowerCase().includes('headshot') ||
          (m.title && m.title.toLowerCase().includes('headshot'))
        ) {
          return true;
        }
      }
      // Battle Royale Filters
      else if (modeId.startsWith('br_')) {
        if (m.section === 'Battle Royale' || !m.section) {
          const targetMode = modeId.replace('br_', '');
          if (m.mode?.toLowerCase() === targetMode || m.modeId?.toLowerCase().includes(targetMode)) return true;
        }
      }
      // Clash Squad Filters (Ignore cs_squad)
      else if (modeId === 'cs_squad' || modeId === 'freefire_cs_squad') {
        return false;
      }
      else if (modeId.startsWith('cs_')) {
        if (m.section === 'Clash Squad' || m.section === 'CS 1v1' || m.section === 'CS 2v2') {
          const targetMode = modeId.replace('cs_', '');
          if (m.mode?.toLowerCase() === targetMode || m.modeId?.toLowerCase().includes(targetMode)) return true;
        }
      }
      // Lone Wolf Filters
      else if (modeId.startsWith('lone_wolf_')) {
        if (m.section === 'Lone Wolf') {
          const targetMode = modeId.replace('lone_wolf_', '');
          if (m.mode?.toLowerCase() === targetMode || m.modeId?.toLowerCase().includes(targetMode)) return true;
        }
      }

      // Direct matches on mode, section, or title
      const modeLower = (m.mode || '').toLowerCase();
      const sectionLower = (m.section || '').toLowerCase();
      const titleLower = (m.title || '').toLowerCase();
      const mModeId = (m.modeId || '').toLowerCase();

      if (
        mModeId === modeId ||
        modeLower === modeId ||
        modeLower === modeClean ||
        sectionLower === modeId ||
        sectionLower === modeClean ||
        modeLower.includes(modeClean) ||
        sectionLower.includes(modeClean) ||
        titleLower.includes(modeClean) ||
        titleLower.includes(modeId)
      ) {
        return true;
      }

      return false;
    }

    return true;
  });

  useEffect(() => {
    if (selectedResultsMatch) {
      setLoadingResults(true);
      const fetchResults = async () => {
        try {
          const { getDocs, query, collection, where } = await import('firebase/firestore');
          const resSnap = await getDocs(query(collection(db, 'matchResults'), where('matchId', '==', selectedResultsMatch.id)));
          if (!resSnap.empty) {
            setMatchResults(resSnap.docs[0].data());
          } else {
            alert('Results not found for this match.');
            setSelectedResultsMatch(null);
          }
        } catch (error) {
          console.error("Error fetching results:", error);
        } finally {
          setLoadingResults(false);
        }
      };
      fetchResults();
    } else {
      setMatchResults(null);
    }
  }, [selectedResultsMatch]);

  // Listen to gameModes collection for dynamic mode titles and icons
  useEffect(() => {
    const qModes = query(collection(db, 'gameModes'), orderBy('order', 'asc'));
    const unsubModes = onSnapshot(
      qModes,
      (snapshot) => {
        const modesData = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        })) as { id: string; title: string; category?: string; subtitle?: string; gameId?: string }[];
        setGameModes(modesData);
      },
      (error) => {
        console.warn('Error fetching game modes for Tournaments page:', error);
      }
    );

    return () => unsubModes();
  }, []);

  useEffect(() => {
    const q = selectedGameId
      ? query(collection(db, 'matches'), where('gameId', '==', selectedGameId), orderBy('createdAt', 'desc'))
      : query(collection(db, 'matches'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Tournament[];
      setTournaments(data);
      setLoading(false);
    }, (error) => {
      if (error.message.includes('index')) {
        onSnapshot(collection(db, 'matches'), (snap) => {
          setTournaments(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Tournament));
          setLoading(false);
        }, (err) => handleFirestoreError(err, OperationType.LIST, 'matches'));
      } else {
        handleFirestoreError(error, OperationType.LIST, 'matches');
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [selectedGameId]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center pt-24 bg-[#081226]">
        <Loader2 size={32} className="text-cyan-400 animate-spin mb-4" />
        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Loading contests...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070e20] text-white pb-24 max-w-lg mx-auto select-none">
      {/* 1. Page Header (Exact Blue/Dark Gaming Header with Back Button) */}
      <header className="sticky top-0 z-40 bg-[#0a1835] border-b border-[#142850] shadow-md">
        <div className="flex items-center justify-between px-4 py-3.5">
          <button
            onClick={() => onPageChange(Page.HOME)}
            className="p-1 -ml-1 text-white hover:text-cyan-400 active:scale-95 transition-transform"
            aria-label="Back to home"
          >
            <ChevronLeft size={26} className="stroke-[2.5]" />
          </button>

          <h1 className="text-base sm:text-lg font-black uppercase tracking-tight text-white text-center flex-1 pr-6">
            {getPageTitle()}
          </h1>
        </div>

        {/* 2. Three Tabs: Ongoing | Upcoming | Resulted with Active Underline */}
        <div className="flex items-center justify-between border-t border-[#122347] bg-[#0a1835] px-2">
          {/* Ongoing Tab */}
          <button
            onClick={() => setActiveTab('ongoing')}
            className={`flex-1 py-3 text-center text-xs sm:text-[13px] font-bold tracking-wide transition-all relative ${
              activeTab === 'ongoing'
                ? 'text-white'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <span>Ongoing</span>
            {activeTab === 'ongoing' && (
              <motion.div
                layoutId="tournamentActiveTabUnderline"
                className="absolute bottom-0 inset-x-4 h-[2.5px] bg-white rounded-t-full shadow-sm"
              />
            )}
          </button>

          {/* Upcoming Tab */}
          <button
            onClick={() => setActiveTab('upcoming')}
            className={`flex-1 py-3 text-center text-xs sm:text-[13px] font-bold tracking-wide transition-all relative ${
              activeTab === 'upcoming'
                ? 'text-white'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <span>Upcoming</span>
            {activeTab === 'upcoming' && (
              <motion.div
                layoutId="tournamentActiveTabUnderline"
                className="absolute bottom-0 inset-x-4 h-[2.5px] bg-white rounded-t-full shadow-sm"
              />
            )}
          </button>

          {/* Resulted Tab */}
          <button
            onClick={() => setActiveTab('completed')}
            className={`flex-1 py-3 text-center text-xs sm:text-[13px] font-bold tracking-wide transition-all relative ${
              activeTab === 'completed'
                ? 'text-white'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <span>Resulted</span>
            {activeTab === 'completed' && (
              <motion.div
                layoutId="tournamentActiveTabUnderline"
                className="absolute bottom-0 inset-x-4 h-[2.5px] bg-white rounded-t-full shadow-sm"
              />
            )}
          </button>
        </div>
      </header>

      {/* 3. Tournament Cards Container */}
      <div className="px-4 py-4 sm:px-5 sm:py-5 space-y-5">
        {filteredMatches.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center bg-[#09152b] rounded-3xl border border-dashed border-[#1a315e] px-6 text-center">
            <Gamepad size={36} className="text-[#203c74] mb-3" />
            <p className="text-xs font-black uppercase tracking-widest text-neutral-400">
              No {activeTab === 'completed' ? 'resulted' : activeTab} tournaments found
            </p>
            <p className="text-[10px] text-neutral-500 mt-1 font-medium">
              Check back soon for new battleground contests!
            </p>
          </div>
        ) : (
          filteredMatches.map((t, idx) => {
            const isJoined = joinedMatchIds.includes(t.id);
            const isOngoing = t.status === 'ongoing';
            const isCompleted = t.status === 'completed';

            // Calculate Prize Pool Number
            const getCalculatedPrizePool = () => {
              if (t.prizePool && Number(t.prizePool) > 0) return Number(t.prizePool);
              if (t.prizeDistribution && Object.keys(t.prizeDistribution).length > 0) {
                const total = (Object.values(t.prizeDistribution) as any[]).reduce((sum: number, val: any) => sum + (Number(val) || 0), 0);
                if (total > 0) return total;
              }
              if (t.prize) {
                const parsed = parseInt(String(t.prize).replace(/[^0-9]/g, ''));
                if (!isNaN(parsed) && parsed > 0) return parsed;
              }
              return 300;
            };

            const prizePoolNum = getCalculatedPrizePool();

            // Calculate Winning System (PER KILL: ₹0 for survival/rank, perKillAmount for perKill)
            const getWinningSystemInfo = () => {
              if (t.prizeType === 'survival') {
                return {
                  label: 'PER KILL',
                  value: 0
                };
              }
              if (t.prizeType === 'perKill') {
                return {
                  label: 'PER KILL',
                  value: Number(t.perKillAmount) || 0
                };
              }
              // If prizeType is not explicitly set, check perKillAmount
              if (t.perKillAmount && Number(t.perKillAmount) > 0) {
                return {
                  label: 'PER KILL',
                  value: Number(t.perKillAmount)
                };
              }
              return {
                label: 'PER KILL',
                value: 0
              };
            };

            const winningInfo = getWinningSystemInfo();

            // Slots & Progress calculations
            const totalSlots = t.totalSlots || t.maxPlayers || 48;
            const playersCount = t.playersCount || (t.players ? t.players.length : 0);
            const spotsLeft = Math.max(0, totalSlots - playersCount);
            const progressPercentage = Math.min(100, Math.max(0, (playersCount / totalSlots) * 100));

            // Dynamic title with displayId
            const displayTitle = () => {
              let title = t.title || 'BR SOLO BATTLE';
              const idTag = t.displayId ? `${t.displayId}` : (t as any).matchNumber ? `#${(t as any).matchNumber}` : '';
              if (idTag && !title.includes(idTag)) {
                return `${title} ${idTag}`;
              }
              return title;
            };

            // Map and section names
            const mapName = (t.map || 'BERMUDA').toUpperCase();
            const typeName = (t.section || 'BATTLE ROYALE').toUpperCase();
            const entryFeeValue = t.entryFee !== undefined && t.entryFee !== null ? t.entryFee : 5;
            const entryPerPlayer = entryFeeValue;

            // Tournament banner image
            const cardImage = t.image || getDefaultEsportsImage(t.section, t.mode);

            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
                onClick={() => onPageChange(Page.MATCH_DETAILS, t.id)}
                className="w-full rounded-2xl overflow-hidden shadow-2xl bg-white flex flex-col border border-neutral-200 cursor-pointer hover:border-blue-400/50 hover:shadow-blue-500/10 transition-all duration-200"
              >
                {/* A) IMAGE SECTION — approximately 30% of total card height */}
                <div
                  className="relative w-full aspect-[16/7.5] sm:aspect-[16/7] bg-[#070e20] overflow-hidden cursor-pointer"
                >
                  <SafeImage
                    src={cardImage}
                    alt={t.title || 'Tournament'}
                    className="w-full h-full object-cover"
                    imgClassName="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                  />

                  {/* Joined Badge if user has joined */}
                  {isJoined && (
                    <div className="absolute top-2.5 right-2.5 z-10 bg-emerald-600/90 backdrop-blur-xs text-white text-[9px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-md">
                      Joined
                    </div>
                  )}
                </div>

                {/* B) DETAILS SECTION — approximately 70% of total card height */}
                <div className="p-4 sm:p-5 bg-white text-neutral-900 flex flex-col justify-between">
                  {/* Tournament Title */}
                  <h3
                    className="text-[14px] sm:text-base font-extrabold uppercase tracking-tight text-neutral-900 leading-snug cursor-pointer hover:text-blue-600 transition-colors"
                  >
                    {displayTitle()}
                  </h3>

                  {/* Time Row */}
                  <p className="text-[11.5px] sm:text-xs font-semibold text-neutral-600 mt-1 mb-3.5">
                    {formatTournamentSchedule(t.time)}
                  </p>

                  {/* 3-Column Top Information Row: PRIZE POOL | PER KILL | ENTRY FEE */}
                  <div className="grid grid-cols-3 gap-2 py-2.5 border-t border-neutral-100">
                    {/* PRIZE POOL */}
                    <div
                      className="flex flex-col items-center justify-center text-center cursor-pointer group/prize py-0.5 px-1 rounded-lg hover:bg-neutral-50 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPrizeMatch(t);
                      }}
                    >
                      <div className="flex items-center gap-1">
                        <span className="text-[9.5px] sm:text-[10.5px] font-bold text-neutral-500 uppercase tracking-wide group-hover/prize:text-blue-600 transition-colors">
                          PRIZE POOL
                        </span>
                        <Trophy size={10} className="text-amber-500" />
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <GoldenCoinIcon size={17} />
                        <span className="text-sm sm:text-base font-black text-neutral-900 leading-none">
                          {prizePoolNum}
                        </span>
                      </div>
                    </div>

                    {/* PER KILL / SURVIVAL */}
                    <div className="flex flex-col items-center justify-center text-center">
                      <span className="text-[9.5px] sm:text-[10.5px] font-bold text-neutral-500 uppercase tracking-wide">
                        {winningInfo.label}
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <GoldenCoinIcon size={17} />
                        <span className="text-sm sm:text-base font-black text-neutral-900 leading-none">
                          {winningInfo.value}
                        </span>
                      </div>
                    </div>

                    {/* ENTRY FEE */}
                    <div className="flex flex-col items-center justify-center text-center">
                      <span className="text-[9.5px] sm:text-[10.5px] font-bold text-neutral-500 uppercase tracking-wide">
                        ENTRY FEE
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <GoldenCoinIcon size={17} />
                        <span className="text-sm sm:text-base font-black text-neutral-900 leading-none">
                          {entryFeeValue === 0 ? 'FREE' : entryFeeValue}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 3-Column Bottom Information Row: TYPE | ENTRY PER PLAYER | MAP */}
                  <div className="grid grid-cols-3 gap-2 py-2.5 border-t border-neutral-100">
                    {/* TYPE */}
                    <div className="flex flex-col items-center justify-center text-center">
                      <span className="text-[9.5px] sm:text-[10.5px] font-bold text-neutral-500 uppercase tracking-wide">
                        TYPE
                      </span>
                      <span className="text-[11px] sm:text-xs font-black uppercase text-neutral-900 mt-0.5 leading-tight">
                        {typeName}
                      </span>
                    </div>

                    {/* ENTRY PER PLAYER */}
                    <div className="flex flex-col items-center justify-center text-center">
                      <span className="text-[9.5px] sm:text-[10.5px] font-bold text-neutral-500 uppercase tracking-wide">
                        ENTRY PER PLAYER
                      </span>
                      <span className="text-[11px] sm:text-xs font-black uppercase text-neutral-900 mt-0.5 leading-tight">
                        {entryPerPlayer === 0 ? 'FREE' : entryPerPlayer}
                      </span>
                    </div>

                    {/* MAP */}
                    <div className="flex flex-col items-center justify-center text-center">
                      <span className="text-[9.5px] sm:text-[10.5px] font-bold text-neutral-500 uppercase tracking-wide">
                        MAP
                      </span>
                      <span className="text-[11px] sm:text-xs font-black uppercase text-neutral-900 mt-0.5 leading-tight">
                        {mapName}
                      </span>
                    </div>
                  </div>

                  {/* Bottom Section: Progress Bar, Spots Count, and Join Button */}
                  <div className="mt-3.5 pt-3 border-t border-neutral-100 flex items-center justify-between gap-3 sm:gap-4">
                    {/* Slots & Progress Bar (Left) */}
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => onPageChange(Page.MATCH_DETAILS, t.id)}
                    >
                      {/* Horizontal Progress Bar */}
                      <div className="w-full h-1.5 bg-neutral-200 rounded-full overflow-hidden mb-1">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${progressPercentage}%` }}
                          className="h-full bg-amber-400 rounded-full"
                        />
                      </div>

                      {/* Text below progress bar */}
                      <div className="flex items-center justify-between">
                        <span className="text-[10.5px] sm:text-[11.5px] font-bold text-amber-500 leading-none">
                          {spotsLeft === 0
                            ? 'Match Full'
                            : spotsLeft === 1
                            ? 'Only 1 Spot Left'
                            : `Only ${spotsLeft} Spot Left`}
                        </span>
                        <span className="text-[10.5px] sm:text-[11.5px] font-bold text-amber-500 leading-none">
                          {playersCount}/{totalSlots}
                        </span>
                      </div>
                    </div>

                    {/* Prominent Action Button (Right) */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isCompleted) {
                          if (isJoined) {
                            setSelectedResultsMatch(t);
                            return;
                          }
                        } else if (isOngoing) {
                          if (isJoined) {
                            setShowIdPass({ isOpen: true, roomId: t.roomId, roomPass: t.roomPassword });
                            return;
                          }
                        }
                        onPageChange(Page.MATCH_DETAILS, t.id);
                      }}
                      className={`px-6 sm:px-7 py-2 rounded-xl text-xs sm:text-sm font-bold tracking-wide shadow-md transition-all shrink-0 active:scale-95 ${
                        isCompleted
                          ? isJoined
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                            : 'bg-neutral-300 text-neutral-600 cursor-default'
                          : isOngoing
                          ? isJoined
                            ? 'bg-amber-500 hover:bg-amber-600 text-white animate-pulse'
                            : 'bg-neutral-300 text-neutral-600 cursor-not-allowed'
                          : isJoined
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          : 'bg-[#4285f4] hover:bg-[#3367d6] text-white'
                      }`}
                    >
                      {isCompleted
                        ? isJoined
                          ? 'Results'
                          : 'Finished'
                        : isOngoing
                        ? isJoined
                          ? 'ID Pass'
                          : 'Live'
                        : isJoined
                        ? 'Joined'
                        : 'Join'}
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

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
              className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/85 backdrop-blur-xs"
              onClick={() => setSelectedPrizeMatch(null)}
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="w-full max-w-sm bg-[#09152b] border border-[#1b3464] rounded-3xl p-5 shadow-2xl relative overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="absolute top-4 right-4">
                  <button
                    onClick={() => setSelectedPrizeMatch(null)}
                    className="p-1.5 bg-[#122347] text-neutral-400 rounded-xl hover:text-white transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="flex items-center gap-3.5 mb-4">
                  <div className="w-11 h-11 rounded-2xl bg-amber-500/15 flex items-center justify-center text-amber-400 border border-amber-500/30 shrink-0 shadow-inner">
                    <Trophy size={22} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-tight text-white">Prize Breakdown</h3>
                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider truncate max-w-[200px]">
                      {selectedPrizeMatch.title}
                    </p>
                  </div>
                </div>

                {/* Summary Banner */}
                <div className="bg-[#0e2042] border border-[#1e3c75] rounded-2xl p-3.5 mb-4 grid grid-cols-2 gap-2 text-center">
                  <div className="border-r border-[#1e3c75] pr-2">
                    <span className="text-[9.5px] font-bold uppercase tracking-wider text-neutral-400 block">
                      Total Prize Pool
                    </span>
                    <div className="flex items-center justify-center gap-1 mt-0.5">
                      <GoldenCoinIcon size={16} />
                      <span className="text-base font-black text-amber-400">
                        {displayTotalPool}
                      </span>
                    </div>
                  </div>
                  <div className="pl-2 flex flex-col justify-center">
                    <span className="text-[9.5px] font-bold uppercase tracking-wider text-neutral-400 block">
                      {isSurvival ? 'Per Kill Reward' : 'Per Kill'}
                    </span>
                    <span className="text-base font-black text-emerald-400 mt-0.5">
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
                <div className="max-h-[42vh] overflow-y-auto no-scrollbar space-y-2 pr-0.5">
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
                          className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                            isFirst
                              ? 'bg-amber-500/10 border-amber-500/30'
                              : 'bg-[#0d1e3d] border-[#1b3464]'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`text-[11px] font-black w-7 ${isFirst ? 'text-amber-400' : 'text-neutral-400'}`}>
                              #{pos}
                            </span>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-200">
                              {rankTitle}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 font-black text-sm text-emerald-400">
                            <GoldenCoinIcon size={14} />
                            <span>{amount}</span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] font-black text-amber-400 w-7">#1</span>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-200">
                          1st Place (Winner)
                        </span>
                      </div>
                      <div className="flex items-center gap-1 font-black text-sm text-emerald-400">
                        <GoldenCoinIcon size={14} />
                        <span>{displayTotalPool}</span>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setSelectedPrizeMatch(null)}
                  className="w-full h-10 bg-[#122347] hover:bg-[#1a315e] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all mt-4"
                >
                  Close
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
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/85 backdrop-blur-xs"
            onClick={() => setSelectedResultsMatch(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-sm bg-[#09152b] border border-[#1b3464] rounded-3xl p-6 shadow-2xl relative overflow-hidden flex flex-col max-h-[85vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6 relative">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-400 border border-amber-500/20">
                    <Trophy size={22} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-tight text-white line-clamp-1">{selectedResultsMatch.title}</h3>
                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Match Results View</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedResultsMatch(null)}
                  className="p-1.5 bg-[#122347] text-neutral-400 rounded-xl hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {loadingResults ? (
                <div className="flex-1 flex flex-col items-center justify-center py-16">
                  <Loader2 size={28} className="text-cyan-400 animate-spin mb-3" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Fetching standings...</p>
                </div>
              ) : matchResults ? (
                <div className="flex-1 overflow-hidden flex flex-col">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-2 gap-2.5 mb-4">
                    <div className="p-3 bg-[#0d1e3d] rounded-xl border border-[#1b3464]">
                      <p className="text-[8px] font-bold uppercase text-neutral-400 tracking-wider mb-0.5">Participants</p>
                      <p className="text-sm font-black text-white">{matchResults.results?.length || 0}</p>
                    </div>
                    <div className="p-3 bg-[#0d1e3d] rounded-xl border border-[#1b3464]">
                      <p className="text-[8px] font-bold uppercase text-neutral-400 tracking-wider mb-0.5">Total Distributed</p>
                      <p className="text-sm font-black text-emerald-400">
                        ₹{((matchResults.results || []).reduce((sum: number, r: any) => sum + (r.winningAmount || 0), 0) || 0).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto no-scrollbar space-y-2.5 pr-1">
                    {matchResults.results
                      ?.sort((a: any, b: any) => {
                        const isSurvival = matchResults.prizeType === 'survival' || matchResults.section !== 'Battle Royale';
                        if (isSurvival) return a.rankOrKills - b.rankOrKills;
                        return b.rankOrKills - a.rankOrKills;
                      })
                      .map((res: any, idx: number) => {
                        const isWinner = res.rankOrKills === 1 && (matchResults.prizeType === 'survival' || matchResults.section !== 'Battle Royale');

                        return (
                          <div
                            key={`${res.userId}_${res.slot || idx}`}
                            className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                              isWinner
                                ? 'bg-amber-500/10 border-amber-500/30'
                                : 'bg-[#0d1e3d] border-[#1b3464]'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black border ${
                                isWinner
                                  ? 'bg-amber-400 text-black border-amber-300'
                                  : 'bg-[#142850] text-neutral-300 border-white/10'
                              }`}>
                                {matchResults.prizeType === 'perKill' ? 'K' : `#${res.rankOrKills}`}
                              </div>
                              <div>
                                <h4 className={`text-xs font-bold ${isWinner ? 'text-amber-300' : 'text-white'}`}>
                                  {res.ign || res.username}
                                </h4>
                                {matchResults.prizeType === 'perKill' && (
                                  <p className="text-[8px] font-bold uppercase text-neutral-400 tracking-wider">
                                    {res.rankOrKills} Kills
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={`text-xs sm:text-sm font-black ${res.winningAmount > 0 ? 'text-emerald-400' : 'text-neutral-500'}`}>
                                {res.winningAmount > 0 ? `+₹${res.winningAmount}` : '₹0'}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center py-16">
                  <p className="text-xs text-neutral-400 font-medium">Results pending declaration</p>
                </div>
              )}

              <button
                onClick={() => setSelectedResultsMatch(null)}
                className="mt-5 w-full py-3 bg-[#122347] hover:bg-[#1a315e] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors"
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
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/85 backdrop-blur-xs"
            onClick={() => setShowIdPass({ isOpen: false })}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-sm bg-[#09152b] border border-[#1b3464] rounded-3xl p-6 shadow-2xl relative overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6 relative">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-400 border border-amber-500/20">
                    <Star size={22} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-tight text-white line-clamp-1">Room Credentials</h3>
                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Authorized Battleground Access</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowIdPass({ isOpen: false })}
                  className="p-1.5 bg-[#122347] text-neutral-400 rounded-xl hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3 mb-6 relative z-10">
                <div className="p-3.5 bg-[#0d1e3d] rounded-xl border border-[#1b3464]">
                  <p className="text-[8px] font-bold uppercase text-neutral-400 tracking-wider mb-1">Room ID</p>
                  <div className="flex items-center justify-between">
                    <p className="text-base font-black text-white tracking-widest">{showIdPass.roomId || 'PENDING'}</p>
                    <button
                      onClick={() => handleCopy(showIdPass.roomId || '')}
                      className="p-1.5 bg-[#142850] text-neutral-300 rounded-lg hover:text-white transition-colors"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                </div>
                <div className="p-3.5 bg-[#0d1e3d] rounded-xl border border-[#1b3464]">
                  <p className="text-[8px] font-bold uppercase text-neutral-400 tracking-wider mb-1">Password</p>
                  <div className="flex items-center justify-between">
                    <p className="text-base font-black text-white tracking-widest">{showIdPass.roomPass || 'PENDING'}</p>
                    <button
                      onClick={() => handleCopy(showIdPass.roomPass || '')}
                      className="p-1.5 bg-[#142850] text-neutral-300 rounded-lg hover:text-white transition-colors"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                </div>
              </div>

              <p className="text-[9px] text-amber-400/80 font-medium bg-amber-500/10 p-3 rounded-xl border border-amber-500/20 mb-6 leading-relaxed">
                Authorized access. Do not share room credentials. Multiple logins on the same credentials will trigger an anti-cheat flag.
              </p>

              <button
                onClick={() => setShowIdPass({ isOpen: false })}
                className="w-full py-3 bg-[#4285f4] hover:bg-[#3367d6] text-white text-xs font-bold uppercase tracking-wider rounded-xl active:scale-95 transition-transform shadow-md"
              >
                Enter Battle
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rules Modal */}
      <RulesModal
        isOpen={!!selectedRulesMatch}
        onClose={() => setSelectedRulesMatch(null)}
        section={selectedRulesMatch?.section || 'Battle Royale'}
        isJoined={joinedMatchIds.includes(selectedRulesMatch?.id || '')}
        onJoin={() => onPageChange(Page.JOIN_MATCH, selectedRulesMatch?.id || '')}
      />
    </div>
  );
}
