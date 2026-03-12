import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Mock fetch globally
global.fetch = vi.fn();

// Mock IntersectionObserver (used by some video implementations)
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock HTMLVideoElement methods that might not be available in happy-dom
Object.defineProperty(HTMLVideoElement.prototype, 'canPlayType', {
  writable: true,
  value: vi.fn(),
});

// Mock playsInline property
Object.defineProperty(HTMLVideoElement.prototype, 'playsInline', {
  writable: true,
  value: false,
});

// Mock poster property
Object.defineProperty(HTMLVideoElement.prototype, 'poster', {
  get() {
    return this.getAttribute('poster');
  },
  set(value) {
    this.setAttribute('poster', value);
  },
});

// Export expect for convenience
export { expect };
