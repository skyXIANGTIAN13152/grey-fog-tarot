export interface TarotCard {
  name_short: string;
  name: string;
  value: string;
  value_int: number;
  type: 'major' | 'minor';
  suit?: string;
  meaning_up: string;
  meaning_rev: string;
  desc: string;
  nameZh: string;
  meaningUpZh: string;
  meaningRevZh: string;
  descZh: string;
  image: string;
}

export interface DrawnCard {
  cardId: string;
  reversed: boolean;
  position: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Reading {
  id: string;
  createdAt: string;
  question: string;
  spreadId: string;
  cards: DrawnCard[];
  messages: ChatMessage[];
  note: string;
}

export interface ApiConfig {
  provider: 'openai' | 'anthropic' | 'gemini';
  preset: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  rememberKey: boolean;
}

export interface Spread {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  positions: string[];
  icon?: string;
}

export interface ApiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
