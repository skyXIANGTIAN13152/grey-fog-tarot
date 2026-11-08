import type { ApiConfig, ChatMessage, DrawnCard, Reading } from '../types';
import { CARD_MAP, SPREADS } from './tarot';

export const STORAGE_KEYS = {
  readings: 'grey-fog-tarot.readings.v1',
  config: 'grey-fog-tarot.config.v1',
  sessionKey: 'grey-fog-tarot.session-key.v1',
} as const;

export const DEFAULT_CONFIG: ApiConfig = {
  provider: 'openai', preset: 'custom', baseUrl: '', apiKey: '', model: '', rememberKey: false,
};

const VERSION = 1;
type ObjectValue = Record<string, unknown>;

function object(value: unknown): value is ObjectValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function string(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length <= maxLength;
}

function storageError(error: unknown, action: string): Error {
  if (error instanceof Error && error.message.startsWith('保存的')) return error;
  const quota = error instanceof Error && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
  return new Error(quota
    ? '浏览器存储空间不足。请导出历史记录后，删除不需要的记录再试。'
    : `无法${action}本地数据。请检查浏览器是否允许此网站使用本地存储。`);
}

function getStorage(kind: 'localStorage' | 'sessionStorage'): Storage {
  try {
    const storage = globalThis[kind];
    if (!storage) throw new Error('Storage unavailable');
    return storage;
  } catch (error) { throw storageError(error, '访问'); }
}

function read(storage: Storage, key: string): string | null {
  try { return storage.getItem(key); } catch (error) { throw storageError(error, '读取'); }
}

function parseEnvelope(raw: string, label: string): ObjectValue {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!object(parsed) || parsed.version !== VERSION) throw new Error('Invalid version');
    return parsed;
  } catch {
    throw new Error(`保存的${label}格式损坏或版本不受支持，原始数据仍保留在浏览器中。请先导出备份，再选择清空。`);
  }
}

function cleanReading(value: unknown): Reading {
  if (!object(value)
    || !string(value.id, 120) || !value.id
    || !string(value.createdAt, 50) || !Number.isFinite(Date.parse(value.createdAt))
    || !string(value.question, 10000)
    || !string(value.spreadId, 40)
    || !string(value.note, 50000)
    || !Array.isArray(value.cards)
    || !Array.isArray(value.messages) || value.messages.length > 1000) {
    throw new Error('保存的历史记录格式不完整，原始数据仍保留在浏览器中。');
  }
  const spread = SPREADS.find((item) => item.id === value.spreadId);
  if (!spread || value.cards.length !== spread.positions.length) {
    throw new Error('保存的历史记录与牌阵不匹配，原始数据仍保留在浏览器中。');
  }
  const cards: DrawnCard[] = value.cards.map((card) => {
    if (!object(card) || !string(card.cardId, 30) || !CARD_MAP.has(card.cardId)
      || typeof card.reversed !== 'boolean' || !string(card.position, 200)) {
      throw new Error('保存的历史记录包含无法识别的牌，原始数据仍保留在浏览器中。');
    }
    return { cardId: card.cardId, reversed: card.reversed, position: card.position };
  });
  if (new Set(cards.map((card) => card.cardId)).size !== cards.length) {
    throw new Error('保存的历史记录包含重复的牌，原始数据仍保留在浏览器中。');
  }
  const messages: ChatMessage[] = value.messages.map((message) => {
    if (!object(message) || (message.role !== 'user' && message.role !== 'assistant') || !string(message.content, 500000)) {
      throw new Error('保存的对话记录格式损坏，原始数据仍保留在浏览器中。');
    }
    return { role: message.role, content: message.content };
  });
  // Whitelisting strips any accidental settings or API credentials from a Reading.
  return { id: value.id, createdAt: value.createdAt, question: value.question, spreadId: value.spreadId, cards, messages, note: value.note };
}

