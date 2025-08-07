/**
 * 用户行为追踪模块
 */

import {
  BehaviorEvent,
  BaseEvent,
  Collector
} from '../types';
import {
  generateId,
  now,
  getDeviceInfo,
  getElementPath,
  throttle,
  debounce,
  logger
} from '../utils';

export class BehaviorCollector implements Collector {
  private isRunning = false;
  private eventBuffer: BehaviorEvent[] = [];
  private maxEventsPerSession = 500;
  private listeners: Array<{ element: EventTarget; event: string; handler: EventListener }> = [];
  
  // 节流和防抖处理器
  private throttledScrollHandler: (event: Event) => void;
  private debouncedInputHandler: (event: Event) => void;
  private throttledMouseMoveHandler: (event: Event) => void;

  constructor(
    private appId: string,
    private sessionId: string,
    private userId?: string,
    private config: BehaviorConfig = {}
  ) {
    const {
      trackClicks = true,
      trackScrolls = true,
      trackInputs = true,
      trackNavigation = true,
      trackFocus = true,
      scrollThrottle = 250,
      inputDebounce = 500,
      mouseMoveThrottle = 100
    } = config;

    // 创建节流和防抖处理器
    this.throttledScrollHandler = throttle((event: Event) => {
      if (trackScrolls) this.handleScroll(event);
    }, scrollThrottle);

    this.debouncedInputHandler = debounce((event: Event) => {
      if (trackInputs) this.handleInput(event);
    }, inputDebounce);

    this.throttledMouseMoveHandler = throttle((event: Event) => {
      this.handleMouseMove(event);
    }, mouseMoveThrottle);
  }

  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    logger.debug('Behavior collector started');
    
