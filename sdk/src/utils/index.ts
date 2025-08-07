/**
 * 工具函数库
 */

// UUID生成器
export function generateId(): string {
  return 'xxxx-xxxx-4xxx-yxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 会话ID生成器 (基于时间戳和随机数)
export function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// 获取当前时间戳
export function now(): number {
  return Date.now();
}

// 高精度时间戳
export function performanceNow(): number {
  return performance?.now?.() || Date.now();
}

// 防抖函数
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// 节流函数
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// 深度合并对象
export function deepMerge<T extends Record<string, any>>(
  target: T,
  ...sources: Partial<T>[]
): T {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: {} });
        deepMerge(target[key], source[key]);
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    }
  }

  return deepMerge(target, ...sources);
}

// 判断是否为对象
export function isObject(item: any): item is Record<string, any> {
  return item && typeof item === 'object' && !Array.isArray(item);
}

// 获取元素的CSS选择器路径
export function getElementPath(element: Element): string {
  if (!element) return '';
  
  const path: string[] = [];
  let current: Element | null = element;
  
  while (current) {
    let selector = current.tagName.toLowerCase();
    
    if (current.id) {
      selector += `#${current.id}`;
      path.unshift(selector);
      break;
    }
    
    if (current.className) {
      const classes = current.className.split(' ').filter(Boolean);
      if (classes.length > 0) {
        selector += `.${classes.join('.')}`;
      }
    }
    
    // 添加nth-child选择器
    const siblings = Array.from(current.parentElement?.children || []);
    const sameTagSiblings = siblings.filter(s => s.tagName === current!.tagName);
    if (sameTagSiblings.length > 1) {
      const index = sameTagSiblings.indexOf(current) + 1;
      selector += `:nth-child(${index})`;
    }
    
    path.unshift(selector);
    current = current.parentElement;
  }
  
  return path.join(' > ');
}

// 获取设备信息
export function getDeviceInfo() {
  const screen = window.screen;
  const navigator = window.navigator;
  
  return {
    screenWidth: screen.width,
    screenHeight: screen.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    pixelRatio: window.devicePixelRatio || 1,
    platform: navigator.platform,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    connection: getConnectionInfo()
  };
}

// 获取网络连接信息
function getConnectionInfo() {
  const connection = (navigator as any).connection || 
                    (navigator as any).mozConnection || 
                    (navigator as any).webkitConnection;
  
  if (!connection) return undefined;
  
  return {
    effectiveType: connection.effectiveType,
    downlink: connection.downlink,
    rtt: connection.rtt
  };
}

// 获取页面可见性状态
export function getVisibilityState(): 'visible' | 'hidden' | 'prerender' {
  return document.visibilityState as 'visible' | 'hidden' | 'prerender';
}

// 判断是否在iframe中
export function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

// 获取错误堆栈信息
export function parseStackTrace(error: Error): string[] {
  if (!error.stack) return [];
  
  return error.stack
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

// 生成错误指纹 (用于去重)
export function generateErrorFingerprint(error: {
  message: string;
  fileName?: string;
  lineNumber?: number;
  columnNumber?: number;
}): string {
  const { message, fileName, lineNumber, columnNumber } = error;
  const key = `${message}:${fileName}:${lineNumber}:${columnNumber}`;
  return btoa(key).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
}

// 数据压缩 (简单的JSON压缩)
export function compressData(data: any): string {
  const jsonStr = JSON.stringify(data);
  // 简单压缩：移除空格和换行
  return jsonStr.replace(/\s+/g, ' ').trim();
}

// 数据脱敏
export function sanitizeData(data: any, sensitiveKeys: string[] = []): any {
  if (typeof data !== 'object' || data === null) return data;
  
  const defaultSensitiveKeys = [
    'password', 'token', 'apikey', 'secret', 'auth',
    'credit', 'card', 'ssn', 'social', 'phone', 'email'
  ];
  
  const allSensitiveKeys = [...defaultSensitiveKeys, ...sensitiveKeys];
  const sanitized = Array.isArray(data) ? [] : {};
  
  for (const key in data) {
    const lowerKey = key.toLowerCase();
    const isSensitive = allSensitiveKeys.some(sensitive => 
      lowerKey.includes(sensitive)
    );
    
    if (isSensitive) {
      sanitized[key] = '***MASKED***';
    } else if (typeof data[key] === 'object') {
      sanitized[key] = sanitizeData(data[key], sensitiveKeys);
    } else {
      sanitized[key] = data[key];
    }
  }
  
  return sanitized;
}

// 安全的JSON解析
export function safeJsonParse<T = any>(str: string, defaultValue: T): T {
  try {
    return JSON.parse(str);
  } catch {
    return defaultValue;
  }
}

// 安全的JSON字符串化
export function safeJsonStringify(obj: any): string {
  try {
    return JSON.stringify(obj);
  } catch {
    return '{}';
  }
}

// 检查是否为有效的URL
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// 获取相对URL
export function getRelativeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname + urlObj.search + urlObj.hash;
  } catch {
    return url;
  }
}

// 截断字符串
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

// 异步重试函数
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
      }
    }
  }
  
  throw lastError!;
}

// 检查浏览器特性支持
export const browserSupport = {
  performance: typeof performance !== 'undefined',
  observer: typeof PerformanceObserver !== 'undefined',
  intersectionObserver: typeof IntersectionObserver !== 'undefined',
  mutationObserver: typeof MutationObserver !== 'undefined',
  fetch: typeof fetch !== 'undefined',
  localStorage: (() => {
    try {
      const test = '__test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  })(),
  sessionStorage: (() => {
    try {
      const test = '__test__';
      sessionStorage.setItem(test, test);
      sessionStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  })()
};

// 日志工具
export class Logger {
  private static instance: Logger;
  private enabled: boolean = false;
  private prefix: string = '[Monitor SDK]';
  
  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }
  
  enable(enabled: boolean = true): void {
    this.enabled = enabled;
  }
  
  debug(...args: any[]): void {
    if (this.enabled) {
      console.debug(this.prefix, ...args);
    }
  }
  
  info(...args: any[]): void {
    if (this.enabled) {
      console.info(this.prefix, ...args);
    }
  }
  
  warn(...args: any[]): void {
    if (this.enabled) {
      console.warn(this.prefix, ...args);
    }
  }
  
  error(...args: any[]): void {
    if (this.enabled) {
      console.error(this.prefix, ...args);
    }
  }
}

export const logger = Logger.getInstance();