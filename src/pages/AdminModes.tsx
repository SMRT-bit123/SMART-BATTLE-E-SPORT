import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Edit2, Trash2, Save, X, Search, ChevronRight, 
  Image as ImageIcon, Loader2, Gamepad2, ArrowLeft, Upload, 
  Sparkles, Check, RefreshCw
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, getDocs, setDoc, doc, deleteDoc, onSnapshot, orderBy, writeBatch } from 'firebase/firestore';
import { Page } from '../types';
import { GAMES } from '../constants';
import SafeImage from '../components/SafeImage';
import { uploadOriginalImage } from '../utils/imageCompressor';

export interface GameMode {
  id: string;
  gameId: string;
  title: string;
  subtitle: string;
  image: string;
  category: string;
  order: number;
}

interface AdminModesProps {
  onPageChange: (page: Page) => void;
}

// Curated High-Definition Preset Covers for Easy Selection
const PRESET_COVERS = [
  {
    name: 'Battle Royale Classic',
    url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop'
  },
  {
    name: 'Clash Squad / 4v4',
    url: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1200&auto=format&fit=crop'
  },
  {
    name: 'Lone Wolf / 1v1',
    url: 'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?q=80&w=1200&auto=format&fit=crop'
  },
  {
    name: 'Survival Arena',
    url: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=1200&auto=format&fit=crop'
  },
  {
    name: 'Cyberpunk Esports',
    url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=1200&auto=format&fit=crop'
  },
  {
    name: 'Sniper / Stealth',
    url: 'https://images.unsplash.com/photo-1563089145-599997674d42?q=80&w=1200&auto=format&fit=crop'
  }
];

