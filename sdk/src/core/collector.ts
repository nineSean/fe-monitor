/**
 * 数据收集器核心模块
 */

import { MonitorEvent, SDKConfig, Collector } from '../types';
import { EventQueue, HTTPTransport, BeaconTransport } from './transport';
import { StorageFactory } from './storage';
import { PerformanceCollector } from '../modules/performance';
import { ErrorCollector, NetworkErrorCollector } from '../modules/error';
import { BehaviorCollector } from '../modules/behavior';
import { SessionReplayCollector } from '../modules/replay';
import { logger, debounce, throttle } from '../utils';

export class DataCollector {
  private config: SDKConfig;
  private queue: EventQueue;
  private transport: HTTPTransport;
  private beaconTransport: BeaconTransport;
  private collectors: Map<string, Collector> = new Map();
  private flushTimer?: NodeJS.Timeout;
  private isStarted = false;
  private networkErrorCollector?: NetworkErrorCollector;

  // 防抖和节流函数
  private debouncedFlush: () => void;
  private throttledFlush: () => void;

  constructor(config: SDKConfig) {
    this.config = config;
    this.queue = new EventQueue(1000);
    
    // 创建存储
    const storage = StorageFactory.create('local', `monitor_${config.appId}`);
    
    // 创建传输器
    this.transport = new HTTPTransport({
      endpoint: config.endpoint,
      apiKey: config.apiKey,
      timeout: config.reporting?.timeout,
      maxRetries: config.reporting?.maxRetries,
      batchSize: config.reporting?.batchSize,
      flushInterval: config.reporting?.flushInterval
    }, storage);
    
    this.beaconTransport = new BeaconTransport({
      endpoint: config.endpoint,
      apiKey: config.apiKey
    });

    // 创建防抖和节流函数
    this.debouncedFlush = debounce(() => this.flush(), 1000);
    this.throttledFlush = throttle(() => this.flush(), 5000);
    
    this.setupCollectors();
    this.setupEventListeners();
  }

  start(): void {
    if (this.isStarted) return;
    
    this.isStarted = true;
    logger.debug('Data collector started');
    
    // 启动所有收集器
    this.collectors.forEach(collector => {
      if (collector.isRunning && !collector.isRunning()) {
        collector.start();
      }
    });
    
    // 启动网络错误收集器
    if (this.networkErrorCollector) {
      this.networkErrorCollector.start();
    }
    
    // 设置定时刷新
    this.scheduleFlush();
    
    // 重试发送失败的事件
    this.transport.retryFailedEvents().catch(error => {
      logger.warn('Failed to retry failed events:', error);
    });
  }

  stop(): void {
    if (!this.isStarted) return;
    
    this.isStarted = false;
    logger.debug('Data collector stopped');
    
    // 停止所有收集器
    this.collectors.forEach(collector => {
      if (collector.isRunning && collector.isRunning()) {
        collector.stop();
      }
    });
    
    // 停止网络错误收集器
    if (this.networkErrorCollector) {
      this.networkErrorCollector.stop();
    }
    
    // 清除定时器
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    
    // 最后一次刷新
    this.flush();
  }

  // 手动添加事件
  addEvent(event: MonitorEvent): void {
    if (!this.isStarted) return;
    
    // 检查采样率
    if (!this.shouldSample(event.type)) {
      return;
    }
    
    this.queue.enqueue(event);
    logger.debug(`Event added to queue: ${event.type}`, event);
    
    // 根据事件类型决定刷新策略
    if (event.type === 'error') {
      // 错误事件立即发送
      this.debouncedFlush();
    } else {
      // 其他事件使用节流
      this.throttledFlush();
    }
  }

  // 手动刷新队列
  async flush(): Promise<void> {
    const events = this.queue.drain();
    if (events.length === 0) return;
    
    logger.debug(`Flushing ${events.length} events`);
    
    try {
      await this.transport.send(events);
    } catch (error) {
      logger.error('Failed to flush events:', error);
      // 将事件重新加入队列
      events.forEach(event => this.queue.enqueue(event));
    }
  }

  // 使用Beacon发送（页面卸载时）
  async sendBeacon(): Promise<void> {
    const events = this.queue.drain();
    if (events.length === 0) return;
    
    try {
      await this.beaconTransport.send(events);
      logger.debug(`Sent ${events.length} events via Beacon`);
    } catch (error) {
      logger.error('Failed to send events via Beacon:', error);
    }
  }

