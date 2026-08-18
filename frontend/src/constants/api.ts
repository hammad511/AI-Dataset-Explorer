/**
 * API-related constants
 */

export const API_CONFIG = {
  BASE_URL: process.env.NEXT_PUBLIC_API_URL || '',
  TIMEOUT: parseInt(process.env.EXTERNAL_API_TIMEOUT_MS || '15000', 10),
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
} as const;

export const OPENROUTER_CONFIG = {
  API_KEY: process.env.OPENROUTER_API_KEY,
  MODEL: process.env.OPENROUTER_MODEL || 'openai/gpt-4.1-mini',
  API_URL: process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1/chat/completions',
  TIMEOUT_MS: parseInt(process.env.OPENROUTER_TIMEOUT_MS || '15000', 10),
} as const;

export const KAGGLE_CONFIG = {
  USERNAME: process.env.KAGGLE_USERNAME,
  KEY: process.env.KAGGLE_KEY,
  API_BASE: 'https://www.kaggle.com/api/v1',
} as const;

export const HUGGINGFACE_CONFIG = {
  TOKEN: process.env.HUGGING_FACE_TOKEN,
  API_BASE: 'https://huggingface.co/api',
} as const;

export const VALIDATION_CONFIG = {
  MAX_QUERY_LENGTH: parseInt(process.env.MAX_QUERY_LENGTH || '8000', 10),
  MIN_QUERY_LENGTH: parseInt(process.env.MIN_QUERY_LENGTH || '20', 10),
  RATE_LIMIT_RPM: parseInt(process.env.RATE_LIMIT_RPM || '10', 10),
} as const;

export const SEARCH_DEFAULTS = {
  LIMIT: 10,
  OFFSET: 0,
  TYPE: 'both' as const,
} as const;
