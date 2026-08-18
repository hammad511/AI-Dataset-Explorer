/**
 * Route definitions
 */

export const ROUTES = {
  HOME: '/',
  EXPLORE: '/explore',
  SEARCH: '/search',
  ROADMAPS: '/roadmaps',
  SETTINGS: '/settings',
  LOGIN: '/login',
  SIGNUP: '/signup',
} as const;

export const API_ROUTES = {
  SEARCH: '/api/search',
  CHAT: '/api/chat',
  AUTH_SIGN_IN: '/api/auth/signin',
  AUTH_SIGN_OUT: '/api/auth/signout',
  DIAGNOSTICS: '/api/diagnostics/gemini',
  HEALTH: '/api/health',
} as const;

export const REDIRECT_ROUTES = {
  AFTER_LOGIN: ROUTES.EXPLORE,
  AFTER_LOGOUT: ROUTES.HOME,
  UNAUTHORIZED: ROUTES.LOGIN,
} as const;