  // 获取队列状态
  getQueueStatus(): { size: number; events: MonitorEvent[] } {
    return {
      size: this.queue.size(),
      events: this.queue.toArray()
    };
  }

  private setupCollectors(): void {
    const { features = {} } = this.config;
    
    // 性能监控收集器
    if (features.performance !== false) {
      const performanceCollector = new PerformanceCollector(
        this.config.appId,
        this.getSessionId(),
        this.getUserId()
      );
      this.collectors.set('performance', performanceCollector);
    }
    
    // 错误追踪收集器
    if (features.errors !== false) {
      const errorCollector = new ErrorCollector(
        this.config.appId,
        this.getSessionId(),
        this.getUserId()
      );
      this.collectors.set('error', errorCollector);
      
      // 网络错误收集器
      this.networkErrorCollector = new NetworkErrorCollector(errorCollector);
    }
    
    // 行为追踪收集器
    if (features.behavior !== false) {
      const behaviorCollector = new BehaviorCollector(
        this.config.appId,
        this.getSessionId(),
        this.getUserId(),
        {
          trackClicks: true,
          trackScrolls: true,
          trackInputs: true,
          trackNavigation: true,
          trackFocus: true,
          trackMouseMove: false, // 默认关闭，性能考虑
          scrollThrottle: 250,
          inputDebounce: 500,
          mouseMoveThrottle: 100,
          maskSensitiveInputs: this.config.privacy?.maskSensitiveData ?? true
        }
      );
      this.collectors.set('behavior', behaviorCollector);
    }
    
    // 会话重放收集器
    if (features.replay === true) {
      const replayCollector = new SessionReplayCollector(
        this.config.appId,
        this.getSessionId(),
        this.getUserId(),
        {
          recordScrolls: true,
          recordMouseMove: false, // 默认关闭，减少数据量
          recordInputs: true,
          recordClicks: true,
          recordViewportChanges: true,
          maskSensitiveElements: this.config.privacy?.maskSensitiveData ?? true,
          scrollThrottle: 100,
          mouseMoveThrottle: 50,
          resizeThrottle: 250,
          maxRecordTime: 60000, // 60秒
          maxRecordsPerSession: 1000
        }
      );
      this.collectors.set('replay', replayCollector);
    }
  }

