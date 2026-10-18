import { Tournament } from '../types';

export interface CategoryDef {
  id: string;
  label: string;
  section: string;
  mode: string;
  teamSize: number;
  defaultSlots: number;
  description: string;
}

export const MATCH_CATEGORIES: CategoryDef[] = [
  {
    id: 'br_solo',
    label: 'BR SOLO',
    section: 'Battle Royale',
    mode: 'Solo',
    teamSize: 1,
    defaultSlots: 48,
    description: 'Battle Royale 48-Player Solo Tournament'
  },
  {
    id: 'br_duo',
    label: 'BR DUO',
    section: 'Battle Royale',
    mode: 'Duo',
    teamSize: 2,
    defaultSlots: 48,
    description: 'Battle Royale 24-Team Duo Tournament'
  },
  {
    id: 'br_squad',
    label: 'BR SQUAD',
    section: 'Battle Royale',
    mode: 'Squad',
    teamSize: 4,
    defaultSlots: 48,
    description: 'Battle Royale 12-Team Squad Tournament'
  },
  {
    id: 'free_match',
    label: 'FREE MATCH',
    section: 'Free Match',
    mode: 'Solo',
    teamSize: 1,
    defaultSlots: 48,
    description: 'Free Entry Tournament'
  },
  {
    id: 'cs_headshot',
    label: 'CS HEADSHOT',
    section: 'CS Headshot',
    mode: 'Solo',
    teamSize: 1,
    defaultSlots: 8,
    description: 'Clash Squad Only Headshot Tournament'
  },
  {
    id: 'cs_solo',
    label: 'CS SOLO',
    section: 'Clash Squad',
    mode: 'Solo',
    teamSize: 1,
    defaultSlots: 2,
    description: 'Clash Squad 1v1 Duel'
  },
  {
    id: 'cs_duo',
    label: 'CS DUO',
    section: 'Clash Squad',
    mode: 'Duo',
    teamSize: 2,
    defaultSlots: 4,
    description: 'Clash Squad 2v2 Battle'
  },
  {
    id: 'lone_wolf_solo',
    label: 'LONE WOLF SOLO',
    section: 'Lone Wolf',
    mode: 'Solo',
    teamSize: 1,
    defaultSlots: 2,
    description: 'Lone Wolf 1v1 Tournament'
  },
  {
    id: 'lone_wolf_duo',
    label: 'LONE WOLF DUO',
    section: 'Lone Wolf',
    mode: 'Duo',
    teamSize: 2,
    defaultSlots: 4,
    description: 'Lone Wolf 2v2 Tournament'
  },
  {
    id: 'custom_room',
    label: 'CUSTOM ROOM',
    section: 'Custom Room',
    mode: 'Solo',
    teamSize: 1,
    defaultSlots: 48,
    description: 'Special Custom Room Event'
  }
];

export const VALID_CATEGORY_IDS = MATCH_CATEGORIES.map(c => c.id);

/**
 * Accurately determines the exact standardized category for a match.
 * Prevents BR Solo from matching BR Duo or BR Squad.
 */
export function getMatchCategory(match: {
  id?: string;
  modeId?: string;
  category?: string;
  mode?: string;
  section?: string;
  title?: string;
  entryFee?: number;
}): string {
  // 1. Explicit normalized category property
  if (match.category) {
    const cat = match.category.toLowerCase().trim().replace(/^freefire_/, '');
    if (VALID_CATEGORY_IDS.includes(cat)) {
      return cat;
    }
  }

  // 2. Explicit modeId property
  if (match.modeId) {
    const mid = match.modeId.toLowerCase().trim().replace(/^freefire_/, '');
    if (VALID_CATEGORY_IDS.includes(mid)) {
      return mid;
    }
  }

  // 3. Evaluate title and section keywords
  const title = (match.title || '').toUpperCase();
  const section = (match.section || '').toUpperCase();
  const mode = (match.mode || '').toUpperCase();

  // Free Match check (explicit section, title or entryFee = 0)
  if (section.includes('FREE') || title.includes('FREE MATCH') || match.entryFee === 0) {
    return 'free_match';
  }

  // CS Headshot check
  if (section.includes('HEADSHOT') || title.includes('HEADSHOT')) {
    return 'cs_headshot';
  }

  // Clash Squad check
  if (section.includes('CLASH') || section.includes('CS') || title.includes('CLASH') || title.includes('CS')) {
    if (mode.includes('DUO') || mode.includes('2V2') || title.includes('2V2') || title.includes('CS DUO')) {
      return 'cs_duo';
    }
    return 'cs_solo';
  }

  // Lone Wolf check
  if (section.includes('LONE') || section.includes('WOLF') || title.includes('LONE WOLF')) {
    if (mode.includes('DUO') || mode.includes('2V2') || title.includes('2V2') || title.includes('DUO')) {
      return 'lone_wolf_duo';
    }
    return 'lone_wolf_solo';
  }

  // Battle Royale check (Disambiguate Solo vs Duo vs Squad strictly)
  if (section.includes('BATTLE') || section.includes('ROYALE') || section.includes('BR') || title.includes('BATTLE ROYALE') || title.includes('BR')) {
    if (mode.includes('SQUAD') || title.includes('SQUAD') || title.includes('4V4')) {
      return 'br_squad';
    }
    if (mode.includes('DUO') || title.includes('DUO') || title.includes('2V2')) {
      return 'br_duo';
    }
    return 'br_solo';
  }

  // Fallback checking mode string directly
  if (mode.includes('SQUAD')) return 'br_squad';
  if (mode.includes('DUO')) return 'br_duo';
  if (mode.includes('SOLO')) return 'br_solo';

  return 'br_solo';
}

/**
 * Strictly verifies whether a match belongs to the requested category.
 * Guaranteed: A BR Solo match will NEVER return true for BR Duo or BR Squad.
 */
export function matchBelongsToCategory(
  match: Tournament,
  targetCategoryOrModeId: string
): boolean {
  if (!targetCategoryOrModeId) return true;
  
  const cleanTarget = targetCategoryOrModeId.toLowerCase().trim().replace(/^freefire_/, '');
  
  // If target is "all" or empty, match all
  if (cleanTarget === 'all' || cleanTarget === '') return true;

  const matchCategory = getMatchCategory(match);

  // Exact match on categorized ID
  if (matchCategory === cleanTarget) {
    return true;
  }

  // Strict check for BR Solo vs Duo vs Squad
  if (cleanTarget === 'br_solo') {
    return matchCategory === 'br_solo';
  }
  if (cleanTarget === 'br_duo') {
    return matchCategory === 'br_duo';
  }
  if (cleanTarget === 'br_squad') {
    return matchCategory === 'br_squad';
  }

  return false;
}
