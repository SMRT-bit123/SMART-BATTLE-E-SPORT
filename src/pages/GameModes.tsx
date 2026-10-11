import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Gamepad2, PlayCircle, Star, ShieldCheck, Loader2 } from 'lucide-react';
import { GAMES } from '../constants';
import { Page } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import SafeImage from '../components/SafeImage';

interface GameMode {
  id: string;
  gameId: string;
  title: string;
  subtitle: string;
  image: string;
  category: string;
  order: number;
}

interface GameModesProps {
  onPageChange: (page: Page, id?: string) => void;
}

const MODE_IMAGE_MAP: Record<string, string> = {
  'br_solo': '/src/assets/images/regenerated_image_1791735926796.jpg',
  'br_duo': '/src/assets/images/regenerated_image_1791755547255.png',
  'br_squad': '/src/assets/images/regenerated_image_1791755551692.png',
  'free_match': '/src/assets/images/regenerated_image_1791756013539.png',
  'cs_headshot': '/src/assets/images/regenerated_image_1791756005244.png',
  'cs_solo': '/src/assets/images/regenerated_image_1791755559649.png',
  'cs_duo': '/src/assets/images/regenerated_image_1791755563719.png',
  'lone_wolf_solo': '/src/assets/images/regenerated_image_1791735947152.jpg',
  'lone_wolf_duo': '/src/assets/images/regenerated_image_1791735950149.jpg',
};

const ORDERED_FALLBACK_IMAGES = [
  '/src/assets/images/regenerated_image_1791735926796.jpg',
  '/src/assets/images/regenerated_image_1791755547255.png',
  '/src/assets/images/regenerated_image_1791755551692.png',
  '/src/assets/images/regenerated_image_1791756013539.png',
  '/src/assets/images/regenerated_image_1791756005244.png',
  '/src/assets/images/regenerated_image_1791755559649.png',
  '/src/assets/images/regenerated_image_1791755563719.png',
  '/src/assets/images/regenerated_image_1791735950149.jpg',
];

const getModeImage = (mode: GameMode, index: number) => {
  const cleanId = (mode.id || '').replace(/^freefire_/, '');
  if (cleanId === 'free_match') return '/src/assets/images/regenerated_image_1791756013539.png';
  if (cleanId === 'cs_headshot') return '/src/assets/images/regenerated_image_1791756005244.png';
  if (mode.image && !mode.image.includes('1791755555487') && !mode.image.includes('1791755557083') && mode.image.startsWith('/src/assets/images/')) {
    return mode.image;
  }
  if (MODE_IMAGE_MAP[cleanId]) return MODE_IMAGE_MAP[cleanId];
  if (MODE_IMAGE_MAP[mode.id]) return MODE_IMAGE_MAP[mode.id];
  return ORDERED_FALLBACK_IMAGES[index % ORDERED_FALLBACK_IMAGES.length];
};

