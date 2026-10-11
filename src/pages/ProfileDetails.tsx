import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, User as UserIcon, Mail, Phone, Lock, Edit2, Check, X, Loader2, Gamepad2 } from 'lucide-react';
import { Page, User } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';

interface ProfileDetailsProps {
  user: User;
  onPageChange: (page: Page) => void;
}

export default function ProfileDetails({ user, onPageChange }: ProfileDetailsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [username, setUsername] = useState(user.username);
  const [phone, setPhone] = useState(user.phone);
  const [ffIgn, setFfIgn] = useState(user.gameIGNs?.freefire || user.ign || '');
  const [bgmiIgn, setBgmiIgn] = useState(user.gameIGNs?.bgmi || '');
  const [codmIgn, setCodmIgn] = useState(user.gameIGNs?.codm || '');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleUpdateProfile = async () => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', auth.currentUser?.uid || ''), {
        username,
        phone,
        ign: ffIgn,
        gameIGNs: {
          freefire: ffIgn,
          bgmi: bgmiIgn,
          codm: codmIgn
        }
      });
      setIsEditing(false);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${auth.currentUser?.uid}`);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!user.email) return;
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, user.email);
      setResetSent(true);
      setTimeout(() => setResetSent(false), 5000);
    } catch (e) {
      console.error(e);
      alert('Failed to send password reset email. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

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
              Personal <span className="text-purple-500">Details</span>
            </h2>
            <p className="text-[8px] font-black uppercase tracking-widest text-neutral-600 mt-1">Manage your identity</p>
          </div>
        </div>

        {/* Profile Card */}
        <div className="space-y-6">
          <div className="p-8 bg-neutral-900 border border-neutral-800 rounded-[2.5rem] relative overflow-hidden">
             <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 blur-3xl rounded-full -mr-16 -mt-16" />
             
             <div className="flex items-center justify-between mb-8">
                <div className="w-16 h-16 bg-neutral-800 border border-neutral-700 rounded-2xl flex items-center justify-center text-purple-500 shadow-inner">
                   <UserIcon size={32} />
                </div>
                {!isEditing ? (
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="p-3 bg-white text-black rounded-xl active:scale-90 transition-transform shadow-lg"
                  >
                    <Edit2 size={16} />
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setIsEditing(false)}
                      className="p-3 bg-neutral-800 text-neutral-400 rounded-xl hover:text-white transition-colors"
                    >
                      <X size={16} />
                    </button>
                    <button 
                      onClick={handleUpdateProfile}
                      disabled={loading}
                      className="p-3 bg-purple-600 text-white rounded-xl shadow-lg shadow-purple-600/30 active:scale-95 transition-all"
                    >
                      {loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    </button>
                  </div>
                )}
             </div>

             <div className="space-y-6">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 ml-1 mb-2 block">Username</label>
                  {isEditing ? (
                    <input 
                      autoFocus
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none focus:border-purple-500 transition-all"
                    />
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3 bg-black/40 border border-neutral-800 rounded-xl">
                      <UserIcon size={14} className="text-neutral-700" />
                      <span className="text-sm font-bold text-neutral-300">{user.username}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 ml-1 mb-2 block">Mobile Number</label>
                  {isEditing ? (
                    <input 
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none focus:border-purple-500 transition-all"
                    />
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3 bg-black/40 border border-neutral-800 rounded-xl">
                      <Phone size={14} className="text-neutral-700" />
                      <span className="text-sm font-bold text-neutral-300">{user.phone}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-neutral-600 ml-1 mb-2 block">Email Address</label>
                  <div className="flex items-center justify-between px-4 py-3 bg-black/20 border border-neutral-800 rounded-xl opacity-60">
                    <div className="flex items-center gap-3 ">
                      <Mail size={14} className="text-neutral-700" />
                      <span className="text-sm font-bold text-neutral-500">{user.email}</span>
                    </div>
                    <Lock size={12} className="text-neutral-800" />
                  </div>
                </div>
             </div>
          </div>

          {/* Game In-Game Names (IGN) */}
          <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-3xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Gamepad2 size={16} className="text-cyan-400" />
                <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Game In-Game Names (IGN)</h4>
              </div>
              {!isEditing && (
                <button 
                  onClick={() => setIsEditing(true)}
                  className="text-[10px] font-black uppercase text-purple-400 hover:underline"
                >
                  Edit IGNs
                </button>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[9px] font-bold uppercase text-neutral-500 mb-1 block">Free Fire IGN</label>
                {isEditing ? (
                  <input
                    type="text"
                    placeholder="Enter Free Fire IGN"
                    value={ffIgn}
                    onChange={(e) => setFfIgn(e.target.value)}
                    className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-2.5 text-xs font-bold text-white outline-none focus:border-cyan-400"
                  />
                ) : (
                  <div className="px-4 py-2.5 bg-black/40 border border-neutral-800 rounded-xl text-xs font-bold text-neutral-200">
                    {ffIgn || <span className="text-neutral-600 italic">Not set</span>}
                  </div>
                )}
              </div>

              <div>
                <label className="text-[9px] font-bold uppercase text-neutral-500 mb-1 block">BGMI IGN</label>
                {isEditing ? (
                  <input
                    type="text"
                    placeholder="Enter BGMI IGN"
                    value={bgmiIgn}
                    onChange={(e) => setBgmiIgn(e.target.value)}
                    className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-2.5 text-xs font-bold text-white outline-none focus:border-cyan-400"
                  />
                ) : (
                  <div className="px-4 py-2.5 bg-black/40 border border-neutral-800 rounded-xl text-xs font-bold text-neutral-200">
                    {bgmiIgn || <span className="text-neutral-600 italic">Not set</span>}
                  </div>
                )}
              </div>

              <div>
                <label className="text-[9px] font-bold uppercase text-neutral-500 mb-1 block">COD Mobile IGN</label>
                {isEditing ? (
                  <input
                    type="text"
                    placeholder="Enter CODM IGN"
                    value={codmIgn}
                    onChange={(e) => setCodmIgn(e.target.value)}
                    className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-2.5 text-xs font-bold text-white outline-none focus:border-cyan-400"
                  />
                ) : (
                  <div className="px-4 py-2.5 bg-black/40 border border-neutral-800 rounded-xl text-xs font-bold text-neutral-200">
                    {codmIgn || <span className="text-neutral-600 italic">Not set</span>}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Security Action */}
          <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-3xl">
             <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-4 ml-1">Account Security</h4>
             <button 
               onClick={handleResetPassword}
               disabled={loading || resetSent}
               className={`w-full py-4 text-[10px] font-black uppercase tracking-widest rounded-2xl flex items-center justify-center gap-3 transition-all ${
                resetSent 
                  ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                  : 'bg-black text-white hover:bg-neutral-800 active:scale-[0.98]'
               }`}
             >
               {resetSent ? (
                 <>
                  <Check size={16} />
                  Reset Link Sent to Email
                 </>
               ) : (
                 <>
                   <Lock size={16} className="text-purple-500" />
                   Change Password
                 </>
               )}
             </button>
             {!resetSent && (
               <p className="text-[8px] font-bold text-neutral-600 uppercase tracking-widest mt-4 text-center">
                 A secure link will be sent to your registered email
               </p>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}
