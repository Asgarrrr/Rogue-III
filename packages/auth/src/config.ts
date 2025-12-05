export const AUTH_CONFIG = {
  SESSION: {
    DURATION: 60 * 60 * 24 * 7,
    UPDATE_AGE: 60 * 60 * 24,
    CACHE_AGE: 60 * 5,
  },

  COOKIE: {
    PREFIX: "rogue",
    NAMES: {
      SESSION: "rogue.session_token",
      CSRF: "rogue.csrf_token",
    },
  },

  URLS: {
    SERVER: process.env.SERVER_URL ?? "http://localhost:3002",
    CLIENT: process.env.CLIENT_URL ?? "http://localhost:3000",
    BASE_PATH: "/api/auth",
  },

  SECURITY: {
    USE_SECURE_COOKIES: process.env.NODE_ENV === "production",
    ENABLE_CROSS_SUBDOMAIN: true,
  },

  PASSWORD: {
    MIN_LENGTH: 8,
    MAX_LENGTH: 128,
  },

  RATE_LIMIT: {
    GLOBAL: { WINDOW: 60, MAX: 100 },
    SIGN_IN: { WINDOW: 60, MAX: 5 },
    SIGN_UP: { WINDOW: 60, MAX: 3 },
    RESET_PASSWORD: { WINDOW: 300, MAX: 3 },
  },

  ROUTES: {
    PROTECTED: ["/dashboard", "/game"],
    AUTH_PAGES: ["/sign-in", "/sign-up"],
    DEFAULT_REDIRECT: "/",
    SIGN_IN_PAGE: "/sign-in",
  },
} as const;

export type AuthConfig = typeof AUTH_CONFIG;