    this.setupEventListeners();
  }

  stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    this.removeEventListeners();
    logger.debug('Behavior collector stopped');
  }

  isRunning(): boolean {
    return this.isRunning;
  }

  async collect(): Promise<BehaviorEvent[]> {
    const events = this.eventBuffer.slice();
    this.eventBuffer = [];
    return events;
  }

  // 手动追踪自定义事件
  track(action: string, target?: string, value?: any, context?: Record<string, any>): void {
    if (!this.isRunning) return;

    const event = this.createBehaviorEvent({
      action: 'custom',
      target,
      value,
      context
    });

    this.addBehaviorEvent(event);
  }

  private setupEventListeners(): void {
    const { config } = this;

    // 点击事件
    if (config.trackClicks !== false) {
      this.addListener(document, 'click', this.handleClick.bind(this));
    }

    // 滚动事件
    if (config.trackScrolls !== false) {
      this.addListener(window, 'scroll', this.throttledScrollHandler);
      this.addListener(document, 'scroll', this.throttledScrollHandler, true);
    }

    // 输入事件
    if (config.trackInputs !== false) {
      this.addListener(document, 'input', this.debouncedInputHandler, true);
      this.addListener(document, 'change', this.handleChange.bind(this), true);
    }

    // 导航事件
    if (config.trackNavigation !== false) {
      this.addListener(window, 'popstate', this.handleNavigation.bind(this));
      this.setupNavigationObserver();
    }

    // 焦点事件
    if (config.trackFocus !== false) {
      this.addListener(document, 'focus', this.handleFocus.bind(this), true);
      this.addListener(document, 'blur', this.handleBlur.bind(this), true);
    }

    // 鼠标移动（可选）
    if (config.trackMouseMove) {
      this.addListener(document, 'mousemove', this.throttledMouseMoveHandler);
    }

    // 页面可见性变化
    this.addListener(document, 'visibilitychange', this.handleVisibilityChange.bind(this));

    // 窗口大小变化
    this.addListener(window, 'resize', this.handleResize.bind(this));
  }

  private removeEventListeners(): void {
    this.listeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler as EventListener);
    });
    this.listeners = [];
  }

  private addListener(
    element: EventTarget,
    event: string,
    handler: EventListener,
    capture: boolean = false
  ): void {
    element.addEventListener(event, handler, { capture, passive: true });
    this.listeners.push({ element, event, handler });
  }

  private handleClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target) return;

    const elementPath = getElementPath(target);
    const rect = target.getBoundingClientRect();

    const behaviorEvent = this.createBehaviorEvent({
      action: 'click',
      target: elementPath,
      coordinates: {
        x: event.clientX,
        y: event.clientY
      },
      context: {
        elementType: target.tagName.toLowerCase(),
        elementId: target.id,
        elementClass: target.className,
        elementText: target.textContent?.substring(0, 100),
        elementRect: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height
        },
        button: event.button,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey
      }
    });

    this.addBehaviorEvent(behaviorEvent);
  }

  private handleScroll(event: Event): void {
    const target = event.target as HTMLElement;
    const isWindow = target === window || target === document;
    
    let scrollTop: number;
    let scrollLeft: number;
    let scrollHeight: number;
    let clientHeight: number;

    if (isWindow) {
      scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
      scrollHeight = document.documentElement.scrollHeight;
      clientHeight = window.innerHeight;
    } else {
      scrollTop = target.scrollTop;
      scrollLeft = target.scrollLeft;
      scrollHeight = target.scrollHeight;
      clientHeight = target.clientHeight;
    }

    const scrollPercentage = scrollHeight > 0 ? (scrollTop + clientHeight) / scrollHeight : 0;

    const behaviorEvent = this.createBehaviorEvent({
      action: 'scroll',
      target: isWindow ? 'window' : getElementPath(target),
      value: {
        scrollTop,
        scrollLeft,
        scrollPercentage: Math.round(scrollPercentage * 100)
      },
      context: {
        isWindow,
        scrollHeight,
        clientHeight
      }
    });

    this.addBehaviorEvent(behaviorEvent);
  }

  private handleInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (!target) return;

    // 获取输入值，但要注意隐私保护
    let value = this.sanitizeInputValue(target);
    
    const behaviorEvent = this.createBehaviorEvent({
      action: 'input',
      target: getElementPath(target),
      value,
      context: {
        inputType: target.type,
        inputName: target.name,
        inputId: target.id,
        valueLength: target.value.length,
        placeholder: target.placeholder
      }
    });

    this.addBehaviorEvent(behaviorEvent);
  }

  private handleChange(event: Event): void {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    if (!target) return;

    let value = this.sanitizeInputValue(target);

    const behaviorEvent = this.createBehaviorEvent({
      action: 'change',
      target: getElementPath(target),
      value,
      context: {
        elementType: target.tagName.toLowerCase(),
        inputType: (target as HTMLInputElement).type,
        inputName: target.name,
        inputId: target.id
      }
    });

    this.addBehaviorEvent(behaviorEvent);
  }

  private handleNavigation(): void {
    const behaviorEvent = this.createBehaviorEvent({
      action: 'navigate',
      target: 'window',
      value: {
        from: document.referrer,
        to: window.location.href
      },
      context: {
        type: 'popstate',
        pathname: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash
      }
    });

    this.addBehaviorEvent(behaviorEvent);
  }

  private handleFocus(event: FocusEvent): void {
    const target = event.target as HTMLElement;
    if (!target) return;

    const behaviorEvent = this.createBehaviorEvent({
      action: 'focus',
      target: getElementPath(target),
      context: {
        elementType: target.tagName.toLowerCase(),
        elementId: target.id,
        inputType: (target as HTMLInputElement).type
      }
    });

    this.addBehaviorEvent(behaviorEvent);
  }

  private handleBlur(event: FocusEvent): void {
    const target = event.target as HTMLElement;
    if (!target) return;

    const behaviorEvent = this.createBehaviorEvent({
      action: 'blur',
      target: getElementPath(target),
      context: {
        elementType: target.tagName.toLowerCase(),
        elementId: target.id
      }
    });

    this.addBehaviorEvent(behaviorEvent);
  }

  private handleMouseMove(event: MouseEvent): void {
    const behaviorEvent = this.createBehaviorEvent({
      action: 'mousemove',
      coordinates: {
        x: event.clientX,
        y: event.clientY
      },
      context: {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
      }
    });

    this.addBehaviorEvent(behaviorEvent);
  }

  private handleVisibilityChange(): void {
    const behaviorEvent = this.createBehaviorEvent({
      action: 'visibility',
      value: document.visibilityState,
      context: {
        hidden: document.hidden
      }
    });

    this.addBehaviorEvent(behaviorEvent);
  }

  private handleResize(): void {
    const behaviorEvent = this.createBehaviorEvent({
      action: 'resize',
      value: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      context: {
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        devicePixelRatio: window.devicePixelRatio
      }
    });

    this.addBehaviorEvent(behaviorEvent);
  }

  private setupNavigationObserver(): void {
    // 监听History API调用
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = (...args) => {
      originalPushState.apply(history, args);
      this.handleHistoryChange('pushstate');
    };

    history.replaceState = (...args) => {
      originalReplaceState.apply(history, args);
      this.handleHistoryChange('replacestate');
    };
  }

  private handleHistoryChange(type: string): void {
    const behaviorEvent = this.createBehaviorEvent({
      action: 'navigate',
      target: 'window',
      value: window.location.href,
      context: {
        type,
        pathname: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash
      }
    });

    this.addBehaviorEvent(behaviorEvent);
  }

  private createBehaviorEvent(params: {
    action: string;
    target?: string;
    value?: any;
    coordinates?: { x: number; y: number };
    duration?: number;
    context?: Record<string, any>;
  }): BehaviorEvent {
    const { action, target, value, coordinates, duration, context } = params;

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
      type: 'behavior',
      action: action as any,
      target,
      value,
      coordinates,
      duration,
      path: target
    };
  }

  private addBehaviorEvent(event: BehaviorEvent): void {
    // 检查缓冲区大小
    if (this.eventBuffer.length >= this.maxEventsPerSession) {
      this.eventBuffer.shift(); // 移除最旧的事件
    }

    this.eventBuffer.push(event);
    logger.debug('Behavior event captured:', event.action, event.target);
  }

  private sanitizeInputValue(element: HTMLInputElement | HTMLSelectElement): any {
    const sensitiveTypes = ['password', 'email', 'tel', 'credit-card', 'ssn'];
    const sensitiveNames = ['password', 'pass', 'pwd', 'email', 'phone', 'tel', 'credit', 'card', 'ssn', 'social'];
    
    const inputType = (element as HTMLInputElement).type?.toLowerCase();
    const inputName = element.name?.toLowerCase();
    const inputId = element.id?.toLowerCase();

    // 检查是否是敏感输入
    const isSensitive = sensitiveTypes.includes(inputType) ||
                       sensitiveNames.some(name => 
                         inputName?.includes(name) || inputId?.includes(name)
                       );

    if (isSensitive) {
      return '[MASKED]';
    }

    // 对于其他输入，返回值的长度而不是实际值
    if (element.value) {
      return {
        length: element.value.length,
        isEmpty: element.value.length === 0,
        hasValue: element.value.length > 0
      };
    }

    return null;
  }
}

