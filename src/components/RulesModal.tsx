import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Shield, Star, Sword, Target, Loader2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  section: string;
  onJoin: () => void;
  isJoined: boolean;
}

export default function RulesModal({ isOpen, onClose, section, onJoin, isJoined }: RulesModalProps) {
  const [agreed, setAgreed] = useState(false);
  const [rules, setRules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const normalizeSectionKey = (secName: string) => {
    return (secName || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
  };

  const getIcon = (sec: string) => {
    const s = (sec || '').toLowerCase();
    if (s.includes('clash') || s.includes('4v4')) return <Shield className="text-blue-500" size={20} />;
    if (s.includes('lone') || s.includes('wolf') || s.includes('1v1') || s.includes('2v2')) return <Target className="text-pink-500" size={20} />;
    if (s.includes('sniper')) return <Target className="text-amber-500" size={20} />;
    if (s.includes('custom')) return <Star className="text-purple-500" size={20} />;
    return <Sword className="text-emerald-500" size={20} />;
  };

  const badgeStyles = (sec: string) => {
    const s = (sec || '').toLowerCase();
    if (s.includes('clash') || s.includes('4v4')) return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    if (s.includes('lone') || s.includes('wolf') || s.includes('1v1') || s.includes('2v2')) return 'bg-pink-500/10 text-pink-500 border-pink-500/20';
    if (s.includes('sniper')) return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    if (s.includes('custom')) return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
    return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
  };

  useEffect(() => {
    if (isOpen) {
      setAgreed(false);
      setLoading(true);
      const fetchRules = async () => {
        try {
          const s = (section || 'Battle Royale').toLowerCase().trim();
          const normKey = normalizeSectionKey(s);

          // 1. Try exact sanitized ID
          let docSnap = await getDoc(doc(db, 'gameRules', normKey));

          // 2. Fallback to common aliases
          if (!docSnap.exists()) {
            if (s.includes('headshot')) {
              docSnap = await getDoc(doc(db, 'gameRules', 'cs_headshot'));
            } else if (s.includes('free')) {
              docSnap = await getDoc(doc(db, 'gameRules', 'free_match'));
            } else if (s.includes('clash') || s.includes('cs') || s.includes('4v4')) {
              docSnap = await getDoc(doc(db, 'gameRules', 'clash_squad'));
            } else if (s.includes('lone') || s.includes('wolf') || s.includes('1v1') || s.includes('2v2')) {
              docSnap = await getDoc(doc(db, 'gameRules', 'lone_wolf'));
            } else if (s.includes('sniper')) {
              docSnap = await getDoc(doc(db, 'gameRules', 'sniper_only'));
            } else if (s.includes('custom')) {
              docSnap = await getDoc(doc(db, 'gameRules', 'custom_room'));
            } else {
              docSnap = await getDoc(doc(db, 'gameRules', 'battle_royale'));
            }
          }

          if (docSnap.exists() && docSnap.data().rules && docSnap.data().rules.length > 0) {
            setRules(docSnap.data().rules);
          } else {
            // Fallback rules if doc doesn't exist yet
            setRules([
              'Fair Play: No hacking, scripts or third-party tools allowed.',
              'Device Requirements: Mobile and Tablet players only. Strictly no emulators.',
              'Verification: Screenshot of victory/final scorecard is mandatory in case of disputes.',
              'Late Entry: Room closes right before match starts. Late entry is not entertained.',
              'Admin Decision: Admin decision will be final and binding for all participants.'
            ]);
          }
        } catch (error) {
          console.error("Error fetching rules:", error);
        } finally {
          setLoading(false);
        }
      };
      fetchRules();
    }
  }, [isOpen, section]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/90 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Decoration */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 blur-3xl rounded-full -mr-16 -mt-16" />

            <div className="flex items-center justify-between mb-6 relative">
              <div>
                <h3 className="text-sm font-black italic uppercase tracking-tight text-white">Match Rules</h3>
                <p className="text-[8px] font-black text-neutral-500 uppercase tracking-widest mt-0.5">Read carefully before deployment</p>
              </div>
              <button 
                onClick={onClose}
                className="p-2 bg-neutral-800 text-neutral-400 rounded-xl hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className={`mb-6 p-3 rounded-2xl border flex items-center gap-3 ${badgeStyles(section)}`}>
               <div className="p-2 bg-black/20 rounded-xl">
                 {getIcon(section)}
               </div>
               <span className="text-[10px] font-black uppercase tracking-widest">{section === 'Battle Royale' ? 'Battle Royale' : section}</span>
            </div>

            <div className="max-h-[40vh] overflow-y-auto no-scrollbar mb-8 space-y-4 pr-1">
              {loading ? (
                <div className="py-12 flex flex-col items-center justify-center text-neutral-600">
                  <Loader2 className="animate-spin mb-2" size={24} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Loading Regulations...</span>
                </div>
              ) : rules.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-neutral-600 italic">No rules set by admin</p>
                </div>
              ) : (
                rules.map((rule, idx) => (
                  <div key={idx} className="flex gap-4 group">
                    <span className="text-purple-500 mt-1.5 shrink-0">•</span>
                    <p className="text-[11px] font-medium text-neutral-400 leading-relaxed group-hover:text-neutral-300 transition-colors">
                      {rule}
                    </p>
                  </div>
                ))
              )}
            </div>

            {!isJoined && (
              <div className="mb-8">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative flex items-center justify-center">
                    <input 
                      type="checkbox" 
                      className="peer appearance-none w-5 h-5 border border-neutral-700 rounded-lg checked:bg-purple-600 checked:border-purple-600 transition-all cursor-pointer"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                    />
                    <div className="absolute text-white scale-0 peer-checked:scale-100 transition-transform pointer-events-none">
                      <Star size={10} fill="currentColor" />
                    </div>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500 group-hover:text-neutral-300 transition-colors italic">
                    I agree to all the rules
                  </span>
                </label>
              </div>
            )}

            <button 
              disabled={!isJoined && !agreed}
              onClick={() => {
                if (isJoined || agreed) {
                  onJoin();
                  onClose();
                }
              }}
              className={`w-full py-4 text-[10px] font-black uppercase tracking-widest rounded-2xl active:scale-95 transition-all shadow-xl ${
                isJoined || agreed
                  ? 'bg-purple-600 text-white shadow-purple-600/20'
                  : 'bg-neutral-800 text-neutral-600 cursor-not-allowed border border-neutral-700'
              }`}
            >
              Join Match
            </button>
            
            {!agreed && !isJoined && (
              <p className="text-[8px] text-center text-neutral-600 font-black uppercase tracking-widest mt-4">
                Requirement: Validation of rules mandatory
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
