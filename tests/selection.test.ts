import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cancelReplacement, createSelection, isValidSelection, pickAt,
  revealSlot, startReplacement, toDrawnCards,
} from '../src/lib/selection';
import { CARDS, SPREADS } from '../src/lib/tarot';

test('the shuffle assigns identities to all backs and manual clicks fill slots in order', () => {
  const original = createSelection('three', true);
  assert.equal(original.deck.length, 78);
  assert.deepEqual(new Set(original.deck.map(card => card?.cardId)), new Set(CARDS.map(card => card.name_short)));
  assert.deepEqual(original.slots, [null, null, null]);
  assert.ok(isValidSelection(original, 'three', true));
  const chosen = [77, 9, 33];
  const partial = pickAt(original, chosen[0]);
  assert.equal(partial.slots[0], original.deck[77]);
  assert.equal(partial.deck[77], null);
  assert.equal(partial.deck[9], original.deck[9]);
  assert.equal(pickAt(partial, 77), partial);
  assert.equal(revealSlot(partial, 0), partial);
  assert.throws(() => toDrawnCards(partial, 'three'), /选满/);
  const full = pickAt(pickAt(partial, chosen[1]), chosen[2]);
  assert.deepEqual(full.slots, chosen.map(index => original.deck[index]));
  assert.deepEqual(full.revealed, [false, false, false]);
  assert.equal(pickAt(full, 0), full);
  assert.deepEqual(original.slots, [null, null, null]);
  const flipped = revealSlot(full, 2);
  assert.deepEqual(flipped.revealed, [false, false, true]);
  assert.equal(revealSlot(flipped, 2), flipped);
  assert.deepEqual(toDrawnCards(flipped, 'three'), SPREADS.find(s => s.id === 'three')!.positions.map((position, order) => ({
    ...original.deck[chosen[order]], position,
  })));
});

test('every spread supports full manual selection and upright-only orientation', () => {
  for (const spread of SPREADS) {
    const initial = createSelection(spread.id, false);
    const indices = spread.positions.map((_, index) => 77 - index * 6);
    const full = indices.reduce(pickAt, initial);
    const cards = toDrawnCards(full, spread.id);
    assert.equal(cards.length, spread.positions.length);
    assert.ok(cards.every(card => !card.reversed));
    assert.deepEqual(full.slots, indices.map(index => initial.deck[index]));
    assert.ok(isValidSelection(full, spread.id, false));
  }
  assert.throws(() => createSelection('unknown', false), /牌阵/);
});

test('canceling or retargeting a replacement preserves prior faces, slots and their orientations', () => {
  const initial = [5, 60, 0].reduce(pickAt, createSelection('three', true));
  const full = revealSlot(revealSlot(initial, 0), 1);
  const replacing = startReplacement(full, 0);
  assert.equal(replacing.shuffleKey, full.shuffleKey + 1);
  assert.equal(replacing.replacement, 0);
  assert.equal(replacing.revealed, full.revealed);
  assert.deepEqual(replacing.deck.map(card => card === null), full.deck.map(card => card === null));
  assert.deepEqual(new Set(replacing.deck), new Set(full.deck));
  assert.equal(startReplacement(replacing, 0), replacing);
  assert.throws(() => toDrawnCards(replacing, 'three'), /换牌/);
  const retargeted = startReplacement(replacing, 1);
  assert.equal(retargeted.replacement, 1);
  assert.equal(revealSlot(retargeted, 2), retargeted);
  const canceled = cancelReplacement(retargeted);
  assert.equal(canceled.replacement, null);
  assert.equal(canceled.slots, full.slots);
  assert.equal(canceled.revealed, full.revealed);
  assert.equal(canceled.deck, retargeted.deck);

  const chosen = replacing.deck[21]!;
  const replaced = pickAt(replacing, 21);
  assert.notEqual(chosen.cardId, full.slots[0]!.cardId);
  assert.deepEqual(replaced.slots, [chosen, full.slots[1], full.slots[2]]);
  assert.ok(replaced.deck.includes(full.slots[0]!));
  assert.equal(replaced.deck[21], null);
  assert.equal(pickAt(replaced, 21), replaced);
  assert.deepEqual(replaced.revealed, [false, true, false]);
  assert.ok(isValidSelection(replaced, 'three', true));
});

test('a replacement before the spread fills leaves the next empty slot in order', () => {
  const initial = createSelection('year', false);
  const partial = pickAt(pickAt(initial, 72), 51);
  assert.equal(startReplacement(partial, 2), partial);
  const choosing = startReplacement(partial, 1);
  const swapped = pickAt(choosing, 22);
  assert.equal(swapped.slots[0], initial.deck[72]);
  assert.equal(swapped.slots[1], choosing.deck[22]);
  assert.equal(swapped.slots[2], null);
  assert.equal(pickAt(swapped, 22), swapped);
  assert.equal(pickAt(swapped, 3).slots[2], swapped.deck[3]);
  assert.ok(isValidSelection(swapped, 'year', false));
});

test('stored selections require valid shapes, unique cards and reachable reveal states', () => {
  const initial = createSelection('three', false);
  for (const bad of [NaN, -1, .5, 78, Infinity]) {
    assert.equal(pickAt(initial, bad), initial);
    assert.equal(startReplacement(initial, bad), initial);
    assert.equal(revealSlot(initial, bad), initial);
  }
  const partial = pickAt(initial, 42);
  const valid = startReplacement(partial, 0);
  assert.ok(isValidSelection(JSON.parse(JSON.stringify(valid)), 'three', false));
  assert.equal(isValidSelection(valid, 'year', false), false);
  assert.equal(isValidSelection(valid, 'missing', false), false);
  for (const invalid of [
    undefined, {}, { ...partial, deck: partial.deck.slice(1) }, { ...partial, shuffleKey: -1 },
    { ...partial, replacement: 3 }, { ...partial, replacement: 1 }, { ...partial, revealed: [true, false, false] },
    { ...partial, revealed: [0, false, false] }, { ...partial, slots: [null, partial.slots[0], null] },
    { ...partial, slots: [partial.deck[0], null, null] },
    { ...partial, slots: [{ cardId: 'missing-card', reversed: false }, null, null] },
    { ...partial, slots: [{ ...partial.slots[0], reversed: true }, null, null] },
  ]) {
    assert.equal(isValidSelection(invalid, 'three', false), false);
  }
});
