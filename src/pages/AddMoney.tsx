import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, 
  Zap, 
  Loader2, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2,
  Copy,
  Check,
  QrCode,
  Smartphone,
  ExternalLink,
  Info,
  Clock
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Page, PaymentGateway } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { paymentService, DEFAULT_DIRECT_UPI_GATEWAY } from '../services/paymentService';

interface AddMoneyProps {
  onPageChange: (page: Page) => void;
}

export default function AddMoney({ onPageChange }: AddMoneyProps) {
  const [amount, setAmount] = useState('100');
  const [utrNumber, setUtrNumber] = useState('');
  const [utrError, setUtrError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [activeGateway, setActiveGateway] = useState<PaymentGateway>(DEFAULT_DIRECT_UPI_GATEWAY);
  const [submissionSuccess, setSubmissionSuccess] = useState<{
    amount: number;
    utr: string;
    id: string;
  } | null>(null);

  // ZapUPI automated polling state (if ZapUPI is activated)
  const [pollingOrderId, setPollingOrderId] = useState<string | null>(null);
  const [pollingActive, setPollingActive] = useState(false);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);

  const presetAmounts = ['50', '100', '200', '500', '1000'];

  const numericAmount = parseInt(amount, 10);
  const isAmountValid = !isNaN(numericAmount) && numericAmount >= 10 && numericAmount <= 10000;
  const isBelowMin = !isNaN(numericAmount) && numericAmount > 0 && numericAmount < 10;
  const isAboveMax = !isNaN(numericAmount) && numericAmount > 10000;

  useEffect(() => {
    const fetchGateway = async () => {
      const g = await paymentService.getActiveGatewayAsync();
      if (g) setActiveGateway(g);
    };
    fetchGateway();
  }, []);

  const upiId = activeGateway?.upiId || '9554721875@fam';
  const payeeName = activeGateway?.merchantId || 'Ankush Sharma';
  const currentAmount = isAmountValid ? numericAmount : 100;
  
  // Standard UPI URI standard accepted by PhonePe, GPay, Paytm, BHIM, FamPay
  const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=${currentAmount}&cu=INR&tn=${encodeURIComponent('Add Coins')}`;

  // ZapUPI status poller if ZapUPI is active
  useEffect(() => {
    let interval: any;
    let timeout: any;

    if (pollingActive && pollingOrderId) {
      setPollingTimedOut(false);
      
      timeout = setTimeout(() => {
        setPollingActive(false);
        setPollingTimedOut(true);
      }, 5 * 60 * 1000);

      const checkStatus = async () => {
        try {
          const res = await fetch('/api/zapupi/check-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: pollingOrderId })
          });
          
          if (res.ok) {
            const data = await res.json();
            const detailSt = String(data.detail?.status || data.detail?.order_status || '').toLowerCase();
            const isFinished = data.status === 'success' || detailSt === 'success' || detailSt === 'paid' || detailSt === 'completed';

            if (isFinished) {
              clearInterval(interval);
              clearTimeout(timeout);
              setPollingActive(false);
              setPollingOrderId(null);
              setTimeout(() => {
                window.location.href = '/wallet?payment=success';
              }, 500);
            } else if (data.status === 'failed' || detailSt === 'failed' || detailSt === 'failure') {
              clearInterval(interval);
              clearTimeout(timeout);
              setPollingActive(false);
              setPollingOrderId(null);
              window.location.href = '/wallet?payment=failed';
            }
          }
        } catch (err) {
          console.error('[AddMoney] Polling error:', err);
        }
      };

      checkStatus();
      interval = setInterval(checkStatus, 2500);
    }

    return () => {
      if (interval) clearInterval(interval);
      if (timeout) clearTimeout(timeout);
    };
  }, [pollingActive, pollingOrderId]);

  const handleCopyUpi = () => {
    navigator.clipboard.writeText(upiId);
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2000);
  };

  const handleOpenUpiApp = () => {
    window.location.href = upiUri;
  };

  const handleSubmitDeposit = async () => {
    if (!auth.currentUser) {
      alert('Please sign in to add coins.');
      return;
    }

    if (!isAmountValid) {
      alert('Please enter a valid amount between ₹10 and ₹10,000');
      return;
    }

    // If using ZapUPI automated gateway
    if (activeGateway?.id === 'zapupi') {
      setLoading(true);
      try {
        const result: any = await paymentService.initiateDeposit(numericAmount, auth.currentUser.uid);
        if (result?.order_id) {
          setPollingOrderId(result.order_id);
          setPollingActive(true);
          if (result.payment_url) {
            window.open(result.payment_url, '_blank');
          }
        }
      } catch (err: any) {
        alert(err.message || 'Payment initiation failed');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Direct UPI flow (Zero KYC with UTR validation)
    const cleanUtr = utrNumber.trim();
    if (!cleanUtr) {
      setUtrError('Please enter the 12-digit UTR / Ref / Transaction ID after paying.');
      return;
    }

    if (cleanUtr.length < 6 || cleanUtr.length > 25) {
      setUtrError('UTR / Transaction ID should be valid (typically 12 digits).');
      return;
    }

    setUtrError('');
    setLoading(true);

    try {
      // Get user profile for username
      let username = 'Player';
      try {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userDoc.exists()) {
          username = userDoc.data()?.username || userDoc.data()?.ign || 'Player';
        }
      } catch (e) {
        console.warn('Could not fetch user profile for username:', e);
      }

      const docRef = await addDoc(collection(db, 'transactions'), {
        userId: auth.currentUser.uid,
        userEmail: auth.currentUser.email || '',
        username,
        type: 'deposit',
        amount: numericAmount,
        status: 'pending',
        method: 'upi',
        upiId,
        payeeName,
        utrNumber: cleanUtr,
        title: `UPI Deposit (UTR: ${cleanUtr})`,
        createdAt: serverTimestamp()
      });

      setSubmissionSuccess({
        amount: numericAmount,
        utr: cleanUtr,
        id: docRef.id
      });
    } catch (error: any) {
      console.error('[AddMoney] Error submitting deposit:', error);
      alert(error.message || 'Deposit submission failed. Please try again.');
      handleFirestoreError(error, OperationType.CREATE, 'transactions');
    } finally {
      setLoading(false);
    }
  };

  const isZapUpi = activeGateway?.id === 'zapupi';

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-neutral-900 pb-24 max-w-lg mx-auto select-none relative">
      {/* ========================================================================= */}
      {/* 1. HEADER                                                                 */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-30 bg-[#0a1835] text-white shadow-lg border-b border-[#182a52] px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onPageChange(Page.WALLET)}
            className="p-1 -ml-1 text-white hover:bg-white/10 rounded-full transition-colors active:scale-95 flex items-center justify-center cursor-pointer"
            aria-label="Back to Wallet"
          >
            <ChevronLeft size={24} className="stroke-[2.5]" />
          </button>
          <h1 className="text-base sm:text-lg font-black tracking-wide">
            Add Coins
          </h1>
        </div>

        <div className="flex items-center gap-1 bg-white/10 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase text-emerald-300 border border-emerald-400/20">
          <ShieldCheck size={12} className="text-emerald-400" />
          <span>Zero KYC • Instant</span>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="p-4 sm:p-5 space-y-4">
        {/* ========================================================================= */}
        {/* 2. PAYMENT PROVIDER CARD                                                  */}
        {/* ========================================================================= */}
        <div className="bg-gradient-to-r from-purple-900 to-indigo-900 text-white rounded-2xl p-4 shadow-md flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-amber-400 shrink-0">
              <Zap size={22} className="fill-amber-400 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black tracking-wide">
                  Direct UPI & QR Payment
                </h2>
                <span className="text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  Active
                </span>
              </div>
              <p className="text-[11px] font-medium text-purple-200 mt-0.5">
                Payee: <span className="font-bold text-white">{payeeName}</span> • Zero Fees
              </p>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 3. AMOUNT SECTION                                                         */}
        {/* ========================================================================= */}
        <div className="bg-white border border-neutral-200/90 rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
            <div className="flex items-center gap-2">
              <span className="text-base">💵</span>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-tight">
                Enter Amount (₹10 - ₹10,000)
              </h3>
            </div>
            {amount && (
              <button
                onClick={() => setAmount('')}
                className="text-[11px] font-bold text-neutral-400 hover:text-neutral-600 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 rounded-xl px-3.5 py-2.5 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/20 transition-all">
            <span className="text-2xl font-black text-neutral-800">₹</span>
            <input
              type="number"
              placeholder="Enter amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-transparent text-2xl font-black text-neutral-900 placeholder:text-neutral-300 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>

          {/* Preset Buttons */}
          <div className="grid grid-cols-5 gap-2 pt-1">
            {presetAmounts.map((preset) => {
              const isSelected = amount === preset;
              return (
                <button
                  key={preset}
                  onClick={() => setAmount(preset)}
                  className={`py-2 px-1 rounded-xl text-xs font-black transition-all active:scale-95 border cursor-pointer ${
                    isSelected
                      ? 'bg-orange-50 border-orange-500 text-orange-600 ring-2 ring-orange-500/20'
                      : 'bg-white border-neutral-200 text-neutral-700 hover:border-neutral-300'
                  }`}
                >
                  ₹{preset}
                </button>
              );
            })}
          </div>

          {isBelowMin && (
            <p className="text-[11px] font-bold text-red-500 flex items-center gap-1">
              <AlertCircle size={13} />
              <span>Minimum deposit amount is ₹10</span>
            </p>
          )}
          {isAboveMax && (
            <p className="text-[11px] font-bold text-red-500 flex items-center gap-1">
              <AlertCircle size={13} />
              <span>Maximum deposit amount is ₹10,000</span>
            </p>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 4. DIRECT UPI & QR CODE INTERFACE                                         */}
        {/* ========================================================================= */}
        {!isZapUpi ? (
          <div className="space-y-4">
            {/* Step 1: Scan QR or Pay via App */}
            <div className="bg-white border border-neutral-200/90 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-black">
                    1
                  </span>
                  <h3 className="text-xs font-black text-neutral-800 uppercase tracking-wide">
                    Scan QR or Pay to Admin UPI
                  </h3>
                </div>
                <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-md">
                  Amount: ₹{currentAmount}
                </span>
              </div>

              {/* QR Code Container */}
              <div className="flex flex-col items-center justify-center p-4 bg-gradient-to-b from-neutral-50 to-purple-50/30 rounded-2xl border border-dashed border-purple-200">
                <div className="p-3 bg-white rounded-2xl shadow-md border border-neutral-100">
                  <QRCodeSVG 
                    value={upiUri}
                    size={175}
                    level="H"
                    includeMargin={true}
                  />
                </div>
                <p className="text-[11px] font-black text-neutral-700 mt-3 text-center">
                  Scan with GPay, PhonePe, Paytm, or FamPay
                </p>
                <p className="text-[10px] text-neutral-500 font-medium text-center">
                  Paying ₹{currentAmount} directly to {payeeName}
                </p>
              </div>

              {/* Copy UPI Box */}
              <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase text-neutral-400 tracking-wider">
                    Official Admin UPI ID
                  </p>
                  <p className="text-xs sm:text-sm font-black text-neutral-900 truncate font-mono select-all">
                    {upiId}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyUpi}
                  className="px-3 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all shrink-0 cursor-pointer"
                >
                  {copiedUpi ? (
                    <>
                      <Check size={14} className="text-emerald-400" />
                      <span className="text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      <span>Copy UPI</span>
                    </>
                  )}
                </button>
              </div>

              {/* Pay via UPI App Deep Link Button */}
              <button
                type="button"
                onClick={handleOpenUpiApp}
                disabled={!isAmountValid}
                className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md shadow-purple-600/20 active:scale-98 transition-all cursor-pointer"
              >
                <Smartphone size={16} />
                <span>Open in UPI App (PhonePe / GPay / FamPay)</span>
                <ExternalLink size={14} className="opacity-75" />
              </button>
            </div>

            {/* Step 2: Enter UTR / Transaction ID */}
            <div className="bg-white border border-neutral-200/90 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3.5">
              <div className="flex items-center gap-2 pb-2 border-b border-neutral-100">
                <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-black">
                  2
                </span>
                <h3 className="text-xs font-black text-neutral-800 uppercase tracking-wide">
                  Submit 12-Digit UTR / Reference No.
                </h3>
              </div>

              <div>
                <label className="text-[11px] font-bold text-neutral-600 block mb-1.5">
                  12-Digit Transaction Reference (UTR)
                </label>
                <div className="bg-neutral-50 border border-neutral-200 rounded-xl px-3.5 py-3 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/20 transition-all">
                  <input
                    type="text"
                    placeholder="e.g. 428910283741 or UPI Ref ID"
                    value={utrNumber}
                    onChange={(e) => {
                      setUtrNumber(e.target.value);
                      if (utrError) setUtrError('');
                    }}
                    className="w-full bg-transparent text-sm font-bold text-neutral-900 placeholder:text-neutral-400 outline-none font-mono"
                  />
                </div>
                {utrError && (
                  <p className="text-[11px] font-bold text-red-500 mt-1 flex items-center gap-1">
                    <AlertCircle size={13} />
                    <span>{utrError}</span>
                  </p>
                )}
                <p className="text-[10px] text-neutral-500 font-medium mt-1.5 flex items-center gap-1">
                  <Info size={12} className="text-neutral-400 shrink-0" />
                  <span>Found in payment receipt on PhonePe, GPay, Paytm or FamPay.</span>
                </p>
              </div>

              {/* Submit CTA */}
              <button
                type="button"
                onClick={handleSubmitDeposit}
                disabled={loading || !isAmountValid || !utrNumber.trim()}
                className="w-full py-4 bg-[#f97316] hover:bg-[#ea580c] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-black text-sm uppercase tracking-wider shadow-lg shadow-orange-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    <span>SUBMITTING DEPOSIT...</span>
                  </>
                ) : (
                  <span>SUBMIT DEPOSIT (₹{currentAmount})</span>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Automated ZapUPI Fallback */
          <div className="pt-2">
            <button
              onClick={handleSubmitDeposit}
              disabled={loading || !isAmountValid}
              className="w-full py-4 bg-[#f97316] hover:bg-[#ea580c] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-black text-sm uppercase tracking-wider shadow-lg shadow-orange-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  <span>PROCESSING...</span>
                </>
              ) : (
                <span>PAY WITH ZAPUPI (₹{currentAmount})</span>
              )}
            </button>
          </div>
        )}

        {/* Safety & Instructions */}
        <div className="bg-white border border-neutral-200/90 rounded-2xl p-4 sm:p-5 shadow-xs space-y-2.5">
          <h4 className="text-xs font-black uppercase text-neutral-700 tracking-wider flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-emerald-500" />
            <span>Deposit Instructions</span>
          </h4>
          {[
            'Transfer the exact amount using any UPI app.',
            'Copy the 12-digit UTR/Reference number from your receipt.',
            'Submit the UTR number in step 2 above.',
            'Coins will be credited to your wallet upon instant verification.',
            'Admin verifies and approves deposits 24/7.'
          ].map((text, idx) => (
            <div key={idx} className="flex items-start gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5 shrink-0" />
              <p className="text-xs font-medium text-neutral-600 leading-snug">
                {text}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. SUCCESS MODAL                                                          */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {submissionSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 15 }}
              className="w-full max-w-sm bg-white rounded-3xl p-6 sm:p-7 text-neutral-900 shadow-2xl text-center border border-neutral-200 relative"
            >
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-4 text-emerald-600">
                <CheckCircle2 size={36} className="text-emerald-500 stroke-[2.2]" />
              </div>

              <h3 className="text-lg font-black text-neutral-900 uppercase">
                Deposit Submitted!
              </h3>
              
              <div className="my-3 py-3 px-4 bg-neutral-50 rounded-2xl border border-neutral-200 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-500 font-bold">Amount:</span>
                  <span className="font-black text-neutral-900 text-sm">₹{submissionSuccess.amount}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-500 font-bold">UTR No:</span>
                  <span className="font-mono font-bold text-neutral-800">{submissionSuccess.utr}</span>
                </div>
                <div className="flex items-center justify-between text-xs pt-1 border-t border-neutral-200">
                  <span className="text-neutral-500 font-bold">Status:</span>
                  <span className="font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full flex items-center gap-1 text-[10px]">
                    <Clock size={10} /> Pending Approval
                  </span>
                </div>
              </div>

              <p className="text-xs text-neutral-600 leading-relaxed mb-6 font-medium">
                Your payment has been received and sent for verification. Admin <span className="font-bold text-neutral-900">{payeeName}</span> will verify the UTR and coins will be added to your wallet shortly.
              </p>

              <button
                onClick={() => onPageChange(Page.WALLET)}
                className="w-full py-3.5 bg-neutral-900 hover:bg-black text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer"
              >
                Go to Wallet
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ZapUPI Polling Modal (if active) */}
      <AnimatePresence>
        {pollingActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 15 }}
              className="w-full max-w-sm bg-white rounded-3xl p-6 sm:p-8 text-neutral-900 shadow-2xl text-center border border-neutral-200 relative overflow-hidden"
            >
              <div className="w-16 h-16 rounded-2xl bg-purple-50 border border-purple-200 flex items-center justify-center mx-auto mb-5 text-purple-600">
                <Loader2 className="animate-spin text-purple-600" size={28} />
              </div>

              <h3 className="text-base sm:text-lg font-black uppercase text-neutral-900 mb-1">
                {pollingTimedOut ? (
                  <span className="text-red-600">Verification Timed Out</span>
                ) : (
                  <>Verifying <span className="text-purple-600">Payment</span></>
                )}
              </h3>

              <p className="text-xs text-neutral-600 leading-relaxed mb-6 font-medium">
                {pollingTimedOut
                  ? "Payment verification timed out. If your funds were deducted, please reach out to support with your Order ID."
                  : "We're confirming your transaction with ZapUPI. Please do not close or refresh this page."}
              </p>

              {pollingOrderId && (
                <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-2.5 mb-6 text-[11px] font-mono text-neutral-500">
                  Order ID: <span className="font-bold text-neutral-800 select-all">{pollingOrderId}</span>
                </div>
              )}

              <button
                onClick={() => {
                  setPollingActive(false);
                  setPollingOrderId(null);
                  setPollingTimedOut(false);
                }}
                className="w-full py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
              >
                {pollingTimedOut ? 'Close & Return' : 'Cancel & Return to Wallet'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