export default function GameModes({ onPageChange }: GameModesProps) {
  const { gameId } = useParams<{ gameId: string }>();
  const [modes, setModes] = useState<GameMode[]>([]);
  const [loading, setLoading] = useState(true);
  
  const game = GAMES.find(g => g.id === gameId);

  useEffect(() => {
    if (!gameId) return;

    setLoading(true);
    const q = query(
      collection(db, 'gameModes'), 
      where('gameId', '==', gameId),
      orderBy('order', 'asc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let fetchedModes = snapshot.docs.map(doc => ({ ...doc.data() } as GameMode));
      
      // Exclude CS Squad completely
      fetchedModes = fetchedModes.filter(
        (m) =>
          m.id !== 'cs_squad' &&
          m.id !== 'freefire_cs_squad' &&
          (m.title || '').trim().toUpperCase() !== 'CS SQUAD'
      );

      // Ensure Free Match exists
      const hasFreeMatch = fetchedModes.some(
        (m) =>
          m.id === 'free_match' ||
          m.id === 'freefire_free_match' ||
          (m.title || '').toUpperCase().includes('FREE')
      );
      if (!hasFreeMatch) {
        fetchedModes.splice(3, 0, {
          id: 'free_match',
          gameId: gameId || 'freefire',
          title: 'FREE MATCH',
          subtitle: 'Free Entry',
          category: 'Free Match',
          image: '/src/assets/images/regenerated_image_1791756013539.png',
          order: 3,
        });
      }

      // Ensure CS Headshot exists
      const hasCsHeadshot = fetchedModes.some(
        (m) =>
          m.id === 'cs_headshot' ||
          m.id === 'freefire_cs_headshot' ||
          (m.title || '').toUpperCase().includes('HEADSHOT')
      );
      if (!hasCsHeadshot) {
        fetchedModes.splice(4, 0, {
          id: 'cs_headshot',
          gameId: gameId || 'freefire',
          title: 'CS HEADSHOT',
          subtitle: 'Only Headshot',
          category: 'CS Headshot',
          image: '/src/assets/images/regenerated_image_1791756005244.png',
          order: 4,
        });
      }

      setModes(fetchedModes);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'gameModes');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [gameId]);

  if (!game) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-5">
        <div className="text-center opacity-50">
          <Gamepad2 size={48} className="mx-auto mb-4 text-neutral-800" />
          <p className="text-neutral-500 mb-4 font-bold uppercase tracking-widest text-xs">Arena not found</p>
          <button 
            onClick={() => onPageChange(Page.HOME)}
            className="text-purple-500 font-black uppercase tracking-[0.3em] text-[10px]"
          >
            Return to Base
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white pb-32 max-w-lg mx-auto overflow-x-hidden">
      {/* Header Area */}
      <div className="relative pt-8 pb-12 px-6 overflow-hidden">
        {/* Abstract Background Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-64 bg-purple-600/10 blur-[100px] pointer-events-none" />
        
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-8">
            <motion.button 
              whileTap={{ scale: 0.9 }}
              onClick={() => onPageChange(Page.HOME)}
              className="w-10 h-10 rounded-xl bg-neutral-900 border border-white/5 flex items-center justify-center text-neutral-400"
            >
              <ChevronLeft size={18} />
            </motion.button>
            
            <div className="text-center">
              <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-purple-500 mb-1">
                {game ? `${game.title} ARENA`.toUpperCase() : 'GAMING ARENA'}
              </h2>
              <div className="flex items-center justify-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                <span className="text-[8px] font-black uppercase tracking-widest text-emerald-500/80">Servers Optimal</span>
              </div>
            </div>

            <div className="w-10" /> {/* Spacer */}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <h1 className="text-3xl font-black italic uppercase tracking-tighter mb-2">
              Choose Your <span className="text-purple-500">Mode</span>
            </h1>
            <p className="text-[10px] text-neutral-500 uppercase tracking-[0.2em] font-medium leading-relaxed max-w-[200px] mx-auto">
              Select a category to view available tournaments
            </p>
          </motion.div>
        </div>
      </div>

      <div className="px-3">
        {/* Modes Grid - 3 Columns Square Grid like Reference */}
        <div className="grid grid-cols-3 gap-2 pb-10">
          {loading ? (
            Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="aspect-square bg-neutral-900 border border-white/5 rounded-2xl animate-pulse" />
            ))
          ) : modes.length === 0 ? (
            <div className="col-span-3 py-20 text-center opacity-30">
              <Star size={40} className="mx-auto mb-4 text-neutral-700" />
              <p className="text-[10px] font-black uppercase tracking-[0.3em]">No Active Categories</p>
            </div>
          ) : (
            modes.map((mode, index) => (
              <motion.div
                key={mode.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onPageChange(Page.TOURNAMENTS, `${game.id}?mode=${mode.id}`)}
                className="group relative aspect-square rounded-2xl overflow-hidden border border-white/5 cursor-pointer bg-neutral-900 shadow-xl"
              >
                {/* Mode Background Image - object-cover ensures no stretch */}
                <SafeImage 
                  src={getModeImage(mode, index)} 
                  alt={mode.title} 
                  className="absolute inset-0 w-full h-full"
                  imgClassName="transition-transform duration-700 group-hover:scale-110"
                  showLoader={false}
                />
                
                {/* Thin Purple Border Border Effect */}
                <div className="absolute inset-0 border-2 border-purple-500/0 group-hover:border-purple-500/40 rounded-2xl transition-all duration-300 z-20 pointer-events-none" />
                
                {/* Bottom Dark Gradient Overlay for Readability */}
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-black via-black/60 to-transparent z-10" />
                
                {/* Content Overlay */}
                <div className="absolute inset-x-0 bottom-0 p-2 z-30 text-center">
                  <h3 className="text-[10px] font-black text-white uppercase tracking-tighter leading-tight group-hover:text-purple-400 transition-colors truncate">
                    {mode.title}
                  </h3>
                  <p className="text-[6px] font-bold text-neutral-500 uppercase tracking-widest leading-none mt-0.5 truncate">
                    {mode.subtitle || 'Arena'}
                  </p>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

