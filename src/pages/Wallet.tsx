import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Wallet as WalletIcon, 
  Gamepad2, 
  Plus, 
  ArrowRightFromLine, 
  ChevronRight, 
  ArrowDown, 
  Loader2, 
  History, 
  CheckCircle2, 
  AlertCircle,
  FileText,
  X,
  Calendar,
  Filter
} from 'lucide-react';
import { Page, User, Transaction } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, limit } from 'firebase/firestore';

interface WalletPageProps {
  user: User;
  onPageChange: (page: Page) => void;
}

export default function WalletPage({ user, onPageChange }: WalletPageProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifyingOrder, setVerifyingOrder] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'success' | 'failed' | 'timeout' | null>(null);
  const [showStatementModal, setShowStatementModal] = useState(false);
  const [statementFilter, setStatementFilter] = useState<'all' | 'deposit' | 'withdraw' | 'match'>('all');

  useEffect(() => {
    // Check for payment status and order_id in URL for post-payment redirection
    const params = new URLSearchParams(window.location.search);
    const status = params.get('payment') as any;
    const orderId = params.get('order_id');

    if (status) {
      setPaymentStatus(status);
      setTimeout(() => setPaymentStatus(null), 10000);
    }

    if (orderId) {
      setVerifyingOrder(orderId);
      setTimeout(() => setVerifyingOrder(null), 15000);
    }

    // Clean URL params without page reload
    if (status || orderId) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc'),
      limit(30)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      setTransactions(txs);
      setLoading(false);
      
      if (verifyingOrder) {
        const found = txs.find(t => t.id === verifyingOrder && t.status === 'completed');
        if (found) {
          setVerifyingOrder(null);
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'transactions');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [verifyingOrder]);

  const totalBalance = (user.wallet?.deposit || 0) + (user.wallet?.winnings || 0) + (user.wallet?.bonus || 0);

  const formatTransactionDate = (createdAt: any) => {
    if (!createdAt) return 'RECENT';
    try {
      let date: Date;
      if (typeof createdAt?.toDate === 'function') {
        date = createdAt.toDate();
      } else if (createdAt?.seconds) {
        date = new Date(createdAt.seconds * 1000);
      } else {
        date = new Date(createdAt);
      }
      if (!date || isNaN(date.getTime())) return 'RECENT';
      
      const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
      const day = date.getDate();
      const time = date.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      return `${month} ${day}, ${time}`;
    } catch {
      return 'RECENT';
    }
  };

  const isCredit = (tx: Transaction) => {
    return tx.type === 'deposit' || tx.type === 'win' || tx.type === 'refund' || (tx.type as any) === 'bonus' || (tx.type as any) === 'referral';
  };

  const filteredTransactions = transactions.filter(tx => {
    if (statementFilter === 'all') return true;
    if (statementFilter === 'deposit') return tx.type === 'deposit';
    if (statementFilter === 'withdraw') return tx.type === 'withdraw';
    if (statementFilter === 'match') return tx.type === 'entry' || tx.type === 'win';
    return true;
  });

  return (
    <div className="min-h-screen bg-[#F5F7FB] text-[#172033] pb-24 max-w-lg mx-auto select-none">
      <div className="px-4 sm:px-5 pt-4 sm:pt-6 space-y-4">
        
        {/* ========================================================================= */}
        {/* 1. TOP HEADER (White card with Gamepad, Server Online, KHEL GALLI, Balance) */}
        {/* ========================================================================= */}
        <header className="bg-white border border-[#E5E7EB] rounded-2xl p-3 sm:p-3.5 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-100/70 border border-purple-200/50 flex items-center justify-center text-[#7C3AED] shrink-0">
              <Gamepad2 size={22} className="stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-[#667085]">
                  Server Online
                </span>
                <span className="w-2 h-2 rounded-full bg-[#16A34A] animate-pulse" />
              </div>
              <h1 className="text-base sm:text-lg font-black tracking-tight text-[#172033] leading-none mt-0.5">
                SMART <span className="text-[#7C3AED]">BATTLE</span>
              </h1>
            </div>
          </div>

          <div className="border border-[#E5E7EB] bg-white rounded-xl px-3 py-1.5 flex items-center gap-2 shadow-2xs">
            <span className="text-xs sm:text-sm font-black text-[#172033]">
              ₹{totalBalance.toLocaleString()}
            </span>
            <WalletIcon size={16} className="text-[#7C3AED] stroke-[2.2]" />
          </div>
        </header>

        {/* ========================================================================= */}
        {/* 2. PAYMENT STATUS ALERTS (Success / Failed / Verification)                */}
        {/* ========================================================================= */}
        <AnimatePresence>
          {paymentStatus && (
            <motion.div 
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={`p-4 rounded-2xl border flex items-center gap-3.5 shadow-xs ${
                paymentStatus === 'success' 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                paymentStatus === 'success' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
              }`}>
                {paymentStatus === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black uppercase tracking-wider mb-0.5">
                  {paymentStatus === 'success' ? 'Payment Successful' : 
                   paymentStatus === 'failed' ? 'Payment Failed' : 'Payment Timeout'}
                </p>
                <p className="text-[10px] opacity-80 font-medium leading-tight">
                  {paymentStatus === 'success' 
                    ? 'Your wallet balance has been updated.' 
                    : 'There was an issue processing your payment. Please try again.'}
                </p>
              </div>
              <button 
                onClick={() => setPaymentStatus(null)} 
                className="opacity-50 hover:opacity-100 text-[10px] font-bold uppercase px-2 py-1 bg-white/50 rounded-lg"
              >
                Dismiss
              </button>
            </motion.div>
          )}

          {verifyingOrder && (
            <motion.div 
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="p-3.5 bg-purple-50 border border-purple-200 rounded-2xl flex items-center gap-3 shadow-xs"
            >
              <Loader2 size={16} className="text-[#7C3AED] animate-spin shrink-0" />
              <p className="text-[11px] font-black uppercase tracking-wider text-[#7C3AED]">
                Verifying Payment Status...
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ========================================================================= */}
        {/* 3. SECTION HEADING: WALLET MANAGEMENT                                     */}
        {/* ========================================================================= */}
        <div className="pt-1">
          <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-[#172033] px-1">
            WALLET MANAGEMENT
          </h2>
        </div>

        {/* ========================================================================= */}
        {/* 4. TOTAL ACCOUNT BALANCE CARD (Deposit, Winnings, Bonus)                  */}
        {/* ========================================================================= */}
        <div className="bg-white border border-[#E5E7EB] rounded-[24px] p-6 text-center shadow-xs">
          <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-[#667085] mb-1">
            TOTAL ACCOUNT BALANCE
          </p>
          <h3 className="text-4xl sm:text-5xl font-black italic tracking-tight text-[#172033] my-2">
            ₹{totalBalance.toLocaleString()}
          </h3>

          <div className="border-b border-[#E5E7EB] my-5" />

          <div className="grid grid-cols-3 divide-x divide-[#E5E7EB] text-center">
            <div className="px-2">
              <span className="block text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-[#667085] mb-1">
                DEPOSIT
              </span>
              <span className="text-sm sm:text-base font-black text-[#3B82F6]">
                ₹{(user.wallet?.deposit || 0).toLocaleString()}
              </span>
            </div>
            <div className="px-2">
              <span className="block text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-[#667085] mb-1">
                WINNINGS
              </span>
              <span className="text-sm sm:text-base font-black text-[#16A34A]">
                ₹{(user.wallet?.winnings || 0).toLocaleString()}
              </span>
            </div>
            <div className="px-2">
              <span className="block text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-[#667085] mb-1">
                BONUS
              </span>
              <span className="text-sm sm:text-base font-black text-[#7C3AED]">
                ₹{(user.wallet?.bonus || 0).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 5. PRIMARY ACTIONS: ADD CASH + WITHDRAW MONEY                             */}
        {/* ========================================================================= */}
        <div className="space-y-3 pt-1">
          <button 
            onClick={() => onPageChange(Page.ADD_MONEY)}
            className="w-full h-14 bg-gradient-to-r from-[#3B82F6] to-[#7C3AED] hover:from-[#2563EB] hover:to-[#6D28D9] text-white rounded-[20px] font-black text-xs sm:text-sm flex items-center justify-center gap-2.5 uppercase tracking-widest shadow-md shadow-purple-500/20 active:scale-[0.98] transition-all"
          >
            <Plus size={20} className="stroke-[3]" /> 
            <span>ADD CASH</span>
          </button>
          
          <button 
            onClick={() => onPageChange(Page.WITHDRAW)}
            className="w-full h-14 bg-white border border-[#E5E7EB] text-[#172033] rounded-[20px] font-black text-xs sm:text-sm flex items-center justify-center gap-2.5 uppercase tracking-widest hover:bg-slate-50 active:scale-[0.98] transition-all shadow-xs"
          >
            <ArrowRightFromLine size={18} className="stroke-[2.5]" /> 
            <span>WITHDRAW MONEY</span>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* 6. RECENT HISTORY & STATEMENT LINK                                        */}
        {/* ========================================================================= */}
        <section className="pt-3">
          <div className="flex items-center justify-between mb-3 px-1">
            <h4 className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-[#172033]">
              RECENT HISTORY
            </h4>
            <button 
              onClick={() => setShowStatementModal(true)}
              className="text-[10px] sm:text-[11px] font-bold text-[#7C3AED] hover:text-[#6D28D9] flex items-center gap-1 uppercase tracking-wider active:scale-95 transition-all"
            >
              <span>STATEMENT</span>
              <ChevronRight size={14} className="stroke-[2.5]" />
            </button>
          </div>
          
          {/* ======================================================================= */}
          {/* 7. TRANSACTION CARDS LIST                                               */}
          {/* ======================================================================= */}
          <div className="space-y-2.5">
            {loading ? (
              <div className="py-12 bg-white border border-[#E5E7EB] rounded-2xl flex flex-col items-center justify-center shadow-xs">
                <Loader2 size={24} className="text-[#7C3AED] animate-spin mb-3" />
                <p className="text-[10px] font-black uppercase tracking-widest text-[#667085]">
                  Fetching History...
                </p>
              </div>
            ) : transactions.length === 0 ? (
              <div className="py-12 bg-white border border-[#E5E7EB] rounded-2xl text-center shadow-xs p-6">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                  <History size={24} />
                </div>
                <p className="text-xs font-black uppercase tracking-wider text-[#172033]">
                  No Transactions Found
                </p>
                <p className="text-[10px] text-[#667085] mt-1">
                  Your recent deposits, withdrawals and match entries will appear here.
                </p>
              </div>
            ) : (
              transactions.map((tx) => {
                const credit = isCredit(tx);
                const isPending = tx.status === 'pending';
                const isCompleted = tx.status === 'completed';

                return (
                  <div 
                    key={tx.id} 
                    className="bg-white border border-[#E5E7EB] rounded-2xl p-3.5 sm:p-4 shadow-xs flex items-center justify-between hover:border-slate-300 transition-colors"
                  >
                    {/* Left Icon + Title + Date */}
                    <div className="flex items-center gap-3.5 min-w-0 pr-2">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-black text-sm ${
                        credit 
                          ? 'bg-[#ECFDF5] text-[#16A34A]' 
                          : 'bg-[#FEF2F2] text-[#DC2626]'
                      }`}>
                        {credit ? '₹' : <ArrowDown size={18} className="stroke-[2.5]" />}
                      </div>
                      
                      <div className="min-w-0">
                        <p className="text-[11px] sm:text-xs font-black uppercase tracking-tight text-[#172033] italic truncate">
                          {tx.title || tx.type.replace('_', ' ')}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <p className="text-[9px] sm:text-[10px] text-[#667085] font-bold uppercase tracking-wider">
                            {formatTransactionDate(tx.createdAt)}
                          </p>
                          {tx.upiId && (
                            <span className="text-[8px] font-black uppercase bg-purple-50 text-purple-700 px-1.5 py-0.2 rounded border border-purple-200">
                              UPI: {tx.upiId}
                            </span>
                          )}
                          {tx.method === 'redeem_code' && (
                            <span className="text-[8px] font-black uppercase bg-indigo-50 text-indigo-700 px-1.5 py-0.2 rounded border border-indigo-200">
                              {tx.redeemType === 'free_fire' ? 'FF Diamonds' : 'Google Play'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right Amount + Status */}
                    <div className="text-right shrink-0">
                      <p className={`text-xs sm:text-sm font-black ${
                        credit ? 'text-[#16A34A]' : 'text-[#DC2626]'
                      }`}>
                        {credit ? '+' : '-'}₹{tx.amount}
                      </p>
                      <div className="flex items-center justify-end gap-1.5 mt-0.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          isPending 
                            ? 'bg-[#F59E0B]' 
                            : isCompleted 
                            ? 'bg-[#16A34A]' 
                            : 'bg-[#DC2626]'
                        }`} />
                        <span className={`text-[8px] sm:text-[9px] font-black uppercase tracking-wider ${
                          isPending 
                            ? 'text-[#F59E0B]' 
                            : isCompleted 
                            ? 'text-[#16A34A]' 
                            : 'text-[#DC2626]'
                        }`}>
                          {tx.status || 'COMPLETED'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* ========================================================================= */}
      {/* 8. STATEMENT & DETAILED ACCOUNT MODAL                                      */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {showStatementModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs"
          >
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-lg bg-white rounded-t-[32px] sm:rounded-[32px] max-h-[85vh] flex flex-col overflow-hidden shadow-2xl border border-[#E5E7EB]"
            >
              {/* Modal Header */}
              <div className="p-4 sm:p-5 border-b border-[#E5E7EB] flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-purple-100 text-[#7C3AED] flex items-center justify-center">
                    <FileText size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-[#172033] uppercase tracking-tight">
                      Account Statement
                    </h3>
                    <p className="text-[10px] font-bold text-[#667085]">
                      Total {transactions.length} recorded events
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowStatementModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Filter Chips */}
              <div className="px-4 py-3 border-b border-[#E5E7EB] flex items-center gap-2 overflow-x-auto no-scrollbar">
                {[
                  { id: 'all', label: 'All Activities' },
                  { id: 'deposit', label: 'Deposits' },
                  { id: 'withdraw', label: 'Withdrawals' },
                  { id: 'match', label: 'Tournaments' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setStatementFilter(tab.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all ${
                      statementFilter === tab.id
                        ? 'bg-[#7C3AED] text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Statement List */}
              <div className="p-4 overflow-y-auto space-y-2.5 flex-1 max-h-[50vh]">
                {filteredTransactions.length === 0 ? (
                  <div className="py-12 text-center text-xs font-bold text-slate-400">
                    No transactions matching this filter.
                  </div>
                ) : (
                  filteredTransactions.map((tx) => {
                    const credit = isCredit(tx);
                    return (
                      <div 
                        key={tx.id} 
                        className="bg-slate-50/70 border border-[#E5E7EB] rounded-xl p-3 flex items-center justify-between text-xs"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-black text-[#172033] uppercase text-[11px] truncate">
                            {tx.title || tx.type}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] font-bold text-slate-400">
                              {formatTransactionDate(tx.createdAt)}
                            </span>
                            {tx.utrNumber && (
                              <span className="text-[9px] font-mono font-bold text-purple-600 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200">
                                UTR: {tx.utrNumber}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`font-black text-xs ${credit ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                            {credit ? '+' : '-'}₹{tx.amount}
                          </p>
                          <span className={`inline-block text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                            tx.status === 'completed'
                              ? 'text-emerald-700 bg-emerald-100'
                              : tx.status === 'pending'
                              ? 'text-amber-700 bg-amber-100'
                              : 'text-red-700 bg-red-100'
                          }`}>
                            {tx.status}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-[#E5E7EB] bg-slate-50/50">
                <button
                  onClick={() => setShowStatementModal(false)}
                  className="w-full py-3 bg-[#172033] text-white rounded-xl font-black text-xs uppercase tracking-wider hover:bg-black transition-colors"
                >
                  Close Statement
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