  private setupEventListeners(): void {
    // 页面可见性变化
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.flush();
      }
    });
    
    // 页面卸载
    window.addEventListener('beforeunload', () => {
      this.sendBeacon();
    });
    
    // 页面隐藏
    window.addEventListener('pagehide', () => {
      this.sendBeacon();
    });
    
    // 网络状态变化
    window.addEventListener('online', () => {
      logger.debug('Network back online, retrying failed events');
      this.transport.retryFailedEvents();
    });
  }

  private scheduleFlush(): void {
    const interval = this.config.reporting?.flushInterval || 5000;
    
    this.flushTimer = setTimeout(() => {
      if (this.isStarted) {
        this.collectAndFlush();
        this.scheduleFlush(); // 递归调度
      }
    }, interval);
  }

  private async collectAndFlush(): Promise<void> {
    // 从各个收集器收集数据
    for (const [name, collector] of this.collectors) {
      try {
        const events = await collector.collect();
        events.forEach(event => this.queue.enqueue(event));
        
        if (events.length > 0) {
          logger.debug(`Collected ${events.length} events from ${name}`);
        }
      } catch (error) {
        logger.error(`Failed to collect from ${name}:`, error);
      }
    }
    
    // 刷新队列
    if (this.queue.size() > 0) {
      await this.flush();
    }
  }

  private shouldSample(eventType: string): boolean {
    const { sampling = {} } = this.config;
    
    const rate = sampling[eventType as keyof typeof sampling] || 1;
    return Math.random() < rate;
  }

  private getSessionId(): string {
    // 从storage或生成新的session ID
    const storage = StorageFactory.create('session', `monitor_${this.config.appId}`);
    let sessionId = storage.getItem('session_id');
    
    if (!sessionId) {
      sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      storage.setItem('session_id', sessionId);
    }
    
    return sessionId;
  }

  private getUserId(): string | undefined {
    // 从storage获取用户ID
    const storage = StorageFactory.create('local', `monitor_${this.config.appId}`);
    return storage.getItem('user_id') || undefined;
  }

  // 设置用户ID
  setUserId(userId: string): void {
    const storage = StorageFactory.create('local', `monitor_${this.config.appId}`);
    storage.setItem('user_id', userId);
  }

  // 清除用户ID
  clearUserId(): void {
    const storage = StorageFactory.create('local', `monitor_${this.config.appId}`);
    storage.removeItem('user_id');
  }

  // 获取特定收集器
  getCollector(name: string): Collector | undefined {
    return this.collectors.get(name);
  }

  // 获取性能收集器
  getPerformanceCollector(): PerformanceCollector | undefined {
    return this.collectors.get('performance') as PerformanceCollector;
  }

  // 获取错误收集器
  getErrorCollector(): ErrorCollector | undefined {
    return this.collectors.get('error') as ErrorCollector;
  }

  // 获取行为收集器
  getBehaviorCollector(): BehaviorCollector | undefined {
    return this.collectors.get('behavior') as BehaviorCollector;
  }

  // 获取会话重放收集器
  getReplayCollector(): SessionReplayCollector | undefined {
    return this.collectors.get('replay') as SessionReplayCollector;
  }

  // 手动追踪自定义事件
  trackCustomEvent(eventName: string, properties?: Record<string, any>): void {
    const behaviorCollector = this.getBehaviorCollector();
    if (behaviorCollector) {
      behaviorCollector.track(eventName, undefined, properties);
    }
  }

  // 开始会话重放
  startReplay(): void {
    const replayCollector = this.getReplayCollector();
    if (replayCollector) {
      replayCollector.startRecording();
    }
  }

  // 停止会话重放
  stopReplay(): void {
    const replayCollector = this.getReplayCollector();
    if (replayCollector) {
      replayCollector.stopRecording();
    }
  }

  // 暂停会话重放
  pauseReplay(): void {
    const replayCollector = this.getReplayCollector();
    if (replayCollector) {
      replayCollector.pauseRecording();
    }
  }

  // 恢复会话重放
  resumeReplay(): void {
    const replayCollector = this.getReplayCollector();
    if (replayCollector) {
      replayCollector.resumeRecording();
    }
  }

  // 性能标记
  performanceMark(name: string): void {
    const performanceCollector = this.getPerformanceCollector();
    if (performanceCollector) {
      performanceCollector.mark(name);
    }
  }

  // 性能测量
  performanceMeasure(name: string, startMark?: string, endMark?: string): number | undefined {
    const performanceCollector = this.getPerformanceCollector();
    if (performanceCollector) {
      return performanceCollector.measure(name, startMark, endMark);
    }
    return undefined;
  }

  // 手动捕获错误
  captureException(error: Error, context?: Record<string, any>, severity?: string): void {
    const errorCollector = this.getErrorCollector();
    if (errorCollector) {
      errorCollector.captureException(error, context, severity);
    }
  }

  // 手动捕获消息
  captureMessage(message: string, severity?: string, context?: Record<string, any>): void {
    const errorCollector = this.getErrorCollector();
    if (errorCollector) {
      errorCollector.captureMessage(message, severity, context);
    }
  }
}

// 采样策略管理器
export class SamplingManager {
  private static instance: SamplingManager;
  private strategies = new Map<string, (event: MonitorEvent) => boolean>();

  static getInstance(): SamplingManager {
    if (!SamplingManager.instance) {
      SamplingManager.instance = new SamplingManager();
    }
    return SamplingManager.instance;
  }

  // 注册采样策略
  registerStrategy(eventType: string, strategy: (event: MonitorEvent) => boolean): void {
    this.strategies.set(eventType, strategy);
  }

  // 检查是否应该采样
  shouldSample(event: MonitorEvent): boolean {
    const strategy = this.strategies.get(event.type);
    return strategy ? strategy(event) : true;
  }

  // 预定义策略
  static createRateStrategy(rate: number) {
    return () => Math.random() < rate;
  }

  static createErrorSeverityStrategy() {
    return (event: MonitorEvent) => {
      if (event.type === 'error') {
        const errorEvent = event as any;
        // 高严重性错误总是采样
        return errorEvent.severity === 'high' || errorEvent.severity === 'critical' || Math.random() < 0.5;
      }
      return true;
    };
  }

  static createPerformanceThresholdStrategy(threshold: number) {
    return (event: MonitorEvent) => {
      if (event.type === 'performance') {
        const perfEvent = event as any;
        // 慢性能总是采样
        return perfEvent.metrics?.pageLoadTime > threshold || Math.random() < 0.1;
      }
      return true;
    };
  }
}