import { Wallet, Bell, Search } from 'lucide-react';
import { Page, User } from '../types';
import SmartBattleLogo from './SmartBattleLogo';

interface HeaderProps {
  user: User;
  onPageChange: (page: Page) => void;
}

export default function Header({ user, onPageChange }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 bg-black py-3.5 border-b border-white/5">
      <div className="flex items-center justify-between px-5 max-w-lg mx-auto">
        <div 
          onClick={() => onPageChange(Page.PROFILE)}
          className="cursor-pointer"
        >
          <SmartBattleLogo size="sm" showText={true} />
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => onPageChange(Page.WALLET)}
            className="flex items-center gap-3 bg-neutral-900 border border-white/5 px-4 py-2 rounded-2xl active:scale-95 transition-all shadow-xl"
          >
            <span className="text-purple-400 font-bold text-sm">₹{((user.wallet?.deposit || 0) + (user.wallet?.winnings || 0) + (user.wallet?.bonus || 0)).toLocaleString()}</span>
            <div className="p-1.5 bg-purple-500/10 rounded-lg">
              <Wallet size={16} className="text-purple-400" />
            </div>
          </button>
        </div>
      </div>
    </header>
  );
}
