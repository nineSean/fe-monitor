/**
 * Jest测试环境设置
 */

// 模拟浏览器API
Object.defineProperty(window, 'performance', {
  value: {
    now: jest.fn(() => Date.now()),
    mark: jest.fn(),
    measure: jest.fn(),
    getEntriesByType: jest.fn(() => []),
    getEntriesByName: jest.fn(() => [])
  },
  writable: true
});

Object.defineProperty(window, 'PerformanceObserver', {
  value: class MockPerformanceObserver {
    constructor(private callback: Function) {}
    observe() {}
    disconnect() {}
  },
  writable: true
});

Object.defineProperty(window, 'MutationObserver', {
  value: class MockMutationObserver {
    constructor(private callback: Function) {}
    observe() {}
    disconnect() {}
  },
  writable: true
});

Object.defineProperty(window, 'IntersectionObserver', {
  value: class MockIntersectionObserver {
    constructor(private callback: Function) {}
    observe() {}
    disconnect() {}
  },
  writable: true
});

// 模拟navigator
Object.defineProperty(window, 'navigator', {
  value: {
    userAgent: 'Mozilla/5.0 (Test Environment)',
    language: 'en-US',
    platform: 'Test',
    sendBeacon: jest.fn(() => true)
  },
  writable: true
});

// 模拟localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true
});

// 模拟sessionStorage
Object.defineProperty(window, 'sessionStorage', {
  value: localStorageMock,
  writable: true
});

// 模拟fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
  })
) as jest.Mock;

// 模拟console方法以避免测试输出干扰
const originalConsole = global.console;
global.console = {
  ...originalConsole,
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// 清理函数
afterEach(() => {
  jest.clearAllMocks();
});