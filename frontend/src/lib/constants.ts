/**
 * Application constants
 */

export const APP_NAME = 'AI Dataset Explorer';
export const APP_VERSION = '0.1.0';
export const APP_DESCRIPTION = 'Explore and discover ML datasets and models for your AI projects';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';
export const MAX_QUERY_LENGTH = parseInt(process.env.MAX_QUERY_LENGTH || '8000', 10);
export const MIN_QUERY_LENGTH = parseInt(process.env.MIN_QUERY_LENGTH || '20', 10);
export const RATE_LIMIT_RPM = parseInt(process.env.RATE_LIMIT_RPM || '10', 10);

export const TIMEOUT_MS = parseInt(process.env.EXTERNAL_API_TIMEOUT_MS || '15000', 10);
export const OPENROUTER_TIMEOUT_MS = parseInt(process.env.OPENROUTER_TIMEOUT_MS || '15000', 10);

export const SEARCH_TYPES = {
  DATASET: 'dataset',
  MODEL: 'model',
  BOTH: 'both',
} as const;

export const RESOURCE_SOURCES = {
  KAGGLE: 'kaggle',
  HUGGING_FACE: 'huggingface',
  CUSTOM: 'custom',
} as const;

export const DIFFICULTY_LEVELS = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard',
} as const;

export const PAGE_ROUTES = {
  HOME: '/',
  EXPLORE: '/explore',
  SEARCH: '/search',
  ROADMAPS: '/roadmaps',
  SETTINGS: '/settings',
  LOGIN: '/login',
  SIGNUP: '/signup',
} as const;