export function loadReadings(): Reading[] {
  const raw = read(getStorage('localStorage'), STORAGE_KEYS.readings);
  if (raw === null) return [];
  const envelope = parseEnvelope(raw, '历史记录');
  if (!Array.isArray(envelope.readings)) throw new Error('保存的历史记录格式损坏，原始数据仍保留在浏览器中。');
  const readings = envelope.readings.map(cleanReading);
  if (new Set(readings.map((reading) => reading.id)).size !== readings.length) {
    throw new Error('保存的历史记录存在重复编号，原始数据仍保留在浏览器中。');
  }
  return readings.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function writeReadings(readings: Reading[]): void {
  try {
    getStorage('localStorage').setItem(STORAGE_KEYS.readings, JSON.stringify({ version: VERSION, readings }));
  } catch (error) { throw storageError(error, '保存'); }
}

export function saveReading(reading: Reading): void {
  const clean = cleanReading(reading);
  const current = loadReadings();
  const index = current.findIndex((item) => item.id === clean.id);
  if (index < 0) current.unshift(clean); else current[index] = clean;
  writeReadings(current);
}

export function deleteReadings(ids: string[]): void {
  const deleted = new Set(ids);
  writeReadings(loadReadings().filter((reading) => !deleted.has(reading.id)));
}

export function clearReadings(): void {
  try { getStorage('localStorage').removeItem(STORAGE_KEYS.readings); } catch (error) { throw storageError(error, '删除'); }
}

/** Raw export also works when a history entry is corrupt, allowing recovery. */
export function exportReadings(): string {
  return read(getStorage('localStorage'), STORAGE_KEYS.readings) ?? JSON.stringify({ version: VERSION, readings: [] }, null, 2);
}

export function importReadings(raw: string): number {
  const envelope = parseEnvelope(raw, '导入文件');
  if (!Array.isArray(envelope.readings)) throw new Error('保存的导入文件中没有历史记录。');
  const imported = envelope.readings.map(cleanReading);
  const merged = new Map(loadReadings().map((reading) => [reading.id, reading]));
  for (const reading of imported) merged.set(reading.id, reading);
  writeReadings([...merged.values()]);
  return imported.length;
}

function cleanConfig(value: unknown): ApiConfig {
  if (!object(value)
    || !['openai', 'anthropic', 'gemini'].includes(String(value.provider))
    || !string(value.preset, 100) || !string(value.baseUrl, 4096)
    || !string(value.apiKey, 16384) || !string(value.model, 300)
    || typeof value.rememberKey !== 'boolean') {
    throw new Error('保存的接口设置格式损坏，原始设置仍保留在浏览器中。');
  }
  return {
    provider: value.provider as ApiConfig['provider'], preset: value.preset,
    baseUrl: value.baseUrl.trim(), apiKey: value.apiKey.trim(), model: value.model.trim(), rememberKey: value.rememberKey,
  };
}

function endpointIdentity(config: ApiConfig): string {
  // Preserve path and query differences; only normalize syntactic URL details.
  // In particular, a key must never follow another tab's change of service.
  let baseUrl = config.baseUrl.trim();
  try {
    const url = new URL(baseUrl);
    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/u, '') || '/';
    baseUrl = url.href;
  } catch { /* Incomplete settings have no valid request target yet. */ }
  return `${config.provider}\n${baseUrl}`;
}

function readSessionKey(config: ApiConfig): string {
  const raw = read(getStorage('sessionStorage'), STORAGE_KEYS.sessionKey);
  if (raw === null) return '';
  try {
    const stored: unknown = JSON.parse(raw);
    if (!object(stored) || stored.version !== VERSION
      || stored.endpoint !== endpointIdentity(config) || !string(stored.apiKey, 16384)) return '';
    return stored.apiKey;
  } catch {
    // Legacy unbound keys cannot safely be attributed to the current endpoint.
    // Retain the raw session data but require re-entry rather than guessing.
    return '';
  }
}

export function loadConfig(): ApiConfig {
  const raw = read(getStorage('localStorage'), STORAGE_KEYS.config);
  if (raw === null) return { ...DEFAULT_CONFIG };
  const envelope = parseEnvelope(raw, '接口设置');
  const config = cleanConfig(envelope.config);
  if (!config.rememberKey) config.apiKey = readSessionKey(config);
  return config;
}

export function saveConfig(config: ApiConfig): void {
  const clean = cleanConfig(config);
  const local = getStorage('localStorage');
  const session = getStorage('sessionStorage');
  // Write session state first, then durable state; failure leaves previous config intact.
  const previousSessionKey = read(session, STORAGE_KEYS.sessionKey);
  try {
    if (clean.rememberKey) session.removeItem(STORAGE_KEYS.sessionKey);
    else session.setItem(STORAGE_KEYS.sessionKey, JSON.stringify({ version: VERSION, endpoint: endpointIdentity(clean), apiKey: clean.apiKey }));
    local.setItem(STORAGE_KEYS.config, JSON.stringify({ version: VERSION, config: { ...clean, apiKey: clean.rememberKey ? clean.apiKey : '' } }));
  } catch (error) {
    try {
      if (previousSessionKey === null) session.removeItem(STORAGE_KEYS.sessionKey);
      else session.setItem(STORAGE_KEYS.sessionKey, previousSessionKey);
    } catch { /* Preserve the original error if storage has become unavailable. */ }
    throw storageError(error, '保存接口设置');
  }
}

export function clearConfig(): void {
  try {
    getStorage('localStorage').removeItem(STORAGE_KEYS.config);
    getStorage('sessionStorage').removeItem(STORAGE_KEYS.sessionKey);
  } catch (error) { throw storageError(error, '清除接口设置'); }
}
