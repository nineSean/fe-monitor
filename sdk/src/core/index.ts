/**
 * SDK核心入口文件
 */

import { SDKConfig, Plugin, EventHandler } from '../types';
import { DataCollector } from './collector';
import { logger, generateSessionId, deepMerge } from '../utils';

export class MonitorSDK {
  private static instance: MonitorSDK | null = null;
  private config: SDKConfig;
  private collector: DataCollector;
  private plugins: Map<string, Plugin> = new Map();
  private eventHandlers: Map<string, EventHandler[]> = new Map();
  private isInitialized = false;

  constructor(config: SDKConfig) {
    this.config = this.validateAndMergeConfig(config);
    this.collector = new DataCollector(this.config);
    
    // 启用调试模式
    if (this.config.debug) {
      logger.enable(true);
    }
    
    logger.debug('MonitorSDK initialized with config:', this.config);
  }

  // 单例模式
  static getInstance(config?: SDKConfig): MonitorSDK {
    if (!MonitorSDK.instance) {
      if (!config) {
        throw new Error('Config is required for first initialization');
      }
      MonitorSDK.instance = new MonitorSDK(config);
    }
    return MonitorSDK.instance;
  }

  // 初始化SDK
  static init(config: SDKConfig): MonitorSDK {
    const sdk = MonitorSDK.getInstance(config);
    sdk.start();
    return sdk;
  }

  // 启动SDK
  start(): void {
    if (this.isInitialized) {
      logger.warn('SDK already initialized');
      return;
    }

    this.isInitialized = true;
    
    try {
      this.collector.start();
      
      // 触发启动事件
      this.emit('start', {
        timestamp: Date.now(),
        config: this.config
      });
      
      logger.info('MonitorSDK started successfully');
    } catch (error) {
      logger.error('Failed to start MonitorSDK:', error);
      throw error;
    }
  }

  // 停止SDK
  stop(): void {
    if (!this.isInitialized) return;

    this.isInitialized = false;
    
    try {
      this.collector.stop();
      
      // 触发停止事件
      this.emit('stop', {
        timestamp: Date.now()
      });
      
      logger.info('MonitorSDK stopped');
    } catch (error) {
      logger.error('Failed to stop MonitorSDK:', error);
    }
  }

  // 手动追踪事件
  track(eventName: string, properties?: Record<string, any>): void {
    if (!this.isInitialized) {
      logger.warn('SDK not initialized, ignoring track call');
      return;
    }

    // 使用行为收集器的track方法
    this.collector.trackCustomEvent(eventName, properties);
    
    this.emit('track', {
      eventName,
      properties,
      timestamp: Date.now()
    });
  }

  // 设置用户ID
  setUser(userId: string, userProperties?: Record<string, any>): void {
    this.collector.setUserId(userId);
    
    if (userProperties) {
      this.track('user_identify', {
        userId,
        ...userProperties
      });
    }
    
    logger.debug('User ID set:', userId);
  }

  // 清除用户ID
  clearUser(): void {
    this.collector.clearUserId();
    logger.debug('User ID cleared');
  }

  // 手动捕获错误
  captureException(error: Error, context?: Record<string, any>, severity?: string): void {
    if (!this.isInitialized) return;
    this.collector.captureException(error, context, severity);
  }

  // 手动捕获消息
  captureMessage(message: string, level: string = 'info', context?: Record<string, any>): void {
    if (!this.isInitialized) return;
    this.collector.captureMessage(message, level, context);
  }

  // 性能标记
  mark(name: string): void {
    if (!this.isInitialized) return;
    this.collector.performanceMark(name);
  }

  // 性能测量
  measure(name: string, startMark?: string, endMark?: string): number | undefined {
    if (!this.isInitialized) return undefined;
    return this.collector.performanceMeasure(name, startMark, endMark);
  }

  // 开始会话重放
  startReplay(): void {
    if (!this.isInitialized) return;
    this.collector.startReplay();
  }

  // 停止会话重放
  stopReplay(): void {
    if (!this.isInitialized) return;
    this.collector.stopReplay();
  }

  // 暂停会话重放
  pauseReplay(): void {
    if (!this.isInitialized) return;
    this.collector.pauseReplay();
  }

  // 恢复会话重放
  resumeReplay(): void {
    if (!this.isInitialized) return;
    this.collector.resumeReplay();
  }

  // 手动刷新数据
  async flush(): Promise<void> {
    if (!this.isInitialized) return;

    await this.collector.flush();
  }

  // 获取SDK状态
  getStatus(): {
    initialized: boolean;
    config: SDKConfig;
    queueSize: number;
    sessionId: string;
    userId?: string;
  } {
    return {
      initialized: this.isInitialized,
      config: this.config,
      queueSize: this.collector.getQueueStatus().size,
      sessionId: this.getSessionId(),
      userId: this.getUserId()
    };
  }

