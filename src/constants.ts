import { Game, Tournament } from './types';

export interface GameMode {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  category: string;
}

export const GAME_MODES_DATA: Record<string, GameMode[]> = {
  freefire: [
    { id: 'br_solo', title: 'BR SOLO', subtitle: 'Battle Royale', category: 'Battle Royale', image: '/images/regenerated_image_1791735926796.jpg' },
    { id: 'br_duo', title: 'BR DUO', subtitle: 'Battle Royale', category: 'Battle Royale', image: '/images/regenerated_image_1791755547255.png' },
    { id: 'br_squad', title: 'BR SQUAD', subtitle: 'Battle Royale', category: 'Battle Royale', image: '/images/regenerated_image_1791755551692.png' },
    { id: 'free_match', title: 'FREE MATCH', subtitle: 'Free Entry', category: 'Free Match', image: '/images/regenerated_image_1791756013539.png' },
    { id: 'cs_headshot', title: 'CS HEADSHOT', subtitle: 'Only Headshot', category: 'CS Headshot', image: '/images/regenerated_image_1791756005244.png' },
    { id: 'cs_solo', title: 'CS SOLO', subtitle: 'Clash Squad', category: 'Clash Squad', image: '/images/regenerated_image_1791755559649.png' },
    { id: 'cs_duo', title: 'CS DUO', subtitle: 'Clash Squad', category: 'Clash Squad', image: '/images/regenerated_image_1791755563719.png' },
    { id: 'lone_wolf_solo', title: 'LONE WOLF SOLO', subtitle: 'Lone Wolf', category: 'Lone Wolf', image: '/images/regenerated_image_1791735947152.jpg' },
    { id: 'lone_wolf_duo', title: 'LONE WOLF DUO', subtitle: 'Lone Wolf', category: 'Lone Wolf', image: '/images/regenerated_image_1791735950149.jpg' },
  ]
};

export const GAMES: Game[] = [
  {
    id: 'freefire',
    title: 'Free Fire',
    image: '/images/regenerated_image_1791755547255.png',
    players: 850,
  }
];

