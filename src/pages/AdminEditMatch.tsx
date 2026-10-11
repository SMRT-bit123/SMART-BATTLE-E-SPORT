import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { useParams } from 'react-router-dom';
import { 
  ArrowLeft, Save, Loader2, Gamepad2, Map as MapIcon, Users as UsersIcon, 
  Clock, DollarSign, Trophy, Layers, ChevronDown, Image as ImageIcon, Upload, Trash2, CheckCircle2 
} from 'lucide-react';
import { Page, Tournament } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, getDoc, updateDoc, serverTimestamp, getDocs, collection, query, orderBy } from 'firebase/firestore';
import { GameMode } from './AdminModes';
import { uploadOriginalImage } from '../utils/imageCompressor';

interface AdminEditMatchProps {
  onPageChange: (page: Page) => void;
}

const DEFAULT_MODES_FALLBACK: GameMode[] = [
  { id: 'br_solo', gameId: 'freefire', title: 'BR SOLO', subtitle: 'Battle Royale', category: 'Battle Royale', image: '', order: 1 },
  { id: 'br_duo', gameId: 'freefire', title: 'BR DUO', subtitle: 'Battle Royale', category: 'Battle Royale', image: '', order: 2 },
  { id: 'br_squad', gameId: 'freefire', title: 'BR SQUAD', subtitle: 'Battle Royale', category: 'Battle Royale', image: '', order: 3 },
  { id: 'free_match', gameId: 'freefire', title: 'FREE MATCH', subtitle: 'Free Entry', category: 'Free Match', image: '', order: 4 },
  { id: 'cs_headshot', gameId: 'freefire', title: 'CS HEADSHOT', subtitle: 'Only Headshot', category: 'CS Headshot', image: '', order: 5 },
  { id: 'cs_solo', gameId: 'freefire', title: 'CS SOLO', subtitle: 'Clash Squad', category: 'Clash Squad', image: '', order: 6 },
  { id: 'cs_duo', gameId: 'freefire', title: 'CS DUO', subtitle: 'Clash Squad', category: 'Clash Squad', image: '', order: 7 },
  { id: 'lone_wolf_solo', gameId: 'freefire', title: 'LONE WOLF SOLO', subtitle: 'Lone Wolf', category: 'Lone Wolf', image: '', order: 8 },
  { id: 'lone_wolf_duo', gameId: 'freefire', title: 'LONE WOLF DUO', subtitle: 'Lone Wolf', category: 'Lone Wolf', image: '', order: 9 },
  { id: 'custom_room', gameId: 'freefire', title: 'CUSTOM ROOM', subtitle: 'Special Tournament', category: 'Custom Room', image: '', order: 10 },
];

const PRESET_MATCH_THUMBNAILS = [
  {
    name: 'Battle Royale Esports',
    url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop'
  },
  {
    name: 'Clash Squad 4v4',
    url: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1200&auto=format&fit=crop'
  },
  {
    name: 'Lone Wolf 1v1',
    url: 'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?q=80&w=1200&auto=format&fit=crop'
  },
  {
    name: 'Headshot / Sniper',
    url: 'https://images.unsplash.com/photo-1563089145-599997674d42?q=80&w=1200&auto=format&fit=crop'
  },
  {
    name: 'Survival Arena',
    url: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=1200&auto=format&fit=crop'
  },
  {
    name: 'Neon Tournament Stage',
    url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=1200&auto=format&fit=crop'
  }
];

