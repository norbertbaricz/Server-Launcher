/**
 * UI Performance optimizations for script.js
 * @module renderer/performance
 */

/**
 * Debounce function to limit execution rate
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function to limit execution frequency
 */
function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Request animation frame wrapper for smooth UI updates
 */
function rafThrottle(callback) {
  let requestId = null;
  let lastArgs = null;

  const later = () => {
    requestId = null;
    callback.apply(null, lastArgs);
  };

  return function(...args) {
    lastArgs = args;
    if (requestId === null) {
      requestId = requestAnimationFrame(later);
    }
  };
}

/**
 * Virtual scrolling for large console output
 */
class VirtualConsole {
  constructor(container, maxItems = 1000) {
    this.container = container;
    this.maxItems = maxItems;
    this.items = [];
  }

  addItem(html) {
    this.items.push(html);
    
    // Remove oldest items if exceeding max
    if (this.items.length > this.maxItems) {
      this.items.shift();
    }

    this.render();
  }

  render() {
    // Use DocumentFragment for better performance
    const fragment = document.createDocumentFragment();
    
    // Only render visible items (optimization for large lists)
    const visibleItems = this.items.slice(-100);
    
    visibleItems.forEach(itemHtml => {
      const div = document.createElement('div');
      div.className = 'console-message';
      div.innerHTML = itemHtml;
      fragment.appendChild(div);
    });

    // Clear and append in one operation
    requestAnimationFrame(() => {
      this.container.innerHTML = '';
      this.container.appendChild(fragment);
      this.container.scrollTop = this.container.scrollHeight;
    });
  }

  clear() {
    this.items = [];
    this.container.innerHTML = '';
  }
}

/**
 * Event listener manager for cleanup
 */
class EventListenerManager {
  constructor() {
    this.listeners = new Map();
  }

  add(element, event, handler, options) {
    const key = `${element.id || element.className}-${event}`;
    
    // Remove existing listener if present
    this.remove(key);
    
    element.addEventListener(event, handler, options);
    this.listeners.set(key, { element, event, handler, options });
  }

  remove(key) {
    const listener = this.listeners.get(key);
    if (listener) {
      listener.element.removeEventListener(listener.event, listener.handler, listener.options);
      this.listeners.delete(key);
    }
  }

  removeAll() {
    for (const [key] of this.listeners) {
      this.remove(key);
    }
  }
}

/**
 * Optimized DOM updates using batch processing
 */
class DOMBatcher {
  constructor() {
    this.updates = [];
    this.scheduled = false;
  }

  schedule(updateFn) {
    this.updates.push(updateFn);
    
    if (!this.scheduled) {
      this.scheduled = true;
      requestAnimationFrame(() => this.flush());
    }
  }

  flush() {
    const updates = this.updates.slice();
    this.updates = [];
    this.scheduled = false;

    for (const update of updates) {
      try {
        update();
      } catch (error) {
        // DOM update errors are non-critical, fail silently
      }
    }
  }
}

/**
 * Memory-efficient cache with size limit
 */
class LRUCache {
  constructor(maxSize = 50) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) {
      return undefined;
    }
    
    // Move to end (most recent)
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    
    return value;
  }

  set(key, value) {
    // Delete if exists (will re-add at end)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, value);
  }

  clear() {
    this.cache.clear();
  }
}

// Export utilities
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    debounce,
    throttle,
    rafThrottle,
    VirtualConsole,
    EventListenerManager,
    DOMBatcher,
    LRUCache
  };
}
