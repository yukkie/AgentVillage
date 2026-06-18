import { useMemo } from 'react';
import { deathsByAgent } from './parseGameData.js';

export function useDeaths(events) {
  return useMemo(() => deathsByAgent(events ?? []), [events]);
}
