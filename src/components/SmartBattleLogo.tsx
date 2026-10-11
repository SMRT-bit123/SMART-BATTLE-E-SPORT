import React from 'react';

interface SmartBattleLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
}

export default function SmartBattleLogo({ size = 'md', showText = true, className = '' }: SmartBattleLogoProps) {
  const iconSizeMap = {
    sm: 'w-8 h-8',
    md: 'w-11 h-11',
    lg: 'w-20 h-20',
    xl: 'w-28 h-28'
  };

  const textSizes = {
    sm: { smart: 'text-[9px]', battle: 'text-[10px]' },
    md: { smart: 'text-[11px]', battle: 'text-sm' },
    lg: { smart: 'text-sm', battle: 'text-xl' },
    xl: { smart: 'text-base', battle: 'text-2xl' }
  };

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Emblem Icon */}
      <div className={`relative ${iconSizeMap[size]} shrink-0 active:scale-95 transition-transform`}>
        <img 
          src="/src/assets/images/regenerated_image_1791755565035.png" 
          alt="SMART BATTLE Logo" 
          className="w-full h-full object-contain filter drop-shadow-[0_0_12px_rgba(0,245,255,0.35)]"
        />
      </div>

      {showText && (
        <div className="flex flex-col leading-none select-none">
          <span className={`${textSizes[size].smart} font-black uppercase tracking-[0.25em] text-cyan-400 drop-shadow-[0_0_8px_rgba(0,245,255,0.4)]`}>
            SMART
          </span>
          <span className={`${textSizes[size].battle} font-black uppercase tracking-[0.18em] text-white drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]`}>
            BATTLE
          </span>
        </div>
      )}
    </div>
  );
}
