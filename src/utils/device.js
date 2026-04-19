/**
 * Device detection utilities
 */

/**
 * Get device information
 */
export function getDeviceInfo() {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    languages: navigator.languages,
    cookieEnabled: navigator.cookieEnabled,
    onLine: navigator.onLine,
    doNotTrack: navigator.doNotTrack,
    touchSupport: hasTouchSupport(),
    maxTouchPoints: navigator.maxTouchPoints || 0,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    screenColorDepth: window.screen.colorDepth,
    devicePixelRatio: window.devicePixelRatio
  };
}

/**
 * Check if device supports touch
 */
export function hasTouchSupport() {
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    navigator.msMaxTouchPoints > 0
  );
}

/**
 * Check if device is mobile
 */
export function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

/**
 * Check if device is iOS
 */
export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

/**
 * Check if device supports vibration API
 */
export function hasVibrationSupport() {
  return 'vibrate' in navigator;
}

/**
 * Check if device supports device orientation
 */
export function hasOrientationSupport() {
  return 'DeviceOrientationEvent' in window;
}

/**
 * Check if browser supports WebSocket
 */
export function hasWebSocketSupport() {
  return 'WebSocket' in window;
}

/**
 * Get connection info if available
 */
export function getConnectionInfo() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

  if (connection) {
    return {
      effectiveType: connection.effectiveType,
      downlink: connection.downlink,
      rtt: connection.rtt,
      saveData: connection.saveData
    };
  }

  return null;
}
