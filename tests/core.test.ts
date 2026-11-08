import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { CARDS, CARD_MAP, SPREADS, buildMessages, drawCards, randomInt, searchCards } from '../src/lib/tarot';
import {
  STORAGE_KEYS, clearReadings, deleteReadings, exportReadings, importReadings,
  loadConfig, loadReadings, saveConfig, saveReading,
} from '../src/lib/storage';
import type { ApiConfig, Reading } from '../src/types';

class MemoryStorage implements Storage {
  data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
}

let local: MemoryStorage;
let session: MemoryStorage;

beforeEach(() => {
  local = new MemoryStorage();
  session = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: session, configurable: true });
});

function reading(id = 'reading-1'): Reading {
  return {
    id, createdAt: '2026-11-06T08:00:00.000Z', question: '如何理解当下的变化？', spreadId: 'three',
    cards: drawCards('three'), messages: [], note: '为自己留一点空间。',
  };
}

const config: ApiConfig = {
  provider: 'openai', preset: 'custom', baseUrl: 'https://example.test/v1',
  apiKey: 'test-only-not-a-real-key', model: 'test-model', rememberKey: false,
};

test('deck contains 78 unique cards and complete bilingual source fields', () => {
  assert.equal(CARDS.length, 78);
  assert.equal(CARD_MAP.size, 78);
  assert.equal(CARDS.filter((card) => card.type === 'major').length, 22);
  assert.equal(CARDS.filter((card) => card.type === 'minor').length, 56);
  for (const card of CARDS) {
    for (const field of ['name', 'nameZh', 'meaning_up', 'meaning_rev', 'meaningUpZh', 'meaningRevZh', 'desc', 'descZh', 'image'] as const) {
      assert.ok(card[field]?.trim(), `${card.name_short} has no ${field}`);
    }
    assert.match(card.image, /^\/cards\/[a-z0-9]+\.(?:jpg|png)$/u);
  }
});

test('each spread draws the correct number of unique valid cards with matching positions', () => {
  for (const spread of SPREADS) {
    for (let trial = 0; trial < 15; trial++) {
      const draws = drawCards(spread.id);
      assert.equal(draws.length, spread.positions.length);
      assert.equal(new Set(draws.map((card) => card.cardId)).size, draws.length);
      assert.deepEqual(draws.map((card) => card.position), spread.positions);
      assert.ok(draws.every((card) => CARD_MAP.has(card.cardId)));
    }
    assert.ok(drawCards(spread.id, false).every((card) => !card.reversed));
  }
  assert.throws(() => drawCards('unknown'), /牌阵/u);
});

test('randomInt rejects out-of-range samples to avoid modulo bias', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  let draws = 0;
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: { getRandomValues(array: Uint32Array) { array[0] = draws++ === 0 ? 0xFFFFFFFF : 42; return array; } },
  });
  try {
    assert.equal(randomInt(78), 42);
    assert.equal(draws, 2);
    assert.throws(() => randomInt(0));
    assert.throws(() => randomInt(1.5));
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
  }
});

test('search matches Chinese, English, meanings and suit filters', () => {
  const first = CARDS[0];
  assert.ok(searchCards(first.nameZh).some((card) => card.name_short === first.name_short));
  assert.ok(searchCards(first.name.toUpperCase()).some((card) => card.name_short === first.name_short));
  assert.ok(searchCards(first.meaning_up.split(/[ ,;.]/u)[0]).length > 0);
  assert.equal(searchCards('', 'major').length, 22);
  // Full-text search can also find minor-card descriptions referring to majors.
  const majorTextResults = new Set(searchCards('大阿卡纳').map((card) => card.name_short));
  assert.ok(CARDS.filter((card) => card.type === 'major').every((card) => majorTextResults.has(card.name_short)));
  assert.equal(searchCards('', 'minor').length, 56);
  assert.equal(searchCards('', 'wands').length, 14);
  assert.equal(searchCards('', '权杖').length, 14);
  assert.equal(searchCards('impossible_term_9374').length, 0);
});

test('prompts preserve fixed draw, orientation, meanings and conversation without duplicate follow-up', () => {
  const current = reading();
  current.cards[0].reversed = true;
  current.messages = [{ role: 'assistant', content: '已有解读。' }, { role: 'user', content: '此前的追问。' }, { role: 'assistant', content: '此前的回答。' }];
  const messages = buildMessages(current, '具体可以怎样行动？');
  const card = CARD_MAP.get(current.cards[0].cardId)!;
  assert.equal(messages[0].role, 'system');
  assert.ok(messages[1].content.includes(current.question));
  assert.ok(messages[1].content.includes(card.meaning_rev));
  assert.ok(messages[1].content.includes(card.meaningRevZh));
  assert.ok(messages[1].content.includes('逆位'));
  assert.deepEqual(messages.slice(2, -1), current.messages);
  assert.equal(messages.at(-1)?.content, '具体可以怎样行动？');
  assert.equal(messages.filter((message) => message.content === '具体可以怎样行动？').length, 1);
  assert.equal(current.messages.length, 3);
});

