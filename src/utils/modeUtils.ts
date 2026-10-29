import { GAME_MODES_DATA, GameMode } from '../constants';
import { Tournament } from '../types';

/**
 * Returns all canonical game modes supported by the SMART BATTLE application.
 * Defaults to Free Fire game modes configured in constants.
 */
export function getAllAvailableGameModes(): GameMode[] {
  return GAME_MODES_DATA['freefire'] || [];
}

/**
 * Normalizes a mode ID (e.g. 'freefire_cs_headshot' -> 'cs_headshot')
 */
export function normalizeModeId(rawModeId?: string | null): string {
  if (!rawModeId) return '';
  return rawModeId.toLowerCase().trim().replace(/^freefire_/, '');
}

/**
 * Gets the human-readable display title for a game mode ID
 */
export function getGameModeTitle(modeId?: string | null): string {
  if (!modeId) return 'All Modes';
  const cleanId = normalizeModeId(modeId);
  const modes = getAllAvailableGameModes();
  const found = modes.find(m => normalizeModeId(m.id) === cleanId);
  if (found) return found.title;

  // Fallback: title-case the clean ID
  return cleanId
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Determines whether a tournament match belongs to a specified game mode.
 * Robustly checks modeId, category, section, title, and standard game rules.
 */
export function matchBelongsToMode(
  match: Partial<Tournament> | null | undefined,
  targetModeId?: string | null,
  targetModeTitle?: string | null
): boolean {
  if (!match || !targetModeId) return false;

  const modeId = normalizeModeId(targetModeId);
  const matchModeId = normalizeModeId(match.modeId);
  const matchCat = normalizeModeId(match.category);
  const matchSection = (match.section || '').toLowerCase().trim();
  const matchMode = (match.mode || '').toLowerCase().trim();
  const matchTitle = (match.title || '').toLowerCase().trim();

  // 1. Direct modeId or category match
  if (matchModeId && (matchModeId === modeId || matchModeId.includes(modeId))) {
    return true;
  }
  if (matchCat && (matchCat === modeId || matchCat.includes(modeId))) {
    return true;
  }

  // 2. Direct title comparison if targetModeTitle supplied
  if (targetModeTitle) {
    const targetTitleL = targetModeTitle.toLowerCase().trim();
    if (matchSection === targetTitleL || matchMode === targetTitleL) {
      return true;
    }
    if (matchTitle.includes(targetTitleL)) {
      return true;
    }
  }

  // 3. Specific canonical Free Fire Mode rules
  if (modeId === 'cs_headshot' || modeId.includes('headshot')) {
    return (
      matchSection.includes('headshot') ||
      matchMode.includes('headshot') ||
      matchTitle.includes('headshot') ||
      matchCat.includes('headshot')
    );
  }

  if (modeId === 'free_match' || modeId.includes('free')) {
    return (
      matchSection.includes('free') ||
      matchMode.includes('free') ||
      matchTitle.includes('free') ||
      match.entryFee === 0
    );
  }

  if (modeId === 'br_solo') {
    return (
      (matchSection.includes('battle') || !matchSection || matchSection === 'general') &&
      (matchMode === 'solo' || matchModeId === 'br_solo' || matchTitle.includes('solo'))
    );
  }

  if (modeId === 'br_duo') {
    return (
      (matchSection.includes('battle') || !matchSection || matchSection === 'general') &&
      (matchMode === 'duo' || matchModeId === 'br_duo' || matchTitle.includes('duo'))
    );
  }

  if (modeId === 'br_squad') {
    return (
      (matchSection.includes('battle') || !matchSection || matchSection === 'general') &&
      (matchMode === 'squad' || matchModeId === 'br_squad' || matchTitle.includes('squad'))
    );
  }

  if (modeId === 'cs_solo') {
    return matchSection.includes('clash') && (matchMode === 'solo' || matchTitle.includes('solo'));
  }

  if (modeId === 'cs_duo') {
    return matchSection.includes('clash') && (matchMode === 'duo' || matchTitle.includes('duo'));
  }

  if (modeId === 'lone_wolf_solo') {
    return matchSection.includes('lone') && (matchMode === 'solo' || matchTitle.includes('solo'));
  }

  if (modeId === 'lone_wolf_duo') {
    return matchSection.includes('lone') && (matchMode === 'duo' || matchTitle.includes('duo'));
  }

  // 4. Substring / fuzzy heuristic on combined match string
  const combined = `${matchTitle} ${matchSection} ${matchMode}`.replace(/[_-]/g, ' ');
  const modeKeywords = modeId.replace(/[_-]/g, ' ');
  return combined.includes(modeKeywords);
}
