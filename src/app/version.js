/* global __APP_VERSION__, __BUILD_TIME__ */
export const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
export const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';
export const REPO = 'jodaaisupport-commits/gatebreaker';
export const LIVE_URL = 'https://gatebreaker.onrender.com/';
