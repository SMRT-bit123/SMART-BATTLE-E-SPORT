import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, Send, Mail, X, ExternalLink, ShieldCheck, ChevronRight, Loader2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SupportModal({ isOpen, onClose }: SupportModalProps) {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      const fetchSettings = async () => {
        try {
          const snap = await getDoc(doc(db, 'appSettings', 'referral_support'));
          if (snap.exists()) {
            setSettings(snap.data().support);
          }
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      };
      fetchSettings();
    }
  }, [isOpen]);

  const supportOptions = [
    { 
      label: 'WhatsApp', 
      icon: MessageSquare, 
      color: 'bg-[#25D366]', 
      link: settings?.whatsapp || 'https://wa.me/',
      desc: 'Instant replies (9 AM - 9 PM)'
    },
    { 
      label: 'Telegram', 
      icon: Send, 
      color: 'bg-[#0088cc]', 
      link: settings?.telegram || 'https://t.me/',
      desc: 'Join our community channel'
    },
    { 
      label: 'Email', 
      icon: Mail, 
      color: 'bg-purple-600', 
      link: `mailto:${settings?.email || 'support@khelgalli.com'}`,
      desc: 'For business & technical queries'
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 md:p-5">
           <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
           />
           
           <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="relative w-full max-w-lg bg-neutral-900 rounded-t-[3rem] p-8 pb-12 border-t border-neutral-800 flex flex-col max-h-[80vh] overflow-hidden"
           >
             <div className="flex justify-between items-center mb-8">
               <div>
                  <h3 className="text-xl font-bold tracking-tighter uppercase italic text-white leading-none">
                    Customer <span className="text-purple-500">Support</span>
                  </h3>
                  <p className="text-[8px] font-black uppercase tracking-widest text-neutral-600 mt-1">We're here to help you</p>
               </div>
               <button onClick={onClose} className="p-2 text-neutral-500 hover:text-white transition-colors">
                 <X size={24} />
               </button>
             </div>

             <div className="overflow-y-auto no-scrollbar space-y-6">
                {/* Status Card */}
                <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl flex items-center justify-between">
                   <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500">System Status: Operational</span>
                   </div>
                   <ShieldCheck size={14} className="text-emerald-500/30" />
                </div>

                {loading ? (
                  <div className="py-20 flex flex-col items-center justify-center">
                    <Loader2 className="text-purple-500 animate-spin mb-4" size={32} />
                    <p className="text-[10px] font-black uppercase tracking-widest text-neutral-600 italic">Syncing communication channels...</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {supportOptions.map((opt) => (
                      <a 
                        key={opt.label}
                        href={opt.link}
                        target="_blank"
                        rel="noreferrer"
                        className="p-5 bg-neutral-800 border border-neutral-700 rounded-3xl flex items-center justify-between group active:scale-[0.98] transition-all hover:bg-neutral-800/80 hover:border-purple-500/30"
                      >
                        <div className="flex items-center gap-5">
                          <div className={`w-12 h-12 rounded-2xl ${opt.color} flex items-center justify-center text-white shadow-lg`}>
                            <opt.icon size={24} />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold uppercase tracking-tight text-white">{opt.label}</h4>
                            <p className="text-[9px] font-black uppercase tracking-widest text-neutral-500 italic">{opt.desc}</p>
                          </div>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-black/40 flex items-center justify-center text-neutral-600 group-hover:text-purple-500 transition-colors">
                           <ChevronRight size={18} />
                        </div>
                      </a>
                    ))}
                  </div>
                )}
                
                <div className="p-6 bg-black/40 rounded-3xl border border-white/5 mt-4">
                   <p className="text-[8px] font-black italic text-neutral-600 uppercase tracking-[0.2em] leading-relaxed text-center">
                      Our support team typically responds within 30-60 minutes during active hours. For transaction issues, please provide your Transaction ID.
                   </p>
                </div>
             </div>
           </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
