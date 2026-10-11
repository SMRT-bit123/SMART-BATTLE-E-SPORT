export enum Page {
  LOGIN = 'login',
  SIGNUP = 'signup',
  HOME = 'home',
  TOURNAMENTS = 'tournaments',
  JOIN_MATCH = 'join_match',
  WALLET = 'wallet',
  ADD_MONEY = 'add_money',
  WITHDRAW = 'withdraw',
  PROFILE = 'profile',
  ADMIN = 'admin',
  ADMIN_USER_PROFILE = 'admin_user_profile',
  ADMIN_EDIT_MATCH = 'admin_edit_match',
  ADMIN_CREATE_MATCH = 'admin_create_match',
  REFERRAL = 'referral',
  PROFILE_DETAILS = 'profile_details',
  GAME_STATS = 'game_stats',
  GAME_MODES = 'game_modes',
  ADMIN_MODES = 'admin_modes',
  LEADERBOARD = 'leaderboard',
  MATCH_DETAILS = 'match_details'
}

export interface Game {
  id: string;
  title: string;
  image: string;
  players: number;
}

export interface Tournament {
  id: string;
  displayId?: string;
  matchNumber?: number | string;
  gameId: string;
  title: string;
  image?: string;
  entryFee: number;
  prize: string;
  maxPlayers: number;
  totalSlots: number;
  playersCount: number;
  players: { userId: string; username: string; ign?: string; slot?: number }[]; // array of player objects
  modeId?: string;
  mode: string; // solo / duo / squad / custom
  section: string; // battle royale / clash squad / lone wolf / custom
  map: string;
  time: string;
  roomId?: string;
  roomPassword?: string;
  prizeType?: 'perKill' | 'survival';
  perKillAmount?: number;
  winnersCount?: number;
  prizePool?: number;
  prizeDistribution?: Record<number, number>;
  positionWinnersCount?: number;
  positionPrizeDistribution?: Record<number, number>;
  status?: 'upcoming' | 'ongoing' | 'completed' | 'active'; // Included active for backward compatibility
  description?: string;
  rules?: string[] | string;
  createdAt?: any;
}

export interface UserStats {
  matchesPlayed: number;
  totalWins: number;
  totalKills: number;
  totalWinnings: number;
}

export interface Wallet {
  deposit: number;
  winnings: number;
  bonus: number;
}

export interface Transaction {
  id?: string;
  userId: string;
  type: 'deposit' | 'withdraw' | 'win' | 'entry' | 'refund' | 'withdrawal';
  amount: number;
  status: 'completed' | 'pending' | 'failed';
  matchId?: string;
  title?: string;
  method?: 'upi' | 'redeem_code' | 'bank' | 'manual';
  upiId?: string;
  redeemCode?: string;
  redeemContact?: string;
  redeemType?: 'google_play' | 'free_fire';
  createdAt: any;
}

export interface User {
  id?: string;
  username: string;
  email: string;
  phone: string;
  wallet: Wallet;
  isKycVerified: boolean;
  isBanned?: boolean;
  isAdmin?: boolean;
  stats: UserStats;
  gameIGNs?: Record<string, string>;
  ign?: string;
  referredBy?: string;
  referralClaimed?: boolean;
  deviceId?: string;
  fcmEnabled?: boolean;
  notificationsEnabled?: boolean;
  createdAt?: any;
}

export interface Banner {
  id?: string;
  imageUrl: string;
  redirectUrl?: string;
  type: 'main' | 'offer' | 'freefire';
  order: number;
  isActive: boolean;
  createdAt?: any;
}

export interface PaymentGateway {
  id: string;
  name: string;
  apiKey?: string;
  secretKey?: string;
  merchantId?: string;
  webhookSecret?: string;
  upiId?: string;
  isActive: boolean;
  updatedAt?: any;
}

export type NotificationType = 'tournament' | 'room_creds' | 'offer' | 'alert' | 'fairplay' | 'wallet';
export type NotificationAudience = 'all' | 'match' | 'user';

export interface AppNotification {
  id?: string;
  title: string;
  message: string;
  type: NotificationType;
  audience: NotificationAudience;
  targetMatchId?: string;
  targetMatchTitle?: string;
  targetUserId?: string;
  targetUsername?: string;
  actionPage?: Page | string;
  actionUrl?: string;
  actionText?: string;
  imageUrl?: string;
  readBy?: string[];
  createdAt?: any;
  createdBy?: string;
}
