import { CARDS, CARD_MAP, SPREADS, randomInt } from './tarot';
import type { DrawnCard } from '../types';

export interface PickedCard {
  cardId: string;
  reversed: boolean;
}

export interface Selection {
  deck: (PickedCard | null)[];
  slots: (PickedCard | null)[];
  revealed: boolean[];
  replacement: number | null;
  shuffleKey: number;
}

function shuffled<T>(cards: readonly T[]): T[] {
  const result = [...cards];
  for (let end = result.length - 1; end > 0; end--) {
    const other = randomInt(end + 1);
    [result[end], result[other]] = [result[other], result[end]];
  }
  return result;
}

export function createSelection(spreadId: string, allowReversed: boolean): Selection {
  const spread = SPREADS.find(item => item.id === spreadId);
  if (!spread) throw new Error('未找到这个牌阵，请重新选择。');
  const deck = CARDS.map(card => ({
    cardId: card.name_short,
    reversed: allowReversed && randomInt(2) === 1,
  }));
  return {
    deck: shuffled(deck),
    slots: spread.positions.map(() => null),
    revealed: spread.positions.map(() => false),
    replacement: null,
    shuffleKey: 0,
  };
}

export function pickAt(selection: Selection, index: number): Selection {
  if (!Number.isInteger(index)) return selection;
  const chosen = selection.deck[index];
  if (!chosen) return selection;
  const slot = selection.replacement ?? selection.slots.indexOf(null);
  if (slot === -1) return selection;

  const deck = [...selection.deck];
  const previous = selection.slots[slot];
  if (previous) {
    // Return the replaced card to a pre-existing gap. A double click on the
    // chosen back can never accidentally draw the returned card.
    const gap = deck.indexOf(null);
    deck[gap] = previous;
  }
  deck[index] = null;
  const slots = [...selection.slots];
  slots[slot] = chosen;
  const revealed = [...selection.revealed];
  revealed[slot] = false;
  return { ...selection, deck, slots, revealed, replacement: null };
}

export function startReplacement(selection: Selection, slot: number): Selection {
  if (!Number.isInteger(slot) || !selection.slots[slot] || selection.replacement === slot) return selection;
  // Keep the old card in its slot until another back is actually chosen.
  const remaining = shuffled(selection.deck.filter(card => card !== null));
  let next = 0;
  const deck = selection.deck.map(card => card === null ? null : remaining[next++]);
  return { ...selection, deck, replacement: slot, shuffleKey: selection.shuffleKey + 1 };
}

export function cancelReplacement(selection: Selection): Selection {
  return selection.replacement === null ? selection : { ...selection, replacement: null };
}

export function revealSlot(selection: Selection, slot: number): Selection {
  if (selection.replacement !== null || !Number.isInteger(slot) || !selection.slots[slot]
    || selection.revealed[slot] || selection.slots.includes(null)) return selection;
  const revealed = [...selection.revealed];
  revealed[slot] = true;
  return { ...selection, revealed };
}

export function toDrawnCards(selection: Selection, spreadId: string): DrawnCard[] {
  const spread = SPREADS.find(item => item.id === spreadId);
  if (!spread || spread.positions.length !== selection.slots.length) throw new Error('牌位与牌阵不匹配。');
  if (selection.replacement !== null) throw new Error('请先完成或取消换牌。');
  return selection.slots.map((card, index) => {
    if (!card) throw new Error('请先选满所有牌位。');
    return { cardId: card.cardId, reversed: card.reversed, position: spread.positions[index] };
  });
}

export function isValidSelection(value: unknown, spreadId: string, allowReversed: boolean): value is Selection {
  if (!value || typeof value !== 'object') return false;
  const { deck, slots, revealed, replacement, shuffleKey } = value as Record<string, unknown>;
  const spread = SPREADS.find(item => item.id === spreadId);
  if (!spread || !Array.isArray(deck) || deck.length !== CARDS.length
    || !Array.isArray(slots) || slots.length !== spread.positions.length
    || !Array.isArray(revealed) || revealed.length !== slots.length
    || typeof shuffleKey !== 'number' || !Number.isSafeInteger(shuffleKey) || shuffleKey < 0) return false;
  if (replacement !== null && (typeof replacement !== 'number' || !Number.isInteger(replacement)
    || replacement < 0 || replacement >= slots.length || !slots[replacement])) return false;

  const firstEmpty = slots.indexOf(null);
  for (let i = 0; i < slots.length; i++) {
    if (typeof revealed[i] !== 'boolean') return false;
    if (firstEmpty !== -1 && (revealed[i] || (i >= firstEmpty && slots[i] !== null))) return false;
  }
  const seen = new Set<string>();
  for (const card of [...deck, ...slots]) {
    if (card === null) continue;
    if (!card || typeof card !== 'object' || !CARD_MAP.has(card.cardId)
      || seen.has(card.cardId) || typeof card.reversed !== 'boolean' || (!allowReversed && card.reversed)) return false;
    seen.add(card.cardId);
  }
  return seen.size === CARDS.length;
}