// 行为配置接口
export interface BehaviorConfig {
  trackClicks?: boolean;
  trackScrolls?: boolean;
  trackInputs?: boolean;
  trackNavigation?: boolean;
  trackFocus?: boolean;
  trackMouseMove?: boolean;
  scrollThrottle?: number;
  inputDebounce?: number;
  mouseMoveThrottle?: number;
  maskSensitiveInputs?: boolean;
  allowedDomains?: string[];
  blockedElements?: string[];
}

// 用户会话分析器
export class SessionAnalyzer {
  private events: BehaviorEvent[] = [];
  
  addEvent(event: BehaviorEvent): void {
    this.events.push(event);
  }
  
  // 分析用户路径
  getNavigationPath(): { url: string; timestamp: number; duration?: number }[] {
    const navigationEvents = this.events.filter(e => e.action === 'navigate');
    const path: { url: string; timestamp: number; duration?: number }[] = [];
    
    for (let i = 0; i < navigationEvents.length; i++) {
      const current = navigationEvents[i];
      const next = navigationEvents[i + 1];
      
      path.push({
        url: current.pageUrl,
        timestamp: current.timestamp,
        duration: next ? next.timestamp - current.timestamp : undefined
      });
    }
    
    return path;
  }
  
  // 分析点击热点
  getClickHeatmap(): { element: string; count: number; coordinates: { x: number; y: number }[] }[] {
    const clickEvents = this.events.filter(e => e.action === 'click');
    const heatmap = new Map<string, { count: number; coordinates: { x: number; y: number }[] }>();
    
    clickEvents.forEach(event => {
      const element = event.target || 'unknown';
      const existing = heatmap.get(element) || { count: 0, coordinates: [] };
      
      existing.count++;
      if (event.coordinates) {
        existing.coordinates.push(event.coordinates);
      }
      
      heatmap.set(element, existing);
    });
    
    return Array.from(heatmap.entries()).map(([element, data]) => ({
      element,
      ...data
    }));
  }
  
