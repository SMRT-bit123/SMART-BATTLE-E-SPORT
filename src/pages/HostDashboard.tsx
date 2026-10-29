import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Gamepad2, 
  Key, 
  Users, 
  Award, 
  ChevronLeft, 
  Clock, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  Upload, 
  Save, 
  Eye, 
  Trophy,
  Swords,
  RefreshCw,
  Layers,
  Calendar,
  Check
} from 'lucide-react';
import { Page, User, Tournament, HostAssignment, MatchResultSubmission, MatchParticipantResult } from '../types';
import { auth, db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

interface HostDashboardProps {
  user: User;
  onPageChange: (page: Page, param?: string) => void;
}

export default function HostDashboard({ user, onPageChange }: HostDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState<HostAssignment | null>(null);
  const [modeMatches, setModeMatches] = useState<Tournament[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [matchData, setMatchData] = useState<Tournament | null>(null);
  const [activeTab, setActiveTab] = useState<'room' | 'players' | 'result'>('room');

  // Room credentials form state
  const [roomId, setRoomId] = useState('');
  const [roomPassword, setRoomPassword] = useState('');
  const [roomReleaseTime, setRoomReleaseTime] = useState('');
  const [isUpdatingRoom, setIsUpdatingRoom] = useState(false);
  const [roomSuccessMsg, setRoomSuccessMsg] = useState<string | null>(null);
  const [roomErrorMsg, setRoomErrorMsg] = useState<string | null>(null);

  // Result submission state
  const [participantResults, setParticipantResults] = useState<MatchParticipantResult[]>([]);
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSubmittingResult, setIsSubmittingResult] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState<MatchResultSubmission | null>(null);
  const [resultErrorMsg, setResultErrorMsg] = useState<string | null>(null);
  const [resultSuccessMsg, setResultSuccessMsg] = useState<string | null>(null);

  const selectMatch = (targetMatch: Tournament) => {
    setSelectedMatchId(targetMatch.id);
    setMatchData(targetMatch);
    setRoomId(targetMatch.roomId || '');
    setRoomPassword(targetMatch.roomPassword || '');
    setRoomReleaseTime(targetMatch.roomReleaseTime || '');
    setRoomSuccessMsg(null);
    setRoomErrorMsg(null);
    setResultSuccessMsg(null);
    setResultErrorMsg(null);
    setProofImage(null);

    // Prepare participant results form from actual joined match players
    const players = (targetMatch.players || []) as any[];
    const initialResults: MatchParticipantResult[] = players.map((p, index) => ({
      userId: p.userId,
      username: p.username || `Player ${index + 1}`,
      ign: p.ign || '',
      slot: p.slot || index + 1,
      rank: index + 1,
      kills: 0,
      winnings: 0
    }));
    setParticipantResults(initialResults);
  };

  const fetchHostAssignment = async () => {
    try {
      setLoading(true);
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setLoading(false);
        return;
      }

      const res = await fetch('/api/host/assignment', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();

      if (data.success && data.hasActiveAssignment && data.assignment) {
        setAssignment(data.assignment);
        const matches: Tournament[] = data.matches || (data.match ? [data.match] : []);
        setModeMatches(matches);

        // Keep currently selected match if still valid, otherwise select first match
        const chosen = matches.find(m => m.id === selectedMatchId) || matches[0] || null;
        if (chosen) {
          selectMatch(chosen);
        } else {
          setMatchData(null);
        }
      } else {
        setAssignment(null);
        setModeMatches([]);
        setMatchData(null);
      }
    } catch (err) {
      console.error('[Host Dashboard] fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHostAssignment();
  }, [user]);

  // Listen to match real-time updates for the selected match
  useEffect(() => {
    if (!matchData?.id) return;

    const unsubMatch = onSnapshot(doc(db, 'matches', matchData.id), (snap) => {
      if (snap.exists()) {
        const d = { id: snap.id, ...snap.data() } as Tournament;
        setMatchData(d);
        // Also update the match inside modeMatches array
        setModeMatches(prev => prev.map(m => m.id === d.id ? d : m));
      }
    });

    const unsubPending = onSnapshot(doc(db, 'pendingResults', matchData.id), (snap) => {
      if (snap.exists()) {
        setSubmissionStatus({ id: snap.id, ...snap.data() } as MatchResultSubmission);
      } else {
        setSubmissionStatus(null);
      }
    });

    return () => {
      unsubMatch();
      unsubPending();
    };
  }, [matchData?.id]);

  // Update Room Details Handler
  const handleSaveRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchData?.id) return;

    setIsUpdatingRoom(true);
    setRoomSuccessMsg(null);
    setRoomErrorMsg(null);

    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/host/update-room', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          matchId: matchData.id,
          roomId,
          roomPassword,
          roomReleaseTime
        })
      });

      const data = await res.json();
      if (data.success) {
        setRoomSuccessMsg('Room details successfully saved and published for players!');
        setTimeout(() => setRoomSuccessMsg(null), 4000);
      } else {
        setRoomErrorMsg(data.error || 'Failed to update room details');
      }
    } catch (err: any) {
      setRoomErrorMsg(err.message || 'Network error updating room credentials');
    } finally {
      setIsUpdatingRoom(false);
    }
  };

  // Proof screenshot upload
  const handleScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        const res = await fetch('/api/upload-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: base64,
            filename: file.name
          })
        });
        const d = await res.json();
        if (d.url) {
          setProofImage(d.url);
        } else {
          alert('Failed to upload image screenshot');
        }
        setIsUploadingImage(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setIsUploadingImage(false);
      alert('Upload error');
    }
  };

  // Calculate winnings helper based on match prize structure
  const handleUpdatePlayerResult = (index: number, field: 'rank' | 'kills' | 'winnings', value: number) => {
    setParticipantResults(prev => {
      const copy = [...prev];
      const player = { ...copy[index], [field]: value };

      // Auto-compute winnings if per-kill or rank prize exists
      if (field === 'kills' || field === 'rank') {
        const perKill = Number(matchData?.perKillAmount || 0);
        let win = (player.kills || 0) * perKill;

        if (player.rank === 1 && matchData?.prizePool) {
          const pool = Number(matchData.prizePool);
          win += matchData.positionPrizeDistribution?.[1] || Math.round(pool * 0.5);
        } else if (matchData?.positionPrizeDistribution?.[player.rank]) {
          win += matchData.positionPrizeDistribution[player.rank];
        }

        player.winnings = win;
      }

      copy[index] = player;
      return copy;
    });
  };

  // Submit Match Results Handler
  const handleSubmitResults = async () => {
    if (!matchData?.id) return;

    setIsSubmittingResult(true);
    setResultErrorMsg(null);
    setResultSuccessMsg(null);

    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/host/submit-result', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          matchId: matchData.id,
          results: participantResults,
          proofScreenshotUrl: proofImage
        })
      });

      const data = await res.json();
      if (data.success) {
        setResultSuccessMsg('Match results submitted for administrator review! Once approved by an Admin, prizes will be credited to winning players.');
        setShowSubmitConfirm(false);
      } else {
        setResultErrorMsg(data.error || 'Failed to submit match results');
      }
    } catch (err: any) {
      setResultErrorMsg(err.message || 'Error submitting results');
    } finally {
      setIsSubmittingResult(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0f19] text-white flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs uppercase font-black tracking-widest text-neutral-400">Loading Host Dashboard...</p>
      </div>
    );
  }

  // No active assignment state
  if (!assignment) {
    return (
      <div className="min-h-screen bg-[#0b0f19] text-white p-6 flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl flex items-center justify-center text-emerald-400 mb-6">
          <Gamepad2 size={40} />
        </div>
        <h1 className="text-2xl font-black italic tracking-wide mb-2">No Active Host Assignment</h1>
        <p className="text-sm text-neutral-400 max-w-sm mb-6 leading-relaxed">
          You are not currently designated as an active host. SMART BATTLE administrators assign hosts to specific Game Modes (e.g. CS Headshot, BR Solo, etc.).
        </p>
        <button
          onClick={() => onPageChange(Page.HOME)}
          className="px-6 py-3 bg-neutral-900 border border-neutral-700 hover:border-emerald-500 rounded-2xl text-xs font-black uppercase tracking-wider text-white transition-all active:scale-95"
        >
          Return to Home
        </button>
      </div>
    );
  }

  const assignedModeTitle = assignment.modeTitle || assignment.modeId || 'Game Mode';
  const joinedPlayers = matchData?.players || [];

  return (
    <div className="min-h-screen bg-[#0b0f19] text-white pb-28">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-[#0f172a]/90 backdrop-blur-md border-b border-neutral-800 px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onPageChange(Page.PROFILE)}
            className="p-2 bg-neutral-900 hover:bg-neutral-800 rounded-xl text-neutral-300 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
                <ShieldCheck size={11} /> Mode Host
              </span>
              <span className="text-[10px] text-neutral-400 font-mono">Mode: {assignment.modeId}</span>
            </div>
            <h1 className="text-sm font-black italic text-white truncate max-w-[220px]">
              {assignedModeTitle}
            </h1>
          </div>
        </div>

        <button
          onClick={fetchHostAssignment}
          title="Refresh matches"
          className="p-2 bg-neutral-900 hover:bg-neutral-800 rounded-xl text-neutral-400 hover:text-white transition-colors flex items-center gap-1 text-xs"
        >
          <RefreshCw size={15} />
        </button>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-4">
        {/* Game Mode Host Banner */}
        <div className="bg-gradient-to-r from-emerald-950/40 via-neutral-900 to-neutral-950 border border-emerald-500/30 rounded-3xl p-4 mb-4 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Gamepad2 size={24} />
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400">Assigned Game Mode</p>
              <h2 className="text-base font-black italic text-white">{assignedModeTitle}</h2>
              <p className="text-[10px] text-neutral-400">Authorized for all eligible matches in this mode</p>
            </div>
          </div>
          <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[10px] font-black uppercase text-emerald-400">
            {modeMatches.length} {modeMatches.length === 1 ? 'Match' : 'Matches'}
          </span>
        </div>

        {/* If no matches exist for this mode yet */}
        {modeMatches.length === 0 ? (
          <div className="bg-neutral-900/40 border border-dashed border-neutral-800 rounded-3xl p-8 text-center my-6">
            <Swords size={36} className="text-neutral-600 mx-auto mb-3" />
            <h3 className="text-sm font-black text-white italic mb-1">No Active Matches for {assignedModeTitle}</h3>
            <p className="text-xs text-neutral-400 max-w-xs mx-auto mb-4 leading-relaxed">
              There are currently no active or upcoming matches in this mode. Whenever an admin creates or schedules a match in {assignedModeTitle}, it will automatically appear here for you to host.
            </p>
            <button
              onClick={fetchHostAssignment}
              className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-xs font-black uppercase tracking-wider text-neutral-200 transition-colors inline-flex items-center gap-2"
            >
              <RefreshCw size={14} /> Check For New Matches
            </button>
          </div>
        ) : (
          <>
            {/* Match Selector Slider/Tabs if multiple matches exist */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400 flex items-center gap-1.5">
                  <Layers size={12} /> Select Match to Manage ({modeMatches.length})
                </span>
                {matchData && (
                  <span className="text-[10px] font-mono text-emerald-400">Active: {matchData.id.slice(0, 8)}...</span>
                )}
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1.5 scrollbar-none">
                {modeMatches.map((m) => {
                  const isSelected = matchData?.id === m.id;
                  const hasRoom = Boolean(m.roomId);
                  const pCount = (m.players || []).length;
                  return (
                    <button
                      key={m.id}
                      onClick={() => selectMatch(m)}
                      className={`shrink-0 min-w-[200px] text-left p-3.5 rounded-2xl border transition-all ${
                        isSelected 
                          ? 'bg-emerald-950/40 border-emerald-500 shadow-md shadow-emerald-500/10' 
                          : 'bg-neutral-900/60 border-neutral-800 hover:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${
                          hasRoom ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                        }`}>
                          {hasRoom ? 'Room Set' : 'Room Needed'}
                        </span>
                        <span className="text-[9px] text-neutral-400 font-mono">
                          {pCount}/{m.totalSlots || m.maxPlayers || 48}
                        </span>
                      </div>
                      <h4 className="text-xs font-black italic text-white truncate max-w-[170px]">{m.title}</h4>
                      <p className="text-[10px] text-neutral-400 flex items-center gap-1 mt-0.5">
                        <Clock size={10} className="text-emerald-400" /> {m.time}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Match Snapshot Card for Selected Match */}
            {matchData && (
              <div className="bg-gradient-to-br from-[#131d33] to-[#0d1424] border border-[#233554] rounded-3xl p-5 mb-5 shadow-xl relative overflow-hidden">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                      {matchData.section || matchData.mode || assignedModeTitle}
                    </span>
                    <h2 className="text-lg font-black italic text-white mt-0.5">{matchData.title}</h2>
                    <p className="text-xs text-neutral-400 flex items-center gap-1.5 mt-1 font-medium">
                      <Clock size={13} className="text-emerald-400" />
                      {matchData.time}
                    </p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                    matchData.status === 'completed'
                      ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                      : matchData.status === 'room_ready'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  }`}>
                    {matchData.status === 'room_ready' ? 'Room Ready' : matchData.status || 'Active'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/5 text-center">
                  <div className="bg-white/5 rounded-2xl p-2.5">
                    <p className="text-[9px] font-black uppercase text-neutral-400 tracking-wider">Entry Fee</p>
                    <p className="text-sm font-black text-white italic">₹{matchData.entryFee}</p>
                  </div>
                  <div className="bg-white/5 rounded-2xl p-2.5">
                    <p className="text-[9px] font-black uppercase text-neutral-400 tracking-wider">Prize Pool</p>
                    <p className="text-sm font-black text-amber-400 italic">₹{matchData.prizePool || matchData.prize}</p>
                  </div>
                  <div className="bg-white/5 rounded-2xl p-2.5">
                    <p className="text-[9px] font-black uppercase text-neutral-400 tracking-wider">Players</p>
                    <p className="text-sm font-black text-emerald-400 italic">
                      {joinedPlayers.length} / {matchData.totalSlots || matchData.maxPlayers || 48}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation Tabs */}
            <div className="flex bg-neutral-900/80 p-1 rounded-2xl border border-neutral-800 mb-5">
              <button
                onClick={() => setActiveTab('room')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === 'room'
                    ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Key size={14} />
                Room Details
              </button>
              <button
                onClick={() => setActiveTab('players')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === 'players'
                    ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Users size={14} />
                Players ({joinedPlayers.length})
              </button>
              <button
                onClick={() => setActiveTab('result')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === 'result'
                    ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Award size={14} />
                Declare Result
              </button>
            </div>

            {/* TAB 1: ROOM DETAILS */}
            {activeTab === 'room' && matchData && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-neutral-900/60 border border-neutral-800 rounded-3xl p-6"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-400 border border-emerald-500/20">
                    <Key size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white italic">Custom Match Room Settings</h3>
                    <p className="text-xs text-neutral-400">Share credentials so joined players can enter the custom room</p>
                  </div>
                </div>

                {roomSuccessMsg && (
                  <div className="p-3.5 mb-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center gap-2.5 text-xs font-bold text-emerald-400">
                    <CheckCircle2 size={16} className="shrink-0" />
                    {roomSuccessMsg}
                  </div>
                )}

                {roomErrorMsg && (
                  <div className="p-3.5 mb-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center gap-2.5 text-xs font-bold text-red-400">
                    <AlertCircle size={16} className="shrink-0" />
                    {roomErrorMsg}
                  </div>
                )}

                <form onSubmit={handleSaveRoom} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-neutral-400 mb-1.5">
                      Custom Room ID (Required)
                    </label>
                    <input
                      type="text"
                      value={roomId}
                      onChange={(e) => setRoomId(e.target.value)}
                      placeholder="e.g. 8492041"
                      required
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono tracking-wider transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-neutral-400 mb-1.5">
                      Room Password
                    </label>
                    <input
                      type="text"
                      value={roomPassword}
                      onChange={(e) => setRoomPassword(e.target.value)}
                      placeholder="e.g. 1234 or Leave blank if none"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono tracking-wider transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-neutral-400 mb-1.5">
                      Release Note / Schedule Time
                    </label>
                    <input
                      type="text"
                      value={roomReleaseTime}
                      onChange={(e) => setRoomReleaseTime(e.target.value)}
                      placeholder="e.g. Room opens 15 mins before match time"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isUpdatingRoom}
                    className="w-full mt-4 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase tracking-widest text-xs rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-98 transition-all disabled:opacity-50"
                  >
                    {isUpdatingRoom ? (
                      <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Save size={16} />
                        Publish Room Credentials
                      </>
                    )}
                  </button>
                </form>
              </motion.div>
            )}

            {/* TAB 2: PLAYERS ROSTER */}
            {activeTab === 'players' && matchData && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-black uppercase tracking-widest text-neutral-400">
                    Registered Participants ({joinedPlayers.length})
                  </h3>
                  <span className="text-[10px] text-emerald-400 font-bold">Live Roster</span>
                </div>

                {joinedPlayers.length === 0 ? (
                  <div className="bg-neutral-900/40 border border-dashed border-neutral-800 rounded-3xl p-8 text-center">
                    <Users size={32} className="text-neutral-600 mx-auto mb-2" />
                    <p className="text-xs text-neutral-400">No players have joined this match yet.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {joinedPlayers.map((player: any, idx: number) => (
                      <div
                        key={player.userId || idx}
                        className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-3.5 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center font-black text-xs text-neutral-300">
                            {player.slot || idx + 1}
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-white italic">{player.username}</h4>
                            <p className="text-[10px] text-neutral-500 font-mono">
                              IGN: <span className="text-emerald-400 font-semibold">{player.ign || 'N/A'}</span>
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono text-neutral-500 bg-neutral-950 px-2 py-1 rounded-lg">
                          UID: {player.userId?.substring(0, 6)}...
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* TAB 3: DECLARE RESULTS */}
            {activeTab === 'result' && matchData && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                {/* Review Status Banner */}
                {submissionStatus && (
                  <div className={`p-4 rounded-3xl border flex items-start gap-3 ${
                    submissionStatus.status === 'approved'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : submissionStatus.status === 'rejected'
                      ? 'bg-red-500/10 border-red-500/30 text-red-400'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  }`}>
                    <ShieldCheck size={20} className="shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider">
                        {submissionStatus.status === 'approved'
                          ? 'Results Verified & Approved by Admin'
                          : submissionStatus.status === 'rejected'
                          ? 'Results Rejected by Admin'
                          : 'Results Submitted — Awaiting Admin Approval'}
                      </h4>
                      <p className="text-[11px] text-neutral-300 mt-1 leading-relaxed">
                        {submissionStatus.status === 'approved'
                          ? 'Winning prize coins have been distributed to players and the match is finalized.'
                          : submissionStatus.status === 'rejected'
                          ? `Reason: ${submissionStatus.rejectionReason || 'Please review and resubmit correct scoreboard.'}`
                          : 'An administrator is verifying the score sheet before wallets are credited.'}
                      </p>
                    </div>
                  </div>
                )}

                <div className="bg-neutral-900/60 border border-neutral-800 rounded-3xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-black text-white italic">Match Score Sheet</h3>
                      <p className="text-[10px] text-neutral-400">Record final positions, kills, and calculate winnings</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] font-black uppercase text-neutral-400 tracking-wider block">Per Kill Rate</span>
                      <span className="text-xs font-black text-emerald-400 italic">₹{matchData.perKillAmount || 0}</span>
                    </div>
                  </div>

                  {resultSuccessMsg && (
                    <div className="p-3 mb-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-xs font-bold text-emerald-400">
                      {resultSuccessMsg}
                    </div>
                  )}

                  {resultErrorMsg && (
                    <div className="p-3 mb-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-xs font-bold text-red-400">
                      {resultErrorMsg}
                    </div>
                  )}

                  {/* Player Score Inputs */}
                  {participantResults.length === 0 ? (
                    <p className="text-xs text-neutral-500 text-center py-6">
                      No participants available to score.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {participantResults.map((player, idx) => (
                        <div
                          key={player.userId || idx}
                          className="bg-neutral-950/70 border border-neutral-800/80 rounded-2xl p-3.5 space-y-2.5"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <span className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center text-[10px] font-black">
                                #{idx + 1}
                              </span>
                              <div>
                                <p className="text-xs font-black text-white italic leading-tight">{player.username}</p>
                                <p className="text-[9px] text-neutral-500 font-mono">IGN: {player.ign || 'N/A'}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-[9px] font-black uppercase text-neutral-400 tracking-wider block">Est. Winnings</span>
                              <span className="text-xs font-black text-amber-400 italic">₹{player.winnings || 0}</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-white/5">
                            <div>
                              <label className="block text-[8px] font-black uppercase tracking-wider text-neutral-400 mb-1">
                                Rank
                              </label>
                              <input
                                type="number"
                                min="1"
                                value={player.rank}
                                onChange={(e) => handleUpdatePlayerResult(idx, 'rank', parseInt(e.target.value) || 1)}
                                className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-2.5 py-1.5 text-xs text-center text-white font-black focus:outline-none focus:border-emerald-500"
                              />
                            </div>

                            <div>
                              <label className="block text-[8px] font-black uppercase tracking-wider text-neutral-400 mb-1">
                                Kills
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={player.kills}
                                onChange={(e) => handleUpdatePlayerResult(idx, 'kills', parseInt(e.target.value) || 0)}
                                className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-2.5 py-1.5 text-xs text-center text-white font-black focus:outline-none focus:border-emerald-500"
                              />
                            </div>

                            <div>
                              <label className="block text-[8px] font-black uppercase tracking-wider text-neutral-400 mb-1">
                                Prize (₹)
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={player.winnings}
                                onChange={(e) => handleUpdatePlayerResult(idx, 'winnings', parseFloat(e.target.value) || 0)}
                                className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-2.5 py-1.5 text-xs text-center text-amber-400 font-black focus:outline-none focus:border-emerald-500"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Scoreboard Screenshot Attachment */}
                  <div className="mt-5 pt-4 border-t border-neutral-800">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-neutral-400 mb-2">
                      Match End Scoreboard Screenshot (Optional Proof)
                    </label>
                    <div className="flex items-center gap-3">
                      <label className="cursor-pointer px-4 py-2.5 bg-neutral-950 border border-neutral-800 hover:border-neutral-700 rounded-xl text-xs font-black uppercase tracking-wider text-neutral-300 flex items-center gap-2 transition-colors">
                        <Upload size={14} />
                        {isUploadingImage ? 'Uploading...' : 'Choose Screenshot'}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleScreenshotUpload}
                          disabled={isUploadingImage}
                          className="hidden"
                        />
                      </label>
                      {proofImage && (
                        <a
                          href={proofImage}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-emerald-400 underline font-mono flex items-center gap-1"
                        >
                          <Eye size={12} /> View Uploaded Proof
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="button"
                    onClick={() => setShowSubmitConfirm(true)}
                    disabled={participantResults.length === 0 || isSubmittingResult}
                    className="w-full mt-6 py-3.5 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-widest text-xs rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-98 transition-all disabled:opacity-50"
                  >
                    <Award size={16} />
                    Submit Results For Admin Verification
                  </button>
                </div>
              </motion.div>
            )}
          </>
        )}
      </div>

      {/* Confirmation Modal Before Submission */}
      <AnimatePresence>
        {showSubmitConfirm && matchData && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 max-w-sm w-full text-center"
            >
              <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <ShieldCheck size={28} />
              </div>
              <h3 className="text-base font-black italic text-white mb-2">Confirm Result Submission?</h3>
              <p className="text-xs text-neutral-400 mb-6 leading-relaxed">
                You are submitting results for <span className="text-white font-bold">{participantResults.length}</span> players in <span className="text-emerald-400 font-bold">{matchData.title}</span>. This will be transmitted to the Admin Panel for review. Hosts cannot self-approve winnings.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowSubmitConfirm(false)}
                  disabled={isSubmittingResult}
                  className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-xs font-black uppercase tracking-wider text-neutral-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmitResults}
                  disabled={isSubmittingResult}
                  className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
                >
                  {isSubmittingResult ? (
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  ) : (
                    'Confirm & Send'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
