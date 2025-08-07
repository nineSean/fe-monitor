/**
 * 性能监控模块
 */

import {
  PerformanceEvent,
  PerformanceMetrics,
  ResourceTiming,
  BaseEvent,
  Collector
} from '../types';
import { generateId, now, performanceNow, getDeviceInfo, logger } from '../utils';

export class PerformanceCollector implements Collector {
  private isRunning = false;
  private observer?: PerformanceObserver;
  private navigationTiming?: PerformanceNavigationTiming;
  private paintTiming: Map<string, number> = new Map();
  private webVitals: Map<string, number> = new Map();
  private customMetrics: Map<string, number> = new Map();
  private resourceTimings: ResourceTiming[] = [];

  constructor(
    private appId: string,
    private sessionId: string,
    private userId?: string
  ) {}

  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    logger.debug('Performance collector started');
    
    // 监听导航计时
    this.collectNavigationTiming();
    
    // 监听Paint Timing
    this.collectPaintTiming();
    
    // 监听资源加载
    this.collectResourceTiming();
    
    // 监听Core Web Vitals
    this.collectWebVitals();
    
    // 设置页面卸载时的数据收集
    this.setupPageUnloadCollection();
  }

  stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    this.observer?.disconnect();
    logger.debug('Performance collector stopped');
  }

  isRunning(): boolean {
    return this.isRunning;
  }

  async collect(): Promise<PerformanceEvent[]> {
    const events: PerformanceEvent[] = [];
    
    // 收集页面性能数据
    const pagePerformance = this.collectPagePerformance();
    if (pagePerformance) {
      events.push(pagePerformance);
    }
    
    return events;
  }

  // 手动标记性能点
  mark(name: string): void {
    if (performance?.mark) {
      performance.mark(name);
      logger.debug(`Performance mark: ${name}`);
    }
  }

  // 测量性能区间
  measure(name: string, startMark?: string, endMark?: string): number | undefined {
    if (!performance?.measure) return undefined;
    
    try {
      performance.measure(name, startMark, endMark);
      const measure = performance.getEntriesByName(name, 'measure')[0];
      const duration = measure?.duration || 0;
      
      this.customMetrics.set(name, duration);
      logger.debug(`Performance measure: ${name} = ${duration}ms`);
      
      return duration;
    } catch (error) {
      logger.warn('Failed to measure performance:', error);
      return undefined;
    }
  }

  // 收集导航计时
  private collectNavigationTiming(): void {
    if (!performance?.getEntriesByType) return;
    
    const navigationEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    if (navigationEntries.length > 0) {
      this.navigationTiming = navigationEntries[0];
    }
  }

  // 收集Paint Timing
  private collectPaintTiming(): void {
    if (!performance?.getEntriesByType) return;
    
    const paintEntries = performance.getEntriesByType('paint');
    paintEntries.forEach(entry => {
      this.paintTiming.set(entry.name, entry.startTime);
    });
    
    // 使用PerformanceObserver监听新的paint事件
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        this.observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'paint') {
              this.paintTiming.set(entry.name, entry.startTime);
            }
          }
        });
        
        this.observer.observe({ entryTypes: ['paint'] });
      } catch (error) {
        logger.warn('Failed to observe paint timing:', error);
      }
    }
  }

  // 收集资源加载时间
  private collectResourceTiming(): void {
    if (!performance?.getEntriesByType) return;
    
    const resourceEntries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    this.resourceTimings = resourceEntries.map(entry => ({
      name: entry.name,
      entryType: entry.entryType,
      startTime: entry.startTime,
      duration: entry.duration,
      transferSize: entry.transferSize || 0,
      encodedBodySize: entry.encodedBodySize || 0,
      decodedBodySize: entry.decodedBodySize || 0
    }));
  }

  // 收集Core Web Vitals
  private collectWebVitals(): void {
    // FCP (First Contentful Paint)
    this.observePerformanceEntry('paint', (entry) => {
      if (entry.name === 'first-contentful-paint') {
        this.webVitals.set('fcp', entry.startTime);
      }
    });

    // LCP (Largest Contentful Paint)
    this.observePerformanceEntry('largest-contentful-paint', (entry) => {
      this.webVitals.set('lcp', entry.startTime);
    });

    // FID (First Input Delay) - 需要在实际交互时测量
    this.observeFirstInputDelay();

    // CLS (Cumulative Layout Shift)
    this.observeLayoutShift();

    // TTFB (Time to First Byte)
    if (this.navigationTiming) {
      const ttfb = this.navigationTiming.responseStart - this.navigationTiming.requestStart;
      this.webVitals.set('ttfb', ttfb);
    }
  }

  // 监听性能条目
  private observePerformanceEntry(entryType: string, callback: (entry: PerformanceEntry) => void): void {
    if (typeof PerformanceObserver === 'undefined') return;
    
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          callback(entry);
        }
      });
      
      observer.observe({ entryTypes: [entryType] });
    } catch (error) {
      logger.warn(`Failed to observe ${entryType}:`, error);
    }
  }

  // 监听首次输入延迟
  private observeFirstInputDelay(): void {
    let firstInput = true;
    
    const inputHandler = (event: Event) => {
      if (!firstInput) return;
      firstInput = false;
      
      const inputTime = event.timeStamp;
      const processingStart = performanceNow();
      
      // 在下一个事件循环中测量处理时间
      setTimeout(() => {
        const processingEnd = performanceNow();
        const inputDelay = processingStart - inputTime;
        const processingTime = processingEnd - processingStart;
        
        this.webVitals.set('fid', inputDelay);
        this.webVitals.set('input_processing_time', processingTime);
        
        // 移除事件监听器
        ['mousedown', 'keydown', 'touchstart', 'pointerdown'].forEach(eventType => {
          document.removeEventListener(eventType, inputHandler, true);
        });
      }, 0);
    };
    
    // 监听各种输入事件
    ['mousedown', 'keydown', 'touchstart', 'pointerdown'].forEach(eventType => {
      document.addEventListener(eventType, inputHandler, { once: true, capture: true });
    });
  }

  // 监听布局偏移
  private observeLayoutShift(): void {
    let clsValue = 0;
    let sessionValue = 0;
    let sessionEntries: PerformanceEntry[] = [];
    
    this.observePerformanceEntry('layout-shift', (entry: any) => {
      // 只记录没有用户输入的布局偏移
      if (!entry.hadRecentInput) {
        const firstSessionEntry = sessionEntries[0];
        const lastSessionEntry = sessionEntries[sessionEntries.length - 1];
        
        // 如果距离上次偏移超过1秒或5秒内偏移超过5秒，开始新会话
        if (sessionValue && 
            (entry.startTime - lastSessionEntry.startTime > 1000 ||
             entry.startTime - firstSessionEntry.startTime > 5000)) {
          clsValue = Math.max(clsValue, sessionValue);
          sessionValue = 0;
          sessionEntries = [];
        }
        
        sessionEntries.push(entry);
        sessionValue += entry.value;
        this.webVitals.set('cls', Math.max(clsValue, sessionValue));
      }
    });
  }

  // 收集页面性能数据
  private collectPagePerformance(): PerformanceEvent | null {
    if (!this.navigationTiming) return null;
    
    const nav = this.navigationTiming;
    const metrics: PerformanceMetrics = {
      // Core Web Vitals
      lcp: this.webVitals.get('lcp'),
      fid: this.webVitals.get('fid'),
      cls: this.webVitals.get('cls'),
      fcp: this.webVitals.get('fcp'),
      ttfb: this.webVitals.get('ttfb'),
      
      // 页面性能指标
      pageLoadTime: nav.loadEventEnd - nav.navigationStart,
      domReadyTime: nav.domContentLoadedEventEnd - nav.navigationStart,
      resourceLoadTime: nav.loadEventEnd - nav.domContentLoadedEventEnd,
      
      // 自定义指标
      customMetrics: Object.fromEntries(this.customMetrics)
    };
    
    const baseEvent: BaseEvent = {
      eventId: generateId(),
      appId: this.appId,
      sessionId: this.sessionId,
      userId: this.userId,
      timestamp: now(),
      pageUrl: window.location.href,
      userAgent: navigator.userAgent,
      deviceInfo: getDeviceInfo()
    };
    
    return {
      ...baseEvent,
      type: 'performance',
      metrics,
      resources: this.resourceTimings.slice() // 创建副本
    };
  }

  // 设置页面卸载时的数据收集
  private setupPageUnloadCollection(): void {
    const collectOnUnload = () => {
      // 在页面卸载时收集最终的性能数据
      this.collectPagePerformance();
    };
    
    // 监听页面卸载事件
    window.addEventListener('beforeunload', collectOnUnload);
    window.addEventListener('pagehide', collectOnUnload);
    
    // 监听页面可见性变化
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        collectOnUnload();
      }
    });
  }
}

// 性能工具类
export class PerformanceUtils {
  // 测量函数执行时间
  static async measureFunction<T>(
    fn: () => Promise<T> | T,
    name: string
  ): Promise<{ result: T; duration: number }> {
    const startTime = performanceNow();
    const result = await fn();
    const endTime = performanceNow();
    const duration = endTime - startTime;
    
    logger.debug(`Function ${name} executed in ${duration}ms`);
    return { result, duration };
  }
  
  // 测量代码块执行时间
  static measureBlock(name: string): { end: () => number } {
    const startTime = performanceNow();
    
    return {
      end: () => {
        const endTime = performanceNow();
        const duration = endTime - startTime;
        logger.debug(`Block ${name} executed in ${duration}ms`);
        return duration;
      }
    };
  }
  
  // 获取内存使用情况
  static getMemoryUsage(): any {
    const performance = window.performance as any;
    if (performance?.memory) {
      return {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
      };
    }
    return null;
  }
  
  // 监听长任务
  static observeLongTasks(callback: (entries: PerformanceEntry[]) => void): void {
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        const observer = new PerformanceObserver(callback);
        observer.observe({ entryTypes: ['longtask'] });
      } catch (error) {
        logger.warn('Failed to observe long tasks:', error);
      }
    }
  }
}