  // 安装插件
  use(plugin: Plugin): void {
    if (this.plugins.has(plugin.name)) {
      logger.warn(`Plugin ${plugin.name} already installed`);
      return;
    }

    try {
      plugin.install(this);
      this.plugins.set(plugin.name, plugin);
      logger.debug(`Plugin ${plugin.name} installed`);
    } catch (error) {
      logger.error(`Failed to install plugin ${plugin.name}:`, error);
    }
  }

  // 卸载插件
  unuse(pluginName: string): void {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      logger.warn(`Plugin ${pluginName} not found`);
      return;
    }

    try {
      if (plugin.uninstall) {
        plugin.uninstall();
      }
      this.plugins.delete(pluginName);
      logger.debug(`Plugin ${pluginName} uninstalled`);
    } catch (error) {
      logger.error(`Failed to uninstall plugin ${pluginName}:`, error);
    }
  }

  // 事件监听
  on(eventName: string, handler: EventHandler): void {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, []);
    }
    this.eventHandlers.get(eventName)!.push(handler);
  }

  // 移除事件监听
  off(eventName: string, handler?: EventHandler): void {
    if (!this.eventHandlers.has(eventName)) return;

    if (handler) {
      const handlers = this.eventHandlers.get(eventName)!;
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    } else {
      this.eventHandlers.delete(eventName);
    }
  }

  // 触发事件
  private emit(eventName: string, data: any): void {
    const handlers = this.eventHandlers.get(eventName) || [];
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        logger.error(`Error in event handler for ${eventName}:`, error);
      }
    });
  }

  // 获取会话ID
  private getSessionId(): string {
    return this.collector['getSessionId']?.() || generateSessionId();
  }

  // 获取用户ID
  private getUserId(): string | undefined {
    return this.collector['getUserId']?.();
  }

  // 验证和合并配置
  private validateAndMergeConfig(config: SDKConfig): SDKConfig {
    if (!config.appId) {
      throw new Error('appId is required');
    }
    
    if (!config.apiKey) {
      throw new Error('apiKey is required');
    }
    
    if (!config.endpoint) {
      throw new Error('endpoint is required');
    }

    const defaultConfig: Partial<SDKConfig> = {
      features: {
        performance: true,
        errors: true,
        behavior: true,
        replay: false
      },
      sampling: {
        performance: 1,
        errors: 1,
        behavior: 0.1,
        replay: 0.01
      },
      reporting: {
        batchSize: 50,
        flushInterval: 5000,
        maxRetries: 3,
        timeout: 10000
      },
      privacy: {
        maskSensitiveData: true,
        allowedDomains: [],
        blockedElements: []
      },
      debug: false,
      environment: 'production'
    };

    return deepMerge(defaultConfig, config) as SDKConfig;
  }
}

// 导出便捷方法
export const Monitor = {
  init: (config: SDKConfig) => MonitorSDK.init(config),
  getInstance: () => MonitorSDK.getInstance(),
  
  // 快捷方法
  track: (eventName: string, properties?: Record<string, any>) => {
    MonitorSDK.getInstance().track(eventName, properties);
  },
  
  setUser: (userId: string, userProperties?: Record<string, any>) => {
    MonitorSDK.getInstance().setUser(userId, userProperties);
  },
  
  clearUser: () => {
    MonitorSDK.getInstance().clearUser();
  },
  
  captureException: (error: Error, context?: Record<string, any>, severity?: string) => {
    MonitorSDK.getInstance().captureException(error, context, severity);
  },
  
  captureMessage: (message: string, level?: string, context?: Record<string, any>) => {
    MonitorSDK.getInstance().captureMessage(message, level, context);
  },
  
  mark: (name: string) => {
    MonitorSDK.getInstance().mark(name);
  },
  
  measure: (name: string, startMark?: string, endMark?: string) => {
    MonitorSDK.getInstance().measure(name, startMark, endMark);
  },
  
  startReplay: () => {
    MonitorSDK.getInstance().startReplay();
  },
  
  stopReplay: () => {
    MonitorSDK.getInstance().stopReplay();
  },
  
  pauseReplay: () => {
    MonitorSDK.getInstance().pauseReplay();
  },
  
  resumeReplay: () => {
    MonitorSDK.getInstance().resumeReplay();
  },
  
  flush: async () => {
    await MonitorSDK.getInstance().flush();
  },
  
  getStatus: () => {
    return MonitorSDK.getInstance().getStatus();
  }
};

// 全局错误处理
if (typeof window !== 'undefined') {
  // 确保在页面卸载时发送数据
  window.addEventListener('beforeunload', () => {
    try {
      MonitorSDK.getInstance().flush();
    } catch (error) {
      // 忽略错误，防止阻塞页面卸载
    }
  });
}