const DEFAULT_PRESET_MODES: GameMode[] = [
  { id: 'br_solo', gameId: 'freefire', title: 'BR SOLO', subtitle: 'Battle Royale', category: 'Battle Royale', image: '/src/assets/images/regenerated_image_1791735926796.jpg', order: 1 },
  { id: 'br_duo', gameId: 'freefire', title: 'BR DUO', subtitle: 'Battle Royale', category: 'Battle Royale', image: '/src/assets/images/regenerated_image_1791755547255.png', order: 2 },
  { id: 'br_squad', gameId: 'freefire', title: 'BR SQUAD', subtitle: 'Battle Royale', category: 'Battle Royale', image: '/src/assets/images/regenerated_image_1791755551692.png', order: 3 },
  { id: 'free_match', gameId: 'freefire', title: 'FREE MATCH', subtitle: 'Free Entry', category: 'Free Match', image: '/src/assets/images/regenerated_image_1791756013539.png', order: 4 },
  { id: 'cs_headshot', gameId: 'freefire', title: 'CS HEADSHOT', subtitle: 'Only Headshot', category: 'CS Headshot', image: '/src/assets/images/regenerated_image_1791756005244.png', order: 5 },
  { id: 'cs_solo', gameId: 'freefire', title: 'CS SOLO', subtitle: 'Clash Squad', category: 'Clash Squad', image: '/src/assets/images/regenerated_image_1791755559649.png', order: 6 },
  { id: 'cs_duo', gameId: 'freefire', title: 'CS DUO', subtitle: 'Clash Squad', category: 'Clash Squad', image: '/src/assets/images/regenerated_image_1791755563719.png', order: 7 },
  { id: 'lone_wolf_solo', gameId: 'freefire', title: 'LONE WOLF SOLO', subtitle: 'Lone Wolf', category: 'Lone Wolf', image: '/src/assets/images/regenerated_image_1791735947152.jpg', order: 8 },
  { id: 'lone_wolf_duo', gameId: 'freefire', title: 'LONE WOLF DUO', subtitle: 'Lone Wolf', category: 'Lone Wolf', image: '/src/assets/images/regenerated_image_1791735950149.jpg', order: 9 },
  { id: 'custom_room', gameId: 'freefire', title: 'CUSTOM ROOM', subtitle: 'Special Tournament', category: 'Custom Room', image: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=1200&auto=format&fit=crop', order: 10 },
];

const SUGGESTED_TITLES = [
  'BR SOLO', 'BR DUO', 'BR SQUAD',
  'FREE MATCH', 'CS HEADSHOT',
  'CS SOLO', 'CS DUO',
  'LONE WOLF SOLO', 'LONE WOLF DUO',
  'CUSTOM ROOM', 'SNIPER ONLY', '1V1 DUEL'
];

const SUGGESTED_SUBTITLES = [
  'Battle Royale', 'Free Match', 'CS Headshot', 'Clash Squad', 'Lone Wolf',
  'Custom Room', 'Survival Arena', 'Ranked Esports', 'Special Event'
];

export default function AdminModes({ onPageChange }: AdminModesProps) {
  const [selectedGameId, setSelectedGameId] = useState<string>(GAMES[0].id);
  const [modes, setModes] = useState<GameMode[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMode, setEditingMode] = useState<Partial<GameMode> | null>(null);
  const [modeToDelete, setModeToDelete] = useState<GameMode | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Mode Image Upload (100% Original Quality, No Compression)
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(10);
    
    try {
      const url = await uploadOriginalImage(file, (progress) => {
        setUploadProgress(progress);
      });
      setEditingMode(prev => prev ? { ...prev, image: url } : null);
    } catch (err) {
      console.error('Mode image upload failed:', err);
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'gameModes'), orderBy('order', 'asc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allModes = snapshot.docs.map(docSnap => ({ ...docSnap.data() } as GameMode));
      const filtered = allModes.filter(m => m.gameId === selectedGameId);
      setModes(filtered);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'gameModes');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [selectedGameId]);

  // Quick Seed Default Modes for this Game
  const handleSeedDefaults = async () => {
    if (!confirm(`Do you want to initialize standard preset game modes for ${selectedGameId}?`)) return;
    setIsSeeding(true);
    try {
      const batch = writeBatch(db);
      // Remove deprecated cs_squad mode
      batch.delete(doc(db, 'gameModes', `${selectedGameId}_cs_squad`));

      DEFAULT_PRESET_MODES.forEach((mode, i) => {
        const modeDocId = `${selectedGameId}_${mode.id}`;
        const ref = doc(db, 'gameModes', modeDocId);
        batch.set(ref, {
          ...mode,
          gameId: selectedGameId,
          order: i + 1
        }, { merge: true });
      });
      await batch.commit();
      alert('Preset game modes updated successfully!');
    } catch (err) {
      console.error("Error seeding modes:", err);
      handleFirestoreError(err, OperationType.WRITE, 'gameModes');
    } finally {
      setIsSeeding(false);
    }
  };

  // Helper to generate a clean slug from Title
  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  };

  const handleTitleChange = (title: string) => {
    const slug = generateSlug(title);
    let subtitle = editingMode?.subtitle || '';
    let category = editingMode?.category || '';

    // Auto-detect sensible subtitle if empty
    if (!subtitle || subtitle === 'Battle Royale' || subtitle === 'Clash Squad' || subtitle === 'Lone Wolf') {
      const upper = title.toUpperCase();
      if (upper.includes('BR') || upper.includes('ROYALE') || upper.includes('MAP')) {
        subtitle = 'Battle Royale';
        category = 'Battle Royale';
      } else if (upper.includes('CS') || upper.includes('CLASH') || upper.includes('4V4')) {
        subtitle = 'Clash Squad';
        category = 'Clash Squad';
      } else if (upper.includes('LONE') || upper.includes('WOLF') || upper.includes('1V1')) {
        subtitle = 'Lone Wolf';
        category = 'Lone Wolf';
      } else if (upper.includes('CUSTOM') || upper.includes('ROOM')) {
        subtitle = 'Custom Room';
        category = 'Custom Room';
      }
    }

    setEditingMode(prev => ({
      ...prev,
      title,
      id: prev?.id && prev.id !== '' ? prev.id : slug,
      subtitle: subtitle || 'Battleground',
      category: category || subtitle || 'Arena',
      image: prev?.image || PRESET_COVERS[0].url
    }));
  };

  const handleSave = async () => {
    if (!editingMode?.title?.trim()) {
      alert('Please enter a Mode Title');
      return;
    }

    const rawId = (editingMode.id || generateSlug(editingMode.title)).trim();
    if (!rawId) {
      alert('Please enter a valid Mode ID');
      return;
    }

    setIsSaving(true);
    try {
      const modeId = `${selectedGameId}_${rawId}`;
      let defaultImage = editingMode.image && editingMode.image.trim() !== ''
        ? editingMode.image.trim()
        : PRESET_COVERS[0].url;

      if (defaultImage && defaultImage.startsWith('data:')) {
        try {
          defaultImage = await uploadOriginalImage(defaultImage);
        } catch (imgErr) {
          console.warn('Mode image upload warning:', imgErr);
        }
      }

      const modeData: GameMode = {
        id: rawId,
        gameId: selectedGameId,
        title: editingMode.title.trim(),
        subtitle: (editingMode.subtitle || 'Battleground').trim(),
        category: (editingMode.category || editingMode.subtitle || 'Arena').trim(),
        image: defaultImage,
        order: Number(editingMode.order) || modes.length + 1
      };

      await setDoc(doc(db, 'gameModes', modeId), modeData, { merge: true });
      setEditingMode(null);
    } catch (error) {
      console.error("Error saving mode:", error);
      handleFirestoreError(error, OperationType.WRITE, 'gameModes');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!modeToDelete || isDeleting) return;
    
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'gameModes', `${selectedGameId}_${modeToDelete.id}`));
      setModeToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'gameModes');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredModes = modes.filter(m => 
    m.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    m.subtitle?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="pb-24 max-w-lg mx-auto bg-black min-h-screen text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-black/90 backdrop-blur-md px-5 h-16 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => onPageChange(Page.ADMIN)}
            className="p-2 -ml-2 text-neutral-400 hover:text-white active:scale-95 transition-all"
          >
            <ArrowLeft size={22} />
          </button>
          <div>
            <h1 className="text-base font-extrabold tracking-tight uppercase">Game Modes</h1>
            <p className="text-[8px] font-black uppercase tracking-widest text-neutral-500">Configure Arena Modes</p>
          </div>
        </div>

        <button 
          onClick={handleSeedDefaults}
          disabled={isSeeding}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 border border-purple-500/30 text-purple-400 hover:bg-purple-600 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50"
        >
          {isSeeding ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          <span>Preset Modes</span>
        </button>
      </header>

      <section className="px-5 py-6 space-y-6">
        {/* Game Selector */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {GAMES.map(game => (
            <button
              key={game.id}
              onClick={() => setSelectedGameId(game.id)}
              className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap active:scale-95 ${
                selectedGameId === game.id 
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' 
                  : 'bg-neutral-900 text-neutral-500 border border-white/5'
              }`}
            >
              {game.title}
            </button>
          ))}
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" size={14} />
            <input 
              type="text"
              placeholder="Search modes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl py-2.5 pl-9 pr-3 text-xs font-bold outline-none focus:border-purple-500 text-white transition-all"
            />
          </div>

          <button 
            onClick={() => setEditingMode({ 
              id: '', 
              title: '', 
              subtitle: 'Battle Royale', 
              image: PRESET_COVERS[0].url, 
              category: 'Battle Royale', 
              order: modes.length + 1 
            })}
            className="flex items-center gap-1.5 bg-purple-600 text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-700 transition-all shadow-lg active:scale-95 shrink-0"
          >
            <Plus size={14} /> Add Mode
          </button>
        </div>

        {/* Modes List */}
        <div className="space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 opacity-40">
              <Loader2 size={32} className="animate-spin mb-3 text-purple-500" />
              <p className="text-xs font-black uppercase tracking-widest">Loading Modes...</p>
            </div>
          ) : filteredModes.length === 0 ? (
            <div className="text-center py-16 bg-neutral-900/50 border border-dashed border-white/10 rounded-3xl p-6">
              <Gamepad2 size={36} className="mx-auto mb-3 text-neutral-700" />
              <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">No modes found</p>
              <p className="text-[10px] text-neutral-600 mt-1 mb-4">Click "Add Mode" or load default presets</p>
              <button 
                onClick={handleSeedDefaults}
                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600/20 border border-purple-500/30 text-purple-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-600 hover:text-white transition-all"
              >
                <Sparkles size={12} /> Load Default Modes
              </button>
            </div>
          ) : (
            filteredModes.map((mode, index) => (
              <div 
                key={mode.id}
                className="bg-neutral-900 border border-white/5 rounded-2xl p-3.5 flex items-center justify-between group shadow-lg hover:border-purple-500/30 transition-all"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl overflow-hidden border border-white/10 shadow-md bg-black shrink-0 relative">
                    <SafeImage 
                      src={mode.image || PRESET_COVERS[0].url} 
                      alt={mode.title} 
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-1 left-1 bg-black/70 px-1.5 py-0.5 rounded text-[7px] font-black text-purple-400">
                      #{mode.order || index + 1}
                    </div>
                  </div>
                  <div className="overflow-hidden">
                    <h4 className="text-xs font-black italic uppercase tracking-tight text-white truncate">{mode.title}</h4>
                    <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider truncate">{mode.subtitle || 'Battleground'}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="px-2 py-0.5 bg-neutral-800 rounded text-[7px] font-black text-neutral-400 uppercase tracking-widest">
                        ID: {mode.id}
                      </span>
                      {mode.category && (
                        <span className="px-2 py-0.5 bg-purple-950/60 border border-purple-800/40 rounded text-[7px] font-black text-purple-300 uppercase tracking-widest">
                          {mode.category}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-1.5 shrink-0 ml-2">
                  <button 
                    onClick={() => setEditingMode({ ...mode })}
                    className="p-2.5 bg-neutral-800 text-neutral-300 rounded-xl hover:bg-purple-600 hover:text-white transition-all active:scale-90"
                    title="Edit Mode"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button 
                    onClick={() => setModeToDelete(mode)}
                    className="p-2.5 bg-neutral-800 text-neutral-300 rounded-xl hover:bg-red-600 hover:text-white transition-all active:scale-90"
                    title="Delete Mode"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Edit / Add Modal */}
      <AnimatePresence>
        {editingMode && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-neutral-900 border border-white/10 rounded-3xl p-6 sm:p-7 shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between mb-5 pb-3 border-b border-white/5">
                <div>
                  <h3 className="text-base font-black italic tracking-tight uppercase">
                    {editingMode.id ? 'Edit' : 'Add New'} <span className="text-purple-500">Mode</span>
                  </h3>
                  <p className="text-[8px] font-bold text-neutral-500 uppercase tracking-widest">
                    Available for {selectedGameId.toUpperCase()} matches
                  </p>
                </div>
                <button 
                  onClick={() => setEditingMode(null)} 
                  className="p-2 text-neutral-400 hover:text-white rounded-xl bg-neutral-800/80"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-1 no-scrollbar">
                {/* 1. Mode Title (FREE TEXT + Quick Chips) */}
                <div>
                  <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest mb-1.5 block">
                    Mode Title (e.g. BR SOLO, CS 4V4, CUSTOM ROOM) *
                  </label>
                  <input 
                    type="text"
                    required
                    placeholder="Enter any mode title..."
                    value={editingMode.title || ''}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:border-purple-500 text-white transition-all"
                  />
                  
                  {/* Suggestion Chips */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {SUGGESTED_TITLES.map(title => (
                      <button
                        key={title}
                        type="button"
                        onClick={() => handleTitleChange(title)}
                        className={`text-[8px] font-black uppercase px-2 py-1 rounded-lg border transition-all ${
                          editingMode.title?.toUpperCase() === title 
                            ? 'bg-purple-600 border-purple-500 text-white' 
                            : 'bg-neutral-800/80 border-white/5 text-neutral-400 hover:text-white'
                        }`}
                      >
                        {title}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Mode ID */}
                <div>
                  <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest mb-1.5 block">
                    Mode ID (Slug, e.g. br_solo, cs_4v4, custom_room) *
                  </label>
                  <input 
                    type="text"
                    required
                    placeholder="e.g. br_solo"
                    value={editingMode.id || ''}
                    onChange={(e) => setEditingMode({ ...editingMode, id: generateSlug(e.target.value) })}
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:border-purple-500 text-white transition-all font-mono"
                  />
                  <p className="text-[7.5px] text-neutral-500 mt-1">Used for filtering tournaments & match registration</p>
                </div>

                {/* 3. Subtitle / Category */}
                <div>
                  <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest mb-1.5 block">
                    Subtitle / Section (e.g. Battle Royale, Clash Squad, Custom Room)
                  </label>
                  <input 
                    type="text"
                    placeholder="Enter category / subtitle..."
                    value={editingMode.subtitle || ''}
                    onChange={(e) => setEditingMode({ 
                      ...editingMode, 
                      subtitle: e.target.value,
                      category: e.target.value 
                    })}
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:border-purple-500 text-white transition-all"
                  />
                  
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {SUGGESTED_SUBTITLES.map(sub => (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => setEditingMode({ ...editingMode, subtitle: sub, category: sub })}
                        className={`text-[8px] font-black uppercase px-2 py-1 rounded-lg border transition-all ${
                          editingMode.subtitle === sub 
                            ? 'bg-purple-600 border-purple-500 text-white' 
                            : 'bg-neutral-800/80 border-white/5 text-neutral-400 hover:text-white'
                        }`}
                      >
                        {sub}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. Display Order */}
                <div>
                  <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest mb-1.5 block">
                    Display Order (Sorting)
                  </label>
                  <input 
                    type="number"
                    value={editingMode.order || 1}
                    onChange={(e) => setEditingMode({ ...editingMode, order: parseInt(e.target.value) || 1 })}
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-2.5 text-xs font-bold focus:outline-none focus:border-purple-500 text-white transition-all"
                  />
                </div>

                {/* 5. Cover Image Selector (Presets + URL + Upload) */}
                <div>
                  <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest mb-1.5 block">
                    Mode Thumbnail Cover
                  </label>

                  {/* Preset Covers Carousel */}
                  <p className="text-[8px] font-bold text-purple-400 uppercase mb-2">Select from Presets or Enter URL:</p>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {PRESET_COVERS.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setEditingMode({ ...editingMode, image: preset.url })}
                        className={`relative aspect-[16/10] rounded-xl overflow-hidden border-2 transition-all group ${
                          editingMode.image === preset.url 
                            ? 'border-purple-500 shadow-md shadow-purple-500/30' 
                            : 'border-white/10 hover:border-white/30'
                        }`}
                      >
                        <SafeImage src={preset.url} alt={preset.name} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center p-1 text-center">
                          <span className="text-[7px] font-black uppercase text-white leading-tight">
                            {preset.name}
                          </span>
                        </div>
                        {editingMode.image === preset.url && (
                          <div className="absolute top-1 right-1 bg-purple-600 rounded-full p-0.5">
                            <Check size={10} className="text-white" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Custom URL or Upload Input */}
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        value={editingMode.image || ''}
                        onChange={(e) => setEditingMode({ ...editingMode, image: e.target.value })}
                        placeholder="https://image-url.jpg"
                        className="flex-1 bg-black border border-white/10 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-purple-500 text-white"
                      />
                      <button 
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="px-3 bg-neutral-800 border border-white/10 rounded-xl text-neutral-300 hover:text-white transition-all disabled:opacity-50 flex items-center gap-1 text-[9px] font-black uppercase"
                      >
                        {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                        <span>Upload</span>
                      </button>
                      <input 
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/*"
                        onChange={handleImageUpload}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-white/5 grid grid-cols-2 gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setEditingMode(null)}
                  className="w-full bg-neutral-800 hover:bg-neutral-700 py-3.5 rounded-xl text-neutral-300 font-black uppercase tracking-widest text-[10px] transition-all active:scale-95"
                >
                  Cancel
                </button>
                <button 
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || !editingMode.title?.trim()}
                  className="w-full bg-purple-600 hover:bg-purple-700 py-3.5 rounded-xl text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-purple-600/30 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSaving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                  <span>{editingMode.id ? 'Update Mode' : 'Save Mode'}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {modeToDelete && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-sm bg-neutral-900 border border-white/10 rounded-3xl p-6 shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 text-red-500 border border-red-500/20">
                <Trash2 size={32} />
              </div>
              
              <h3 className="text-lg font-black italic uppercase tracking-tight mb-1">
                Delete <span className="text-red-500">Mode?</span>
              </h3>
              
              <p className="text-xs text-neutral-400 font-medium mb-6 leading-relaxed">
                Are you sure you want to delete <span className="text-white font-bold">{modeToDelete.title}</span>?
              </p>

              <div className="grid grid-cols-2 gap-3">
                <button
                  disabled={isDeleting}
                  onClick={() => setModeToDelete(null)}
                  className="bg-neutral-800 hover:bg-neutral-700 py-3 rounded-xl text-neutral-400 font-black uppercase tracking-widest text-[10px] transition-all active:scale-95 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  disabled={isDeleting}
                  onClick={confirmDelete}
                  className="bg-red-600 hover:bg-red-700 py-3 rounded-xl text-white font-black uppercase tracking-widest text-[10px] transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-red-600/20 flex items-center justify-center gap-2"
                >
                  {isDeleting ? <Loader2 size={14} className="animate-spin" /> : 'Yes, Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
