import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Smartphone, 
  Gift, 
  Info, 
  Banknote, 
  ShieldAlert, 
  CheckCircle2, 
  Loader2, 
  ShieldCheck, 
  Copy, 
  Sparkles,
  Zap,
  Check,
  AlertCircle
} from 'lucide-react';
import { Page, User, PaymentGateway } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, increment, runTransaction, collection, serverTimestamp } from 'firebase/firestore';
import { paymentService } from '../services/paymentService';

interface WithdrawProps {
  user: User;
  onPageChange: (page: Page) => void;
}

type WithdrawMethod = 'upi' | 'redeem_code';
type RedeemType = 'google_play' | 'free_fire';

export default function Withdraw({ user, onPageChange }: WithdrawProps) {
  const [method, setMethod] = useState<WithdrawMethod>('upi');
  const [amount, setAmount] = useState('100');
  const [loading, setLoading] = useState(false);
  const [activeGateway, setActiveGateway] = useState<PaymentGateway | null>(null);

  // UPI Form State
  const [upiId, setUpiId] = useState('');
  const [upiError, setUpiError] = useState('');

  // Redeem Code Form State
  const [redeemType, setRedeemType] = useState<RedeemType>('google_play');
  const [redeemContact, setRedeemContact] = useState(user.phone || user.email || '');
  const [redeemContactError, setRedeemContactError] = useState('');

  // Success State
  const [successInfo, setSuccessInfo] = useState<{
    amount: number;
    title: string;
    target: string;
  } | null>(null);

  const availableWinnings = user.wallet?.winnings || 0;

  useEffect(() => {
    const fetch = async () => {
      const g = await paymentService.getActiveGatewayAsync();
      setActiveGateway(g);
    };
    fetch();
  }, []);

  const validateUpi = (id: string) => {
    const trimmed = id.trim();
    if (!trimmed) return 'UPI ID is required';
    if (!trimmed.includes('@')) return 'Enter a valid UPI ID (e.g., username@okhdfcbank or 9876543210@paytm)';
    if (trimmed.length < 5 || trimmed.length > 50) return 'Invalid UPI ID length';
    return '';
  };

  const validateRedeemContact = (contact: string) => {
    const trimmed = contact.trim();
    if (!trimmed) return 'Delivery Mobile or Email is required';
    const isPhone = /^\d{10}$/.test(trimmed);
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    if (!isPhone && !isEmail) {
      return 'Enter a valid 10-digit mobile number or email address';
    }
    return '';
  };

  const handleQuickAmount = (val: number) => {
    setAmount(String(val));
  };

  const handleMaxAmount = () => {
    if (availableWinnings >= 100) {
      setAmount(String(availableWinnings));
    }
  };

  const handleWithdraw = async () => {
    if (loading || !auth.currentUser || !amount) return;
    const value = parseInt(amount);

    if (isNaN(value) || value < 100) {
      alert('Minimum withdrawal amount is ₹100');
      return;
    }

    if (value > availableWinnings) {
      alert('Insufficient winnings balance to withdraw this amount');
      return;
    }

    // Validation per method
    if (method === 'upi') {
      const error = validateUpi(upiId);
      if (error) {
        setUpiError(error);
        return;
      }
      setUpiError('');
    } else {
      const error = validateRedeemContact(redeemContact);
      if (error) {
        setRedeemContactError(error);
        return;
      }
      setRedeemContactError('');
    }

    setLoading(true);
    try {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const title = method === 'upi'
        ? `UPI Withdrawal (${upiId.trim()})`
        : `${redeemType === 'free_fire' ? 'Free Fire Diamond' : 'Google Play'} Redeem Code (₹${value})`;

      await runTransaction(db, async (transaction) => {
        const uSnap = await transaction.get(userRef);
        if (!uSnap.exists()) throw new Error('User profile not found');
        
        const userData = uSnap.data() as User;
        if (userData.isBanned) {
          throw new Error('Your account is restricted. Withdrawals are currently disabled.');
        }

        const currentWinnings = userData.wallet?.winnings || 0;
        
        if (currentWinnings < value) {
          throw new Error('Insufficient winnings balance. You have ₹' + currentWinnings);
        }
        
        transaction.update(userRef, {
          "wallet.winnings": increment(-value)
        });
        
        const transRef = doc(collection(db, 'transactions'));
        transaction.set(transRef, {
          userId: auth.currentUser!.uid,
          type: 'withdraw',
          amount: value,
          status: 'pending',
          method: method,
          upiId: method === 'upi' ? upiId.trim() : null,
          redeemType: method === 'redeem_code' ? redeemType : null,
          redeemContact: method === 'redeem_code' ? redeemContact.trim() : null,
          title: title,
          createdAt: serverTimestamp()
        });
      });

      setSuccessInfo({
        amount: value,
        title: title,
        target: method === 'upi' ? upiId.trim() : redeemContact.trim()
      });
    } catch (error: any) {
      console.error('Withdrawal error:', error);
      alert(error.message || 'Withdrawal failed. Please check connection.');
      handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
    } finally {
      setLoading(false);
    }
  };

  const parsedAmount = parseInt(amount) || 0;
  const isAmountValid = parsedAmount >= 100 && parsedAmount <= availableWinnings;

  return (
    <div className="pb-24 max-w-lg mx-auto bg-[#070E1A] min-h-screen text-slate-100 select-none">
      {/* Top Header */}
      <div className="px-4 sm:px-5 py-6">
        <div className="flex items-center gap-4 mb-6">
          <button 
            onClick={() => onPageChange(Page.WALLET)}
            className="p-2.5 bg-[#0F1D38] border border-[#1E3A6E] rounded-xl text-slate-400 hover:text-white transition-colors active:scale-95 shadow-sm"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex flex-col">
            <h2 className="text-xl font-black tracking-tight uppercase text-white leading-none">
              Withdraw <span className="text-purple-400">Winnings</span>
            </h2>
            <div className="flex items-center gap-1.5 mt-1">
              <ShieldCheck size={12} className="text-emerald-400" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                100% Secure & Fast Payouts
              </span>
            </div>
          </div>
        </div>

        {/* Available Balance Banner */}
        <section className="bg-gradient-to-br from-[#122347] to-[#0A152B] border border-[#1E3A6E] rounded-3xl p-6 mb-6 flex flex-col items-center shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="w-12 h-12 bg-gradient-to-tr from-purple-600 to-indigo-500 rounded-2xl flex items-center justify-center text-white mb-3 shadow-lg shadow-purple-600/30">
            <Banknote size={24} />
          </div>
          
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">
            Available For Withdrawal
          </p>
          <h3 className="text-3xl sm:text-4xl font-black tracking-tight text-white mb-4">
            ₹{availableWinnings.toLocaleString()}
          </h3>

          {/* Quick presets */}
          <div className="w-full">
            <div className="flex items-center justify-between gap-1.5 overflow-x-auto no-scrollbar py-1">
              {[100, 200, 500, 1000].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleQuickAmount(val)}
                  disabled={val > availableWinnings}
                  className={`flex-1 py-2 px-2 rounded-xl text-xs font-black transition-all border ${
                    parsedAmount === val
                      ? 'bg-purple-600 border-purple-400 text-white shadow-md shadow-purple-600/30'
                      : val <= availableWinnings
                      ? 'bg-[#0B172E] border-[#1E3A6E] text-slate-300 hover:border-purple-500/50'
                      : 'bg-[#08101E] border-slate-800 text-slate-600 cursor-not-allowed'
                  }`}
                >
                  ₹{val}
                </button>
              ))}
              <button
                type="button"
                onClick={handleMaxAmount}
                disabled={availableWinnings < 100}
                className={`py-2 px-3 rounded-xl text-xs font-black transition-all border ${
                  parsedAmount === availableWinnings && availableWinnings >= 100
                    ? 'bg-emerald-600 border-emerald-400 text-white'
                    : availableWinnings >= 100
                    ? 'bg-[#0B172E] border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10'
                    : 'bg-[#08101E] border-slate-800 text-slate-600 cursor-not-allowed'
                }`}
              >
                Max
              </button>
            </div>
          </div>
        </section>

        {/* Withdrawal Amount Input */}
        <div className="bg-[#0B172E] border border-[#1E3A6E] rounded-2xl p-4 mb-6 shadow-sm">
          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-2">
            Enter Withdrawal Amount
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-purple-400">
              ₹
            </span>
            <input 
              type="number" 
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="100"
              max={availableWinnings}
              className="w-full bg-[#070E1A] border border-[#1E3A6E] rounded-xl py-3.5 pl-10 pr-4 text-2xl font-black tracking-tight outline-hidden focus:border-purple-500 text-white"
              placeholder="100"
            />
          </div>
          <div className="flex justify-between items-center px-1 mt-2 text-[10px] font-bold">
            <span className="text-slate-400">Min: ₹100</span>
            <span className={parsedAmount > availableWinnings ? 'text-red-400 font-black' : 'text-slate-400'}>
              Max: ₹{availableWinnings}
            </span>
          </div>
        </div>

        {/* Method Switcher Tabs (UPI vs Redeem Code) */}
        <div className="mb-4">
          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2.5 px-1">
            Select Withdrawal Option
          </h4>
          <div className="grid grid-cols-2 gap-2 bg-[#0A152B] p-1.5 rounded-2xl border border-[#1E3A6E]">
            <button
              type="button"
              onClick={() => setMethod('upi')}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                method === 'upi'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Smartphone size={16} />
              <span>UPI Transfer</span>
            </button>

            <button
              type="button"
              onClick={() => setMethod('redeem_code')}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                method === 'redeem_code'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Gift size={16} />
              <span>Redeem Code</span>
            </button>
          </div>
        </div>

        {/* METHOD 1: UPI TRANSFER DETAILS */}
        {method === 'upi' && (
          <div className="bg-[#0B172E] border border-[#1E3A6E] rounded-2xl p-5 mb-6 space-y-4 shadow-sm animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E3A6E]/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                  <Smartphone size={20} />
                </div>
                <div>
                  <h5 className="text-xs font-black uppercase tracking-wide text-white">
                    Direct UPI Transfer
                  </h5>
                  <p className="text-[10px] text-slate-400 font-medium">
                    Supports GPay, PhonePe, Paytm, BHIM & All UPI Apps
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 rounded-lg">
                <Zap size={12} className="text-emerald-400" />
                <span className="text-[9px] font-black uppercase text-emerald-400">Fast</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-300 block">
                Enter Your UPI ID (VPA)
              </label>
              <input
                type="text"
                value={upiId}
                onChange={(e) => {
                  setUpiId(e.target.value);
                  if (upiError) setUpiError('');
                }}
                placeholder="e.g. 9876543210@paytm or name@okhdfcbank"
                className={`w-full h-12 bg-[#070E1A] border rounded-xl px-4 text-xs font-semibold text-white placeholder-slate-500 outline-hidden transition-colors ${
                  upiError ? 'border-red-500 focus:border-red-500' : 'border-[#1E3A6E] focus:border-purple-500'
                }`}
              />
              {upiError && (
                <div className="flex items-center gap-1.5 text-red-400 text-[10px] font-bold mt-1">
                  <AlertCircle size={12} />
                  <span>{upiError}</span>
                </div>
              )}
              <p className="text-[9px] text-slate-400 pt-0.5">
                Funds will be deposited directly into the bank account linked with this UPI ID.
              </p>
            </div>

            {/* Supported handles chip indicators */}
            <div className="pt-1 flex items-center gap-1.5 flex-wrap">
              <span className="text-[9px] font-bold uppercase text-slate-500 mr-1">Handles:</span>
              {['@paytm', '@ybl', '@okhdfcbank', '@okaxis', '@upi'].map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => {
                    if (upiId.includes('@')) {
                      setUpiId(upiId.split('@')[0] + h);
                    } else if (upiId) {
                      setUpiId(upiId + h);
                    }
                  }}
                  className="px-2 py-0.5 bg-[#0F1D38] border border-[#1E3A6E] rounded-md text-[9px] font-black text-slate-300 hover:text-purple-400"
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* METHOD 2: REDEEM CODE DETAILS */}
        {method === 'redeem_code' && (
          <div className="bg-[#0B172E] border border-[#1E3A6E] rounded-2xl p-5 mb-6 space-y-4 shadow-sm animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E3A6E]/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                  <Gift size={20} />
                </div>
                <div>
                  <h5 className="text-xs font-black uppercase tracking-wide text-white">
                    Digital Game Redeem Code
                  </h5>
                  <p className="text-[10px] text-slate-400 font-medium">
                    Instant Play Store Recharge or Free Fire Diamonds
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 bg-purple-500/10 border border-purple-500/30 px-2 py-1 rounded-lg">
                <Sparkles size={12} className="text-purple-400" />
                <span className="text-[9px] font-black uppercase text-purple-400">Code</span>
              </div>
            </div>

            {/* Voucher Choice */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-300 block">
                Choose Redeem Voucher Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRedeemType('google_play')}
                  className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-1 ${
                    redeemType === 'google_play'
                      ? 'bg-purple-600/20 border-purple-500 text-white'
                      : 'bg-[#070E1A] border-[#1E3A6E] text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-white">Google Play</span>
                    {redeemType === 'google_play' && <Check size={14} className="text-purple-400" />}
                  </div>
                  <span className="text-[9px] text-slate-400">Recharge Play Store balance</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRedeemType('free_fire')}
                  className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-1 ${
                    redeemType === 'free_fire'
                      ? 'bg-purple-600/20 border-purple-500 text-white'
                      : 'bg-[#070E1A] border-[#1E3A6E] text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-white">Free Fire Diamonds</span>
                    {redeemType === 'free_fire' && <Check size={14} className="text-purple-400" />}
                  </div>
                  <span className="text-[9px] text-slate-400">In-game diamond voucher</span>
                </button>
              </div>
            </div>

            {/* Delivery contact */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-300 block">
                Deliver Voucher To (WhatsApp / Email)
              </label>
              <input
                type="text"
                value={redeemContact}
                onChange={(e) => {
                  setRedeemContact(e.target.value);
                  if (redeemContactError) setRedeemContactError('');
                }}
                placeholder="Enter 10-digit mobile or email address"
                className={`w-full h-12 bg-[#070E1A] border rounded-xl px-4 text-xs font-semibold text-white placeholder-slate-500 outline-hidden transition-colors ${
                  redeemContactError ? 'border-red-500 focus:border-red-500' : 'border-[#1E3A6E] focus:border-purple-500'
                }`}
              />
              {redeemContactError && (
                <div className="flex items-center gap-1.5 text-red-400 text-[10px] font-bold mt-1">
                  <AlertCircle size={12} />
                  <span>{redeemContactError}</span>
                </div>
              )}
              <p className="text-[9px] text-slate-400 pt-0.5">
                The redeem code will also be recorded in your Wallet Transaction history for easy copying.
              </p>
            </div>
          </div>
        )}

        {/* Processing Advisory */}
        <div className="bg-[#0A152B] border border-[#1E3A6E] rounded-2xl p-4 mb-6 flex gap-3 shadow-xs">
          <ShieldAlert className="text-purple-400 shrink-0 mt-0.5" size={18} />
          <div className="space-y-0.5">
            <h5 className="text-[10px] font-black uppercase tracking-wider text-slate-200">
              Payout Processing Time
            </h5>
            <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
              {method === 'upi'
                ? 'UPI payouts are typically processed instantly to within 15 minutes. Ensure your UPI ID is accurate.'
                : 'Redeem code vouchers are generated swiftly and delivered directly to your specified contact details.'}
            </p>
          </div>
        </div>

        {/* Action Button */}
        <button 
          onClick={handleWithdraw}
          disabled={loading || !isAmountValid || (method === 'upi' && !upiId.trim())}
          className={`w-full h-14 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl flex items-center justify-center gap-3 transition-all ${
            loading || !isAmountValid || (method === 'upi' && !upiId.trim())
              ? 'bg-[#0F1D38] text-slate-600 border border-slate-800 cursor-not-allowed'
              : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-600/30 active:scale-98'
          }`}
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" size={18} />
              <span>Processing Request...</span>
            </>
          ) : (
            <>
              {method === 'upi' ? <Smartphone size={18} /> : <Gift size={18} />}
              <span>Confirm & Withdraw ₹{parsedAmount || 0}</span>
            </>
          )}
        </button>

        {/* Success Modal */}
        {successInfo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
            <div className="bg-[#0B172E] border border-[#1E3A6E] rounded-3xl p-6 sm:p-7 max-w-sm w-full text-center shadow-2xl space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto">
                <CheckCircle2 size={36} />
              </div>
              
              <div>
                <h3 className="text-lg font-black text-white uppercase tracking-tight">
                  Withdrawal Requested!
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Your withdrawal of <span className="font-bold text-emerald-400">₹{successInfo.amount}</span> has been submitted.
                </p>
              </div>

              <div className="bg-[#070E1A] border border-[#1E3A6E] rounded-2xl p-3.5 text-left text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">Method:</span>
                  <span className="font-bold text-white uppercase">{method === 'upi' ? 'UPI' : 'Redeem Code'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Destination:</span>
                  <span className="font-bold text-purple-400 truncate max-w-[180px]">{successInfo.target}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Status:</span>
                  <span className="font-black text-amber-400 uppercase">Processing</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onPageChange(Page.WALLET)}
                className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-purple-600/30 active:scale-95 transition-all"
              >
                Go to Wallet
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
