export type Method = "ZELLE" | "VENMO" | "CASHAPP" | string;

export interface Settings {
  CLUB_NAME: string;
  METHODS_ENABLED: Method[];
  CURRENCY: string;
  FAST_FEE_PCT: number;
  OWNER_FALLBACK_THRESHOLD: number;
  OWNER_TG_USERNAME?: string;
}

export interface OwnerAccount {
  method: Method;
  handle: string;
  display_name: string;
  instructions: string;
}

export interface CashoutRow {
  cashout_id: string;
  tg_user_id: string | number;
  display_name: string;
  method: Method;
  amount: number;
  priority_type: "FAST" | "NORMAL";
  status: "PENDING" | "MATCHED" | "PAID" | "CANCELLED";
  requested_at: string;
  matched_at: string;
  payer_tg_user_id: string | number | "";
  payer_handle: string | "";
  receiver_handle?: string | "";
  notes?: string;
}

export interface BuyinRow {
  buyin_id: string;
  tg_user_id: string | number;
  display_name: string;
  method: Method;
  amount: number;
  status: "PENDING" | "MATCHED" | "PAID" | "CANCELLED";
  assigned_to: string; // "OWNER" | cashout_id | ""
  created_at: string;
  updated_at: string;
}

export interface MatchResultOwnerFallback {
  type: "OWNER";
  method: Method;
  owner: OwnerAccount;
  amount: number;
}

export interface MatchResultCashout {
  type: "CASHOUT";
  cashout: CashoutRow;
  amount: number;
}

export type MatchResult = MatchResultOwnerFallback | MatchResultCashout;

// Enhanced match result with row information for new workflow
export interface EnhancedMatchResult {
  type: 'CASHOUT' | 'OWNER';
  amount: number;
  method: string;
  rowIndex?: number; // For CASHOUT matches (legacy)
  request_id?: string; // For CASHOUT matches (new)
  receiver?: string; // For CASHOUT matches
  owner?: OwnerAccount; // For OWNER matches
}

// New types for group workflow
export interface Transaction {
  buyinId: string;
  playerId: number;
  playerUsername?: string;
  playerFirstName?: string;
  method: Method;
  amount: number;
  match: EnhancedMatchResult;
  timestamp: number;
  groupMessageId?: number;
  groupChatId?: number;
}

export interface UserRole {
  tg_user_id: number;
  role: 'owner' | 'loader' | 'none';
  display_name?: string;
}

// Session data for tracking first-time users in groups
export interface GroupSession {
  firstTimeUsers: Set<number>; // user IDs who have been greeted
}

// Withdrawal types
export interface WithdrawalSession {
  step?: "WITHDRAW_METHOD" | "WITHDRAW_AMOUNT" | "WITHDRAW_TAG";
  method?: string;
  amount?: number;
  tag?: string;
  requestTimestampISO?: string;
}

export interface WithdrawalRequest {
  requestId: string;
  userId: number;
  username: string;
  amountUSD: number;
  method: string;
  tag: string;
  requestTimestampISO: string;
  approvedByUserId?: number;
  approvedAtISO?: string;
  status?: string;
}