test('history round-trips, updates existing records, deletes selection, and strips extra key fields', () => {
  const current = reading();
  saveReading({ ...current, apiKey: config.apiKey } as Reading);
  saveReading({ ...reading('reading-2'), createdAt: '2026-11-06T09:00:00Z' });
  assert.equal(loadReadings().length, 2);
  assert.equal(loadReadings()[0].id, 'reading-2');
  saveReading({ ...current, note: '更新后的笔记' });
  assert.equal(loadReadings().length, 2);
  assert.equal(loadReadings().find((item) => item.id === current.id)?.note, '更新后的笔记');
  assert.ok(!exportReadings().includes(config.apiKey));
  deleteReadings(['reading-2']);
  assert.deepEqual(loadReadings().map((item) => item.id), [current.id]);
  clearReadings();
  assert.deepEqual(loadReadings(), []);
});

test('history export/import merges without silently losing existing records', () => {
  saveReading(reading('first'));
  const backup = exportReadings();
  clearReadings();
  saveReading(reading('second'));
  assert.equal(importReadings(backup), 1);
  assert.deepEqual(new Set(loadReadings().map((item) => item.id)), new Set(['first', 'second']));
  assert.equal(importReadings(backup), 1);
  assert.equal(loadReadings().length, 2);
});

test('corrupt and future-version history remains untouched and exportable', () => {
  for (const raw of ['{broken', JSON.stringify({ version: 99, readings: [] }), JSON.stringify({ version: 1, readings: [{ id: 'bad' }] })]) {
    local.setItem(STORAGE_KEYS.readings, raw);
    assert.throws(() => loadReadings(), /保存的/u);
    assert.throws(() => saveReading(reading()), /保存的/u);
    assert.equal(exportReadings(), raw);
  }
});

test('keys are session-only by default and removed from durable settings when remember is disabled', () => {
  saveConfig(config);
  assert.equal(loadConfig().apiKey, config.apiKey);
  assert.ok(!local.getItem(STORAGE_KEYS.config)?.includes(config.apiKey));
  assert.equal(JSON.parse(session.getItem(STORAGE_KEYS.sessionKey)!).apiKey, config.apiKey);
  session.clear();
  assert.equal(loadConfig().apiKey, '');
  saveConfig({ ...config, rememberKey: true });
  assert.ok(local.getItem(STORAGE_KEYS.config)?.includes(config.apiKey));
  assert.equal(session.getItem(STORAGE_KEYS.sessionKey), null);
  saveConfig(config);
  assert.ok(!local.getItem(STORAGE_KEYS.config)?.includes(config.apiKey));
});

test('failed durable config write rolls back session key and gives a useful error', () => {
  saveConfig(config);
  const oldRaw = local.getItem(STORAGE_KEYS.config);
  const oldSessionRaw = session.getItem(STORAGE_KEYS.sessionKey);
  local.setItem = () => { throw new DOMException('Quota', 'QuotaExceededError'); };
  assert.throws(() => saveConfig({ ...config, apiKey: 'replacement' }), /空间不足/u);
  assert.equal(session.getItem(STORAGE_KEYS.sessionKey), oldSessionRaw);
  assert.equal(local.getItem(STORAGE_KEYS.config), oldRaw);
});

test('another tab changing endpoint never reuses this tab\'s API key for the new service', () => {
  saveConfig(config);
  const firstTab = session;
  const secondTab = new MemoryStorage();
  Object.defineProperty(globalThis, 'sessionStorage', { value: secondTab, configurable: true });
  const otherConfig = { ...config, baseUrl: 'https://other-service.test/v1', apiKey: 'other-test-key' };
  saveConfig(otherConfig);
  assert.equal(loadConfig().apiKey, otherConfig.apiKey);
  Object.defineProperty(globalThis, 'sessionStorage', { value: firstTab, configurable: true });
  assert.equal(loadConfig().baseUrl, otherConfig.baseUrl);
  assert.equal(loadConfig().apiKey, '');
  assert.ok(!local.getItem(STORAGE_KEYS.config)?.includes(config.apiKey));
});

test('session key identity includes protocol and path, while equivalent trailing slashes match', () => {
  saveConfig(config);
  const raw = JSON.parse(local.getItem(STORAGE_KEYS.config)!);
  local.setItem(STORAGE_KEYS.config, JSON.stringify({ ...raw, config: { ...raw.config, baseUrl: `${config.baseUrl}/` } }));
  assert.equal(loadConfig().apiKey, config.apiKey);
  local.setItem(STORAGE_KEYS.config, JSON.stringify({ ...raw, config: { ...raw.config, provider: 'anthropic' } }));
  assert.equal(loadConfig().apiKey, '');
  local.setItem(STORAGE_KEYS.config, JSON.stringify({ ...raw, config: { ...raw.config, baseUrl: 'https://example.test/other' } }));
  assert.equal(loadConfig().apiKey, '');
});

test('legacy unbound and corrupt session keys require re-entry rather than guessing a service', () => {
  saveConfig(config);
  for (const raw of [config.apiKey, '{broken', JSON.stringify({ version: 99, apiKey: config.apiKey })]) {
    session.setItem(STORAGE_KEYS.sessionKey, raw);
    assert.equal(loadConfig().apiKey, '');
    assert.equal(session.getItem(STORAGE_KEYS.sessionKey), raw);
  }
});

test('blocked browser storage gives a useful error even when the storage getter throws', () => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new DOMException('Access denied', 'SecurityError'); },
  });
  assert.throws(() => loadReadings(), /浏览器是否允许/u);
});
