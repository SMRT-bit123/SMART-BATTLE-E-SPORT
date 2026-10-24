/**
 * Auth Diagnostic Logging Utility for SMART BATTLE
 * Safely records session state, token expiration times, wake events,
 * and refresh attempts. NEVER logs passwords, full tokens, or private secrets.
 */
import { User as FirebaseUser } from 'firebase/auth';

function maskEmail(email?: string | null): string {
  if (!email) return 'anonymous/none';
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const name = parts[0];
  const domain = parts[1];
  const maskedName = name.length > 2 ? `${name[0]}***${name[name.length - 1]}` : `${name[0]}***`;
  return `${maskedName}@${domain}`;
}

function maskUid(uid?: string | null): string {
  if (!uid) return 'none';
  if (uid.length <= 6) return '***';
  return `${uid.slice(0, 4)}...${uid.slice(-3)}`;
}

export interface SessionInfo {
  uid: string;
  email: string;
  isAnonymous: boolean;
  expiresInMinutes?: number;
  expirationTime?: string;
  issuedAtTime?: string;
}

export async function getSafeSessionInfo(user: FirebaseUser | null): Promise<SessionInfo | null> {
  if (!user) return null;
  try {
    const tokenResult = await user.getIdTokenResult();
    const expDate = new Date(tokenResult.expirationTime);
    const remainingMs = expDate.getTime() - Date.now();
    const remainingMinutes = Math.round((remainingMs / 60000) * 10) / 10;

    return {
      uid: maskUid(user.uid),
      email: maskEmail(user.email),
      isAnonymous: user.isAnonymous,
      expiresInMinutes: remainingMinutes,
      expirationTime: tokenResult.expirationTime,
      issuedAtTime: tokenResult.issuedAtTime
    };
  } catch (err: any) {
    return {
      uid: maskUid(user.uid),
      email: maskEmail(user.email),
      isAnonymous: user.isAnonymous
    };
  }
}

export const AuthLogger = {
  sessionInit: (stage: string, info?: Record<string, any>) => {
    console.log(`[AuthDiagnostics:Init] ${stage}`, info ? JSON.stringify(info) : '');
  },

  sessionRestored: async (user: FirebaseUser) => {
    const safeInfo = await getSafeSessionInfo(user);
    console.log(
      `[AuthDiagnostics:SessionRestored] User ${safeInfo?.uid} (${safeInfo?.email}) restored. Token valid for ~${safeInfo?.expiresInMinutes}m (Expires at ${safeInfo?.expirationTime})`
    );
  },

  tokenStatus: async (user: FirebaseUser, context: string) => {
    const safeInfo = await getSafeSessionInfo(user);
    console.log(
      `[AuthDiagnostics:TokenStatus] Context: "${context}". User: ${safeInfo?.uid}, remaining validity: ~${safeInfo?.expiresInMinutes}m (Expires: ${safeInfo?.expirationTime})`
    );
  },

  refreshAttempt: (trigger: string, reason?: string) => {
    console.log(`[AuthDiagnostics:Refresh] Attempting proactive token renewal. Trigger: "${trigger}". Reason: "${reason || 'routine keep-alive'}"`);
  },

  refreshSuccess: (newExpirationTime?: string) => {
    console.log(`[AuthDiagnostics:RefreshSuccess] Token refreshed successfully. New expiration: ${newExpirationTime || 'renewed for 60m'}`);
  },

  refreshError: (error: any, isNetworkError: boolean) => {
    if (isNetworkError) {
      console.warn(`[AuthDiagnostics:RefreshNotice] Temporary network interruption while renewing token (${error?.code || error?.message || 'offline'}). Session preserved locally.`);
    } else {
      console.error(`[AuthDiagnostics:RefreshError] Fatal authentication error during refresh:`, error?.code || error?.message);
    }
  },

  wakeEvent: (eventType: string, isVisible: boolean, isOnline: boolean) => {
    console.log(`[AuthDiagnostics:Wake] Event: ${eventType}, Tab visible: ${isVisible}, Browser online: ${isOnline}`);
  },

  logout: (reason: string, initiatingUserUid?: string | null) => {
    console.warn(`[AuthDiagnostics:Logout] Signing out user ${maskUid(initiatingUserUid)}. Reason: "${reason}"`);
  }
};