export default function AdminEditMatch({ onPageChange }: AdminEditMatchProps) {
  const { id: matchId } = useParams();
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [availableModes, setAvailableModes] = useState<GameMode[]>(DEFAULT_MODES_FALLBACK);
  const [loadingModes, setLoadingModes] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [matchForm, setMatchForm] = useState({
    title: '',
    gameId: 'freefire',
    selectedModeDocId: 'br_solo',
    modeId: 'br_solo',
    image: '',
    entryFee: 0,
    prize: '',
    prizePool: 0,
    maxPlayers: 48,
    totalSlots: 48,
    time: '',
    map: '',
    mode: 'Solo',
    section: 'Battle Royale',
    prizeType: 'survival' as 'perKill' | 'survival',
    perKillAmount: 0,
    winnersCount: 1,
    prizeDistribution: {} as Record<number, number>,
    positionWinnersCount: 0,
    positionPrizeDistribution: {} as Record<number, number>
  });

  const GAME_MAPS = {
    'freefire': ['Bermuda', 'Purgatory', 'Kalahari', 'Alpine', 'NeXTerra', 'Bermuda Remastered']
  };

  // Fetch Dynamic Game Modes from Firestore
  useEffect(() => {
    const fetchGameModes = async () => {
      setLoadingModes(true);
      try {
        const q = query(collection(db, 'gameModes'), orderBy('order', 'asc'));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const list = snap.docs.map(d => ({ ...d.data() }) as GameMode);
          const filtered = list.filter(m => !matchForm.gameId || m.gameId === matchForm.gameId);
          if (filtered.length > 0) {
            setAvailableModes(filtered);
          }
        }
      } catch (err) {
        console.warn('Could not fetch custom game modes, using presets:', err);
      } finally {
        setLoadingModes(false);
      }
    };

    fetchGameModes();
  }, [matchForm.gameId]);

  useEffect(() => {
    if (!matchId) {
      onPageChange(Page.ADMIN);
      return;
    }

    const fetchMatch = async () => {
      try {
        const matchDoc = await getDoc(doc(db, 'matches', matchId));
        if (matchDoc.exists()) {
          const data = matchDoc.data() as Tournament;
          setMatchForm({
            title: data.title || '',
            gameId: data.gameId || 'freefire',
            selectedModeDocId: data.modeId || 'br_solo',
            modeId: data.modeId || 'br_solo',
            image: data.image || '',
            entryFee: data.entryFee || 0,
            prize: data.prize || '',
            prizePool: data.prizePool || 0,
            maxPlayers: data.maxPlayers || 48,
            totalSlots: data.totalSlots || 48,
            time: data.time || '',
            map: data.map || '',
            mode: data.mode || 'Solo',
            section: data.section || 'Battle Royale',
            prizeType: data.prizeType || 'survival',
            perKillAmount: data.perKillAmount || 0,
            winnersCount: data.winnersCount || 1,
            prizeDistribution: data.prizeDistribution || {},
            positionWinnersCount: data.positionWinnersCount || 0,
            positionPrizeDistribution: data.positionPrizeDistribution || {}
          });
        } else {
          alert('Match not found');
          onPageChange(Page.ADMIN);
        }
      } catch (e) {
        console.error('Error fetching match:', e);
        handleFirestoreError(e, OperationType.GET, `matches/${matchId}`);
      } finally {
        setLoading(false);
      }
    };

    fetchMatch();
  }, [matchId, onPageChange]);

  // Image Upload Handler (100% Original Quality, No Compression)
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    setUploadProgress(10);

    try {
      const uploadedUrl = await uploadOriginalImage(file, (progress) => {
        setUploadProgress(progress);
      });
      setMatchForm(prev => ({ ...prev, image: uploadedUrl }));
    } catch (err) {
      console.error('Image upload failed:', err);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSelectGameMode = (modeSlugOrId: string) => {
    const found = availableModes.find(m => m.id === modeSlugOrId || `${m.gameId}_${m.id}` === modeSlugOrId);
    
    if (found) {
      const titleUpper = found.title.toUpperCase();
      let derivedSection = found.category || found.subtitle || 'Battle Royale';
      let derivedMode = 'Solo';
      let derivedSlots = matchForm.totalSlots;

      if (titleUpper.includes('SOLO') || titleUpper.includes('1V1')) {
        derivedMode = 'Solo';
      } else if (titleUpper.includes('DUO') || titleUpper.includes('2V2')) {
        derivedMode = 'Duo';
      } else if (titleUpper.includes('SQUAD') || titleUpper.includes('4V4')) {
        derivedMode = 'Squad';
      } else {
        derivedMode = found.title;
      }

      if (titleUpper.includes('HEADSHOT')) {
        derivedSection = 'CS Headshot';
      } else if (titleUpper.includes('FREE')) {
        derivedSection = 'Free Match';
      } else if (titleUpper.includes('CS 1V1') || titleUpper.includes('1V1 DUEL')) {
        derivedSection = 'CS 1v1';
        derivedSlots = 2;
      } else if (titleUpper.includes('CS 2V2')) {
        derivedSection = 'CS 2v2';
        derivedSlots = 4;
      } else if (titleUpper.includes('CS') || titleUpper.includes('CLASH')) {
        derivedSection = 'Clash Squad';
        derivedSlots = 8;
      } else if (titleUpper.includes('LONE') || titleUpper.includes('WOLF')) {
        derivedSection = 'Lone Wolf';
        derivedSlots = derivedMode === 'Duo' ? 4 : 2;
      } else if (titleUpper.includes('CUSTOM')) {
        derivedSection = 'Custom Room';
        derivedSlots = 48;
      } else if (titleUpper.includes('FULL MAP') || titleUpper.includes('BR')) {
        derivedSection = 'Battle Royale';
        derivedSlots = 48;
      } else if (found.category || found.subtitle) {
        derivedSection = found.category || found.subtitle || 'Battle Royale';
      } else {
        derivedSection = found.title || 'Battle Royale';
      }

      setMatchForm(prev => ({
        ...prev,
        selectedModeDocId: found.id,
        modeId: found.id,
        section: derivedSection,
        mode: derivedMode,
        totalSlots: derivedSlots,
        image: prev.image || found.image || ''
      }));
    } else {
      setMatchForm(prev => ({
        ...prev,
        selectedModeDocId: modeSlugOrId,
        modeId: modeSlugOrId
      }));
    }
  };

  const handlePrizeDistributionChange = (rank: number, amount: number) => {
    setMatchForm(prev => ({
      ...prev,
      prizeDistribution: {
        ...prev.prizeDistribution,
        [rank]: amount
      }
    }));
  };

  const handleWinnersCountChange = (count: number) => {
    const newDist = { ...matchForm.prizeDistribution };
    Object.keys(newDist).forEach(rank => {
      if (Number(rank) > count) delete newDist[Number(rank)];
    });
    setMatchForm(prev => ({
      ...prev,
      winnersCount: count,
      prizeDistribution: newDist
    }));
  };

  const handlePositionPrizeDistributionChange = (rank: number, amount: number) => {
    setMatchForm(prev => ({
      ...prev,
      positionPrizeDistribution: {
        ...prev.positionPrizeDistribution,
        [rank]: amount
      }
    }));
  };

  const handlePositionWinnersCountChange = (count: number) => {
    const newDist = { ...matchForm.positionPrizeDistribution };
    Object.keys(newDist).forEach(rank => {
      if (Number(rank) > count) delete newDist[Number(rank)];
    });
    setMatchForm(prev => ({
      ...prev,
      positionWinnersCount: count,
      positionPrizeDistribution: newDist
    }));
  };

  const handleUpdateMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchId) return;

    if (!matchForm.gameId || !matchForm.map) {
      alert('Please select game and map');
      return;
    }

    setIsProcessing(true);
    try {
      let finalImage = matchForm.image ? matchForm.image.trim() : '';
      if (finalImage && finalImage.startsWith('data:')) {
        try {
          finalImage = await uploadOriginalImage(finalImage);
        } catch (imgErr) {
          console.warn('Image upload warning:', imgErr);
        }
      }

      const matchRef = doc(db, 'matches', matchId);
      const updateData: any = {
        title: matchForm.title,
        gameId: matchForm.gameId,
        modeId: matchForm.modeId || matchForm.selectedModeDocId || 'br_solo',
        image: finalImage,
        entryFee: Number(matchForm.entryFee),
        maxPlayers: Number(matchForm.totalSlots || 0),
        totalSlots: Number(matchForm.totalSlots || 0),
        time: matchForm.time,
        map: matchForm.map,
        mode: matchForm.mode,
        section: matchForm.section,
        updatedAt: serverTimestamp()
      };

      updateData.prizeType = matchForm.prizeType;

      if (matchForm.prizeType === 'survival') {
        const sumOfDistribution = (Object.values(matchForm.prizeDistribution || {}) as number[]).reduce((sum: number, v: number) => sum + (Number(v) || 0), 0);
        const finalPrizePool = sumOfDistribution > 0 ? sumOfDistribution : (Number(matchForm.prizePool) || 0);

        updateData.perKillAmount = 0;
        updateData.winnersCount = Number(matchForm.winnersCount) || 1;
        updateData.prizeDistribution = matchForm.prizeDistribution || {};
        updateData.prizePool = finalPrizePool;
        updateData.prize = matchForm.prize 
          ? (String(matchForm.prize).startsWith('₹') ? String(matchForm.prize) : `₹${matchForm.prize}`)
          : `₹${finalPrizePool}`;
        updateData.positionWinnersCount = 0;
        updateData.positionPrizeDistribution = {};
      } else {
        updateData.perKillAmount = Number(matchForm.perKillAmount) || 0;
        updateData.prizePool = Number(matchForm.prizePool) || 0;
        updateData.prize = `₹${matchForm.prizePool || 0}`;
        updateData.positionWinnersCount = Number(matchForm.positionWinnersCount) || 0;
        updateData.positionPrizeDistribution = matchForm.positionPrizeDistribution || {};
        updateData.winnersCount = 0;
        updateData.prizeDistribution = {};
      }

      await updateDoc(matchRef, updateData);
      alert('Match updated successfully!');
      onPageChange(Page.ADMIN);
    } catch (e) {
      console.error("Error updating match:", e);
      handleFirestoreError(e, OperationType.UPDATE, `matches/${matchId}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center">
        <Loader2 className="text-purple-500 animate-spin mb-4" size={32} />
        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Loading Match Details...</p>
      </div>
    );
  }

  return (
    <div className="pb-24 max-w-lg mx-auto bg-black text-white min-h-screen">
      <div className="px-5 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button 
            onClick={() => onPageChange(Page.ADMIN)}
            className="p-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-xl font-bold tracking-tighter uppercase italic text-white leading-none">
              Edit <span className="text-purple-500">Match</span>
            </h2>
            <p className="text-[8px] font-black uppercase tracking-widest text-neutral-500 mt-1">Match ID: {matchId}</p>
          </div>
        </div>

        <form onSubmit={handleUpdateMatch} className="space-y-5">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 ml-1">Match Title *</label>
            <input 
              type="text"
              required
              placeholder="e.g. Daily Battle Room #1"
              value={matchForm.title}
              onChange={(e) => setMatchForm({...matchForm, title: e.target.value})}
              className="w-full h-13 bg-neutral-900 border border-neutral-800 rounded-2xl px-4 text-xs font-bold outline-none focus:border-purple-500 transition-all text-white"
            />
          </div>

          {/* Dynamic Mode Picker (From GameModes collection) */}
          <div className="space-y-2 p-4 bg-neutral-900/60 border border-purple-500/20 rounded-2xl">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black uppercase tracking-widest text-purple-400 flex items-center gap-1.5">
                <Layers size={13} /> Select Game Mode (From Admin Modes) *
              </label>
              {loadingModes && <Loader2 size={12} className="animate-spin text-purple-400" />}
            </div>

            <select
              value={matchForm.selectedModeDocId}
              onChange={(e) => handleSelectGameMode(e.target.value)}
              className="w-full h-12 bg-black border border-purple-500/30 rounded-xl px-4 text-xs font-bold outline-none focus:border-purple-500 transition-all text-white"
            >
              {availableModes.map(m => (
                <option key={m.id} value={m.id}>
                  {m.title} — {m.subtitle || m.category || 'Mode'} (ID: {m.id})
                </option>
              ))}
            </select>

            {/* Quick Mode Chips */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {availableModes.slice(0, 8).map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleSelectGameMode(m.id)}
                  className={`text-[8px] font-black uppercase px-2.5 py-1 rounded-lg border transition-all ${
                    matchForm.selectedModeDocId === m.id
                      ? 'bg-purple-600 border-purple-500 text-white shadow-sm'
                      : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                >
                  {m.title}
                </button>
              ))}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* MATCH THUMBNAIL / BANNER UPLOAD & SELECTION SECTION                      */}
          {/* ========================================================================= */}
          <div className="space-y-3 p-4 bg-neutral-900/70 border border-neutral-800 rounded-2xl">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                <ImageIcon size={14} /> Match Thumbnail / Cover Image
              </label>
              {matchForm.image && (
                <button
                  type="button"
                  onClick={() => setMatchForm(prev => ({ ...prev, image: '' }))}
                  className="text-[9px] font-black text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors"
                >
                  <Trash2 size={11} /> Remove
                </button>
              )}
            </div>

            {/* Hidden native file input */}
            <input 
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />

            {/* Active Thumbnail Preview or Upload Area */}
            {matchForm.image ? (
              <div className="relative aspect-video w-full rounded-xl overflow-hidden border border-neutral-700 shadow-md group">
                <img 
                  src={matchForm.image} 
                  alt="Match Thumbnail Preview" 
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-between p-3">
                  <div className="flex justify-between items-start">
                    <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-500/90 text-white px-2 py-0.5 rounded-md flex items-center gap-1">
                      <CheckCircle2 size={10} /> Active Thumbnail
                    </span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-[9px] font-black uppercase tracking-wider bg-black/70 hover:bg-black text-white px-2.5 py-1 rounded-lg border border-white/20 backdrop-blur-xs flex items-center gap-1 transition-colors"
                    >
                      <Upload size={11} /> Change File
                    </button>
                  </div>
                  <div className="text-white">
                    <p className="text-[10px] font-black uppercase tracking-wide line-clamp-1 text-white/90">
                      {matchForm.title || 'Tournament Card Preview'}
                    </p>
                    <p className="text-[8px] font-bold text-amber-400 uppercase">
                      {matchForm.section} • {matchForm.mode}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-neutral-700 hover:border-purple-500/60 rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer transition-all bg-neutral-950/60 hover:bg-neutral-900/60 group"
              >
                <div className="w-10 h-10 rounded-full bg-neutral-900 group-hover:bg-purple-950/60 border border-neutral-800 group-hover:border-purple-500/40 flex items-center justify-center text-neutral-400 group-hover:text-purple-400 transition-colors mb-2">
                  <Upload size={18} />
                </div>
                <p className="text-xs font-bold text-white group-hover:text-purple-300">
                  Click to Upload Thumbnail Image
                </p>
                <p className="text-[9px] font-semibold text-neutral-500 mt-0.5">
                  PNG, JPG, WebP supported (Esports / Game banner)
                </p>
              </div>
            )}

            {/* Upload Progress Bar */}
            {isUploadingImage && (
              <div className="space-y-1">
                <div className="flex justify-between text-[8px] font-black uppercase text-purple-400">
                  <span>Uploading Image...</span>
                  <span>{Math.round(uploadProgress)}%</span>
                </div>
                <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-purple-500 transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Direct Image URL Input */}
            <div className="space-y-1 pt-1">
              <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">
                Or Enter Image URL:
              </label>
              <div className="flex gap-2">
                <input 
                  type="url"
                  placeholder="https://images.unsplash.com/..."
                  value={matchForm.image}
                  onChange={(e) => setMatchForm(prev => ({ ...prev, image: e.target.value }))}
                  className="flex-1 h-10 bg-neutral-950 border border-neutral-800 rounded-xl px-3 text-xs font-bold outline-none focus:border-purple-500 transition-all text-white placeholder:text-neutral-600"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 h-10 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-colors shrink-0"
                >
                  <Upload size={12} /> Browse
                </button>
              </div>
            </div>

            {/* Quick Preset Thumbnails */}
            <div className="space-y-1.5 pt-1">
              <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">
                Quick Presets (1-Tap Apply):
              </label>
              <div className="grid grid-cols-3 gap-2">
                {PRESET_MATCH_THUMBNAILS.map((preset, idx) => {
                  const isSelected = matchForm.image === preset.url;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setMatchForm(prev => ({ ...prev, image: preset.url }))}
                      className={`relative aspect-video rounded-lg overflow-hidden border transition-all text-left group ${
                        isSelected 
                          ? 'border-amber-400 ring-2 ring-amber-400/40 shadow-sm' 
                          : 'border-neutral-800 hover:border-neutral-600 opacity-80 hover:opacity-100'
                      }`}
                    >
                      <img 
                        src={preset.url} 
                        alt={preset.name} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent p-1.5 flex flex-col justify-end">
                        <span className="text-[8px] font-black uppercase tracking-tighter text-white line-clamp-1 leading-tight">
                          {preset.name}
                        </span>
                      </div>
                      {isSelected && (
                        <div className="absolute top-1 right-1 bg-amber-400 text-black rounded-full p-0.5">
                          <CheckCircle2 size={10} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Game & Map */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 ml-1">Game</label>
              <select 
                value={matchForm.gameId}
                onChange={(e) => setMatchForm({...matchForm, gameId: e.target.value})}
                className="w-full h-12 bg-neutral-900 border border-neutral-800 rounded-xl px-3 text-xs font-bold outline-none focus:border-purple-500 transition-all text-white appearance-none"
              >
                <option value="freefire">Free Fire</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 ml-1">Map</label>
              <select 
                value={matchForm.map}
                onChange={(e) => setMatchForm({...matchForm, map: e.target.value})}
                className="w-full h-12 bg-neutral-900 border border-neutral-800 rounded-xl px-3 text-xs font-bold outline-none focus:border-purple-500 transition-all text-white appearance-none"
              >
                {((GAME_MAPS as any)[matchForm.gameId] || GAME_MAPS['freefire']).map((m: string) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Section & Mode */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 ml-1">Section / Category</label>
              <input 
                type="text"
                value={matchForm.section}
                onChange={(e) => setMatchForm({...matchForm, section: e.target.value})}
                placeholder="e.g. Battle Royale, Clash Squad"
                className="w-full h-12 bg-neutral-900 border border-neutral-800 rounded-xl px-3 text-xs font-bold outline-none focus:border-purple-500 transition-all text-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 ml-1">Mode Type</label>
              <input 
                type="text"
                value={matchForm.mode}
                onChange={(e) => setMatchForm({...matchForm, mode: e.target.value})}
                placeholder="e.g. Solo, Duo, Squad, 4v4"
                className="w-full h-12 bg-neutral-900 border border-neutral-800 rounded-xl px-3 text-xs font-bold outline-none focus:border-purple-500 transition-all text-white"
              />
            </div>
          </div>

          {/* Schedule Time & Total Slots */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 ml-1">Schedule Time</label>
              <input 
                type="datetime-local"
                required
                value={matchForm.time}
                onChange={(e) => setMatchForm({...matchForm, time: e.target.value})}
                className="w-full h-12 bg-neutral-900 border border-neutral-800 rounded-xl px-3 text-xs font-bold outline-none focus:border-purple-500 transition-all text-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 ml-1">Total Slots</label>
              <input 
                type="number"
                required
                placeholder="48"
                value={matchForm.totalSlots}
                onChange={(e) => setMatchForm({...matchForm, totalSlots: Number(e.target.value)})}
                className="w-full h-12 bg-neutral-900 border border-neutral-800 rounded-xl px-3 text-xs font-bold outline-none focus:border-purple-500 transition-all text-white"
              />
            </div>
          </div>

          {/* Entry Fee & Prize Pool */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 ml-1">Entry Fee (₹)</label>
              <input 
                type="number"
                required
                value={matchForm.entryFee}
                onChange={(e) => setMatchForm({...matchForm, entryFee: Number(e.target.value)})}
                className="w-full h-12 bg-neutral-900 border border-neutral-800 rounded-xl px-3 text-xs font-bold outline-none focus:border-purple-500 transition-all text-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 ml-1">Prize Pool (₹)</label>
              <input 
                type="number"
                value={matchForm.prizePool}
                onChange={(e) => setMatchForm({...matchForm, prizePool: Number(e.target.value)})}
                className="w-full h-12 bg-neutral-900 border border-neutral-800 rounded-xl px-3 text-xs font-bold outline-none focus:border-purple-500 transition-all text-white"
              />
            </div>
          </div>

          {/* Prize Distribution */}
          <div className="space-y-5 p-5 bg-purple-600/5 border border-purple-500/15 rounded-3xl">
            <div className="flex gap-3">
              <button 
                type="button"
                onClick={() => setMatchForm({...matchForm, prizeType: 'perKill'})}
                className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                  matchForm.prizeType === 'perKill' 
                    ? 'bg-purple-600 border-purple-500 text-white' 
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                }`}
              >
                Per Kill + Rewards
              </button>
              <button 
                type="button"
                onClick={() => setMatchForm({...matchForm, prizeType: 'survival'})}
                className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                  matchForm.prizeType === 'survival' 
                    ? 'bg-purple-600 border-purple-500 text-white' 
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                }`}
              >
                Survival / Ranks
              </button>
            </div>

            {matchForm.prizeType === 'perKill' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 ml-1">Per Kill (₹)</label>
                    <input 
                      type="number"
                      value={matchForm.perKillAmount}
                      onChange={(e) => setMatchForm({...matchForm, perKillAmount: Number(e.target.value)})}
                      className="w-full h-12 bg-black/50 border border-neutral-800 rounded-xl px-3 text-xs font-bold outline-none focus:border-purple-500 transition-all text-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 ml-1">Total Pool (₹)</label>
                    <input 
                      type="number"
                      value={matchForm.prizePool}
                      onChange={(e) => setMatchForm({...matchForm, prizePool: Number(e.target.value)})}
                      className="w-full h-12 bg-black/50 border border-neutral-800 rounded-xl px-3 text-xs font-bold outline-none focus:border-purple-500 transition-all text-white"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-neutral-800">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-purple-400">Position Rewards (Optional)</label>
                    <div className="relative min-w-[140px]">
                      <select 
                        value={matchForm.positionWinnersCount}
                        onChange={(e) => handlePositionWinnersCountChange(Number(e.target.value))}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none cursor-pointer focus:border-purple-500 appearance-none pr-8"
                      >
                        <option value={0} className="bg-neutral-900 text-white">No Position Reward</option>
                        {[1, 2, 3, 5, 10].map(n => (
                          <option key={n} value={n} className="bg-neutral-900 text-white">Top {n} Winners</option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                    </div>
                  </div>

                  {/* Quick Select Pills */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {[0, 1, 2, 3, 5, 10].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => handlePositionWinnersCountChange(n)}
                        className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-lg border transition-all ${
                          matchForm.positionWinnersCount === n
                            ? 'bg-purple-600 border-purple-500 text-white shadow-sm'
                            : 'bg-neutral-900/80 border-neutral-800 text-neutral-400 hover:text-white'
                        }`}
                      >
                        {n === 0 ? 'None' : `Top ${n}`}
                      </button>
                    ))}
                  </div>

                  {matchForm.positionWinnersCount > 0 && (
                    <div className="space-y-2">
                      {Array.from({ length: matchForm.positionWinnersCount }).map((_, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-14 h-9 bg-neutral-800 border border-neutral-700 rounded-lg flex items-center justify-center text-[9px] font-black text-neutral-400">
                            RANK {i + 1}
                          </div>
                          <div className="flex-1 relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 font-bold text-xs">₹</span>
                            <input 
                              type="number"
                              placeholder="0"
                              value={matchForm.positionPrizeDistribution[i + 1] || ''}
                              onChange={(e) => handlePositionPrizeDistributionChange(i + 1, Number(e.target.value))}
                              className="w-full h-9 bg-black/30 border border-neutral-800 rounded-lg pl-7 pr-3 text-xs font-bold text-white outline-none focus:border-purple-500"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 ml-1">Prize Text (e.g. ₹500)</label>
                  <input 
                    type="text"
                    value={matchForm.prize}
                    onChange={(e) => setMatchForm({...matchForm, prize: e.target.value})}
                    className="w-full h-12 bg-black/50 border border-neutral-800 rounded-xl px-3 text-xs font-bold outline-none focus:border-purple-500 transition-all text-white"
                  />
                </div>

                <div className="pt-3 border-t border-neutral-800">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-purple-400">Winning Distribution</label>
                    <div className="relative min-w-[140px]">
                      <select 
                        value={matchForm.winnersCount}
                        onChange={(e) => handleWinnersCountChange(Number(e.target.value))}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none cursor-pointer focus:border-purple-500 appearance-none pr-8"
                      >
                        {[1, 2, 3, 5, 10, 20].map(n => (
                          <option key={n} value={n} className="bg-neutral-900 text-white">Top {n} Winners</option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                    </div>
                  </div>

                  {/* Quick Select Pills for instant 1-tap on mobile */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {[1, 2, 3, 5, 10, 20].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => handleWinnersCountChange(n)}
                        className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-lg border transition-all ${
                          matchForm.winnersCount === n
                            ? 'bg-purple-600 border-purple-500 text-white shadow-sm'
                            : 'bg-neutral-900/80 border-neutral-800 text-neutral-400 hover:text-white'
                        }`}
                      >
                        Top {n}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-2">
                    {Array.from({ length: matchForm.winnersCount }).map((_, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-14 h-9 bg-neutral-800 border border-neutral-700 rounded-lg flex items-center justify-center text-[9px] font-black text-neutral-400">
                          RANK {i + 1}
                        </div>
                        <div className="flex-1 relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 font-bold text-xs">₹</span>
                          <input 
                            type="number"
                            placeholder="0"
                            value={matchForm.prizeDistribution[i + 1] || ''}
                            onChange={(e) => handlePrizeDistributionChange(i + 1, Number(e.target.value))}
                            className="w-full h-9 bg-black/30 border border-neutral-800 rounded-lg pl-7 pr-3 text-xs font-bold text-white outline-none focus:border-purple-500"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <button 
            type="submit"
            disabled={isProcessing}
            className="w-full py-4.5 bg-purple-600 hover:bg-purple-700 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-purple-600/30 mt-6 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-white"
          >
            {isProcessing ? (
              <>
                <Loader2 size={18} className="animate-spin text-white" />
                <span>Saving Changes...</span>
              </>
            ) : (
              <>
                <Save size={18} />
                <span>Update Match Details</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
