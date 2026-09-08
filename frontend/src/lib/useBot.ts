import { useSyncExternalStore } from 'react';
import { getBotState, subscribeBot, type BotState } from '../lib/ws';

export function useBotState(): BotState {
  return useSyncExternalStore(subscribeBot, getBotState, getBotState);
}