  // 分析滚动行为
  getScrollBehavior(): { maxScrollPercentage: number; scrollEvents: number; avgScrollSpeed: number } {
    const scrollEvents = this.events.filter(e => e.action === 'scroll');
    
    if (scrollEvents.length === 0) {
      return { maxScrollPercentage: 0, scrollEvents: 0, avgScrollSpeed: 0 };
    }
    
    let maxScrollPercentage = 0;
    let totalScrollDistance = 0;
    let totalScrollTime = 0;
    
    for (let i = 0; i < scrollEvents.length; i++) {
      const event = scrollEvents[i];
      if (event.value?.scrollPercentage) {
        maxScrollPercentage = Math.max(maxScrollPercentage, event.value.scrollPercentage);
      }
      
      if (i > 0) {
        const prevEvent = scrollEvents[i - 1];
        const timeDiff = event.timestamp - prevEvent.timestamp;
        const scrollDiff = Math.abs((event.value?.scrollTop || 0) - (prevEvent.value?.scrollTop || 0));
        
        totalScrollDistance += scrollDiff;
        totalScrollTime += timeDiff;
      }
    }
    
    const avgScrollSpeed = totalScrollTime > 0 ? totalScrollDistance / totalScrollTime : 0;
    
    return {
      maxScrollPercentage,
      scrollEvents: scrollEvents.length,
      avgScrollSpeed
    };
  }
  
  // 分析会话质量
  getSessionQuality(): {
    duration: number;
    engagement: 'low' | 'medium' | 'high';
    bounceRate: boolean;
    pageViews: number;
    interactions: number;
  } {
    if (this.events.length === 0) {
      return {
        duration: 0,
        engagement: 'low',
        bounceRate: true,
        pageViews: 0,
        interactions: 0
      };
    }
    
    const firstEvent = this.events[0];
    const lastEvent = this.events[this.events.length - 1];
    const duration = lastEvent.timestamp - firstEvent.timestamp;
    
    const navigationEvents = this.events.filter(e => e.action === 'navigate').length;
    const interactionEvents = this.events.filter(e => 
      ['click', 'input', 'scroll'].includes(e.action)
    ).length;
    
    let engagement: 'low' | 'medium' | 'high' = 'low';
    if (duration > 30000 && interactionEvents > 5) {
      engagement = 'high';
    } else if (duration > 10000 && interactionEvents > 2) {
      engagement = 'medium';
    }
    
    const bounceRate = navigationEvents <= 1 && interactionEvents < 2;
    
    return {
      duration,
      engagement,
      bounceRate,
      pageViews: Math.max(1, navigationEvents),
      interactions: interactionEvents
    };
  }
  
  // 重置分析器
  reset(): void {
    this.events = [];
  }
}