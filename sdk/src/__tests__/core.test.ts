/**
 * SDK核心功能测试
 */

import { MonitorSDK, Monitor } from '../core';
import { SDKConfig } from '../types';

describe('MonitorSDK', () => {
  const mockConfig: SDKConfig = {
    appId: 'test-app',
    apiKey: 'test-key',
    endpoint: 'https://api.test.com/collect',
    debug: true
  };

  beforeEach(() => {
    // 重置单例
    (MonitorSDK as any).instance = null;
  });

  describe('initialization', () => {
    it('should create SDK instance with valid config', () => {
      const sdk = new MonitorSDK(mockConfig);
      expect(sdk).toBeInstanceOf(MonitorSDK);
    });

    it('should throw error with invalid config', () => {
      expect(() => new MonitorSDK({} as SDKConfig)).toThrow('appId is required');
    });

    it('should use singleton pattern', () => {
      const sdk1 = MonitorSDK.getInstance(mockConfig);
      const sdk2 = MonitorSDK.getInstance();
      expect(sdk1).toBe(sdk2);
    });

    it('should initialize with Monitor.init', () => {
      const sdk = Monitor.init(mockConfig);
      expect(sdk).toBeInstanceOf(MonitorSDK);
    });
  });

  describe('lifecycle', () => {
    let sdk: MonitorSDK;

    beforeEach(() => {
      sdk = new MonitorSDK(mockConfig);
    });

    it('should start and stop correctly', () => {
      sdk.start();
      expect(sdk.getStatus().initialized).toBe(true);

      sdk.stop();
      expect(sdk.getStatus().initialized).toBe(false);
    });

    it('should not start twice', () => {
      sdk.start();
      const consoleSpy = jest.spyOn(console, 'warn');
      sdk.start();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('already initialized')
      );
    });
  });

  describe('event tracking', () => {
    let sdk: MonitorSDK;

    beforeEach(() => {
      sdk = new MonitorSDK(mockConfig);
      sdk.start();
    });

    afterEach(() => {
      sdk.stop();
    });

    it('should track custom events', () => {
      const eventHandler = jest.fn();
      sdk.on('track', eventHandler);

      sdk.track('test_event', { prop: 'value' });

      expect(eventHandler).toHaveBeenCalled();
      const event = eventHandler.mock.calls[0][0];
      expect(event.eventName).toBe('test_event');
      expect(event.properties).toEqual({ prop: 'value' });
    });

    it('should set and clear user', () => {
      sdk.setUser('user-123', { email: 'test@example.com' });
      expect(sdk.getStatus().userId).toBe('user-123');

      sdk.clearUser();
      expect(sdk.getStatus().userId).toBeUndefined();
    });

    it('should capture exceptions', () => {
      const error = new Error('Test error');
      expect(() => sdk.captureException(error, { test: 'context' }, 'high')).not.toThrow();
    });

    it('should capture messages', () => {
      expect(() => sdk.captureMessage('Test message', 'info', { test: 'context' })).not.toThrow();
    });
  });

  describe('performance monitoring', () => {
    let sdk: MonitorSDK;

    beforeEach(() => {
      sdk = new MonitorSDK(mockConfig);
      sdk.start();
    });

    afterEach(() => {
      sdk.stop();
    });

    it('should create performance marks', () => {
      expect(() => sdk.mark('test-mark')).not.toThrow();
    });

    it('should measure performance', () => {
      sdk.mark('start');
      sdk.mark('end');
      const duration = sdk.measure('test-measure', 'start', 'end');
      expect(typeof duration).toBe('number');
    });
  });

  describe('session replay', () => {
    let sdk: MonitorSDK;

    beforeEach(() => {
      sdk = new MonitorSDK({
        ...mockConfig,
        features: { replay: true }
      });
      sdk.start();
    });

    afterEach(() => {
      sdk.stop();
    });

    it('should start and stop replay', () => {
      expect(() => sdk.startReplay()).not.toThrow();
      expect(() => sdk.stopReplay()).not.toThrow();
    });

    it('should pause and resume replay', () => {
      expect(() => sdk.pauseReplay()).not.toThrow();
      expect(() => sdk.resumeReplay()).not.toThrow();
    });
  });

  describe('plugins', () => {
    let sdk: MonitorSDK;

    beforeEach(() => {
      sdk = new MonitorSDK(mockConfig);
    });

    it('should install and uninstall plugins', () => {
      const mockPlugin = {
        name: 'test-plugin',
        version: '1.0.0',
        install: jest.fn(),
        uninstall: jest.fn()
      };

      sdk.use(mockPlugin);
      expect(mockPlugin.install).toHaveBeenCalledWith(sdk);

      sdk.unuse('test-plugin');
      expect(mockPlugin.uninstall).toHaveBeenCalled();
    });

    it('should not install same plugin twice', () => {
      const mockPlugin = {
        name: 'test-plugin',
        version: '1.0.0',
        install: jest.fn()
      };

      sdk.use(mockPlugin);
      const consoleSpy = jest.spyOn(console, 'warn');
      sdk.use(mockPlugin);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('already installed')
      );
    });
  });

  describe('event system', () => {
    let sdk: MonitorSDK;

    beforeEach(() => {
      sdk = new MonitorSDK(mockConfig);
    });

    it('should add and remove event listeners', () => {
      const handler = jest.fn();

      sdk.on('test-event', handler);
      sdk['emit']('test-event', { data: 'test' });
      expect(handler).toHaveBeenCalledWith({ data: 'test' });

      sdk.off('test-event', handler);
      sdk['emit']('test-event', { data: 'test2' });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should remove all listeners for event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      sdk.on('test-event', handler1);
      sdk.on('test-event', handler2);
      sdk.off('test-event');

      sdk['emit']('test-event', { data: 'test' });
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe('config validation', () => {
    it('should merge default config', () => {
      const sdk = new MonitorSDK(mockConfig);
      const status = sdk.getStatus();
      
      expect(status.config.features?.performance).toBe(true);
      expect(status.config.features?.errors).toBe(true);
      expect(status.config.reporting?.batchSize).toBe(50);
    });

    it('should override default config', () => {
      const customConfig: SDKConfig = {
        ...mockConfig,
        features: { performance: false },
        reporting: { batchSize: 100 }
      };

      const sdk = new MonitorSDK(customConfig);
      const status = sdk.getStatus();

      expect(status.config.features?.performance).toBe(false);
      expect(status.config.reporting?.batchSize).toBe(100);
    });
  });

  describe('static methods', () => {
    it('should provide static convenience methods', () => {
      Monitor.init(mockConfig);

      expect(() => Monitor.track('test')).not.toThrow();
      expect(() => Monitor.setUser('user-123')).not.toThrow();
      expect(() => Monitor.clearUser()).not.toThrow();
      expect(() => Monitor.captureException(new Error('test'))).not.toThrow();
      expect(() => Monitor.captureMessage('test message')).not.toThrow();
      expect(() => Monitor.mark('test-mark')).not.toThrow();
      expect(() => Monitor.startReplay()).not.toThrow();
      expect(() => Monitor.stopReplay()).not.toThrow();
      expect(() => Monitor.flush()).not.toThrow();
      expect(Monitor.getStatus()).toBeDefined();
    });
  });
});