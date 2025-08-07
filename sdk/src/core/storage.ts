/**
 * 存储模块
 */

import { Storage } from '../types';
import { logger, browserSupport } from '../utils';

// 内存存储实现
export class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  getItem(key: string): string | null {
    return this.data.get(key) || null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  clear(): void {
    this.data.clear();
  }
}

// LocalStorage存储实现
export class LocalStorage implements Storage {
  private fallback = new MemoryStorage();

  setItem(key: string, value: string): void {
    try {
      if (browserSupport.localStorage) {
        localStorage.setItem(key, value);
      } else {
        this.fallback.setItem(key, value);
      }
    } catch (error) {
      logger.warn('LocalStorage setItem failed:', error);
      this.fallback.setItem(key, value);
    }
  }

  getItem(key: string): string | null {
    try {
      if (browserSupport.localStorage) {
        return localStorage.getItem(key);
      } else {
        return this.fallback.getItem(key);
      }
    } catch (error) {
      logger.warn('LocalStorage getItem failed:', error);
      return this.fallback.getItem(key);
    }
  }

  removeItem(key: string): void {
    try {
      if (browserSupport.localStorage) {
        localStorage.removeItem(key);
      } else {
        this.fallback.removeItem(key);
      }
    } catch (error) {
      logger.warn('LocalStorage removeItem failed:', error);
      this.fallback.removeItem(key);
    }
  }

  clear(): void {
    try {
      if (browserSupport.localStorage) {
        localStorage.clear();
      } else {
        this.fallback.clear();
      }
    } catch (error) {
      logger.warn('LocalStorage clear failed:', error);
      this.fallback.clear();
    }
  }
}

// SessionStorage存储实现
export class SessionStorage implements Storage {
  private fallback = new MemoryStorage();

  setItem(key: string, value: string): void {
    try {
      if (browserSupport.sessionStorage) {
        sessionStorage.setItem(key, value);
      } else {
        this.fallback.setItem(key, value);
      }
    } catch (error) {
      logger.warn('SessionStorage setItem failed:', error);
      this.fallback.setItem(key, value);
    }
  }

  getItem(key: string): string | null {
    try {
      if (browserSupport.sessionStorage) {
        return sessionStorage.getItem(key);
      } else {
        return this.fallback.getItem(key);
      }
    } catch (error) {
      logger.warn('SessionStorage getItem failed:', error);
      return this.fallback.getItem(key);
    }
  }

  removeItem(key: string): void {
    try {
      if (browserSupport.sessionStorage) {
        sessionStorage.removeItem(key);
      } else {
        this.fallback.removeItem(key);
      }
    } catch (error) {
      logger.warn('SessionStorage removeItem failed:', error);
      this.fallback.removeItem(key);
    }
  }

  clear(): void {
    try {
      if (browserSupport.sessionStorage) {
        sessionStorage.clear();
      } else {
        this.fallback.clear();
      }
    } catch (error) {
      logger.warn('SessionStorage clear failed:', error);
      this.fallback.clear();
    }
  }
}

// 带前缀的存储包装器
export class PrefixedStorage implements Storage {
  constructor(
    private storage: Storage,
    private prefix: string
  ) {}

  private getKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  setItem(key: string, value: string): void {
    this.storage.setItem(this.getKey(key), value);
  }

  getItem(key: string): string | null {
    return this.storage.getItem(this.getKey(key));
  }

  removeItem(key: string): void {
    this.storage.removeItem(this.getKey(key));
  }

  clear(): void {
    // 只清除带前缀的项目
    if (this.storage instanceof LocalStorage && browserSupport.localStorage) {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(this.prefix + ':')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } else {
      this.storage.clear();
    }
  }
}

// 存储工厂
export class StorageFactory {
  static create(type: 'memory' | 'local' | 'session', prefix?: string): Storage {
    let storage: Storage;
    
    switch (type) {
      case 'local':
        storage = new LocalStorage();
        break;
      case 'session':
        storage = new SessionStorage();
        break;
      case 'memory':
      default:
        storage = new MemoryStorage();
        break;
    }
    
    if (prefix) {
      storage = new PrefixedStorage(storage, prefix);
    }
    
    return storage;
  }
}