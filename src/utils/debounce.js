/**
 * Debounce and throttle utilities for performance optimization
 * @module utils/debounce
 */

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * @param {Function} func - The function to debounce
 * @param {number} wait - Milliseconds to delay
 * @param {boolean} immediate - Trigger on leading edge instead of trailing
 * @returns {Function} Debounced function
 */
function debounce(func, wait, immediate = false) {
  let timeout;
  
  return function executedFunction(...args) {
    const context = this;
    
    const later = () => {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    
    const callNow = immediate && !timeout;
    
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    
    if (callNow) func.apply(context, args);
  };
}

/**
 * Creates a throttled function that only invokes func at most once per every wait milliseconds
 * @param {Function} func - The function to throttle
 * @param {number} limit - Milliseconds between invocations
 * @returns {Function} Throttled function
 */
function throttle(func, limit) {
  let inThrottle;
  let lastResult;
  
  return function(...args) {
    const context = this;
    
    if (!inThrottle) {
      lastResult = func.apply(context, args);
      inThrottle = true;
      
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
    
    return lastResult;
  };
}

/**
 * Creates a function that will cache results
 * @param {Function} func - Function to memoize
 * @param {Function} resolver - Function to resolve cache key
 * @returns {Function} Memoized function
 */
function memoize(func, resolver) {
  const cache = new Map();
  
  return function(...args) {
    const key = resolver ? resolver(...args) : JSON.stringify(args);
    
    if (cache.has(key)) {
      return cache.get(key);
    }
    
    const result = func.apply(this, args);
    cache.set(key, result);
    
    return result;
  };
}

/**
 * Rate limiter that ensures function is not called more than N times per period
 * @param {Function} func - Function to rate limit
 * @param {number} maxCalls - Maximum number of calls
 * @param {number} period - Period in milliseconds
 * @returns {Function} Rate limited function
 */
function rateLimit(func, maxCalls, period) {
  const calls = [];
  
  return function(...args) {
    const now = Date.now();
    
    // Remove calls outside the current period
    while (calls.length > 0 && calls[0] < now - period) {
      calls.shift();
    }
    
    if (calls.length < maxCalls) {
      calls.push(now);
      return func.apply(this, args);
    }
    
    throw new Error(`Rate limit exceeded: ${maxCalls} calls per ${period}ms`);
  };
}

module.exports = {
  debounce,
  throttle,
  memoize,
  rateLimit
};
