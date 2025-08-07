/**
 * 会话重放模块
 */

import {
  ReplayEvent,
  ReplayRecord,
  BaseEvent,
  Collector
} from '../types';
import {
  generateId,
  now,
  getDeviceInfo,
  throttle,
  debounce,
  logger,
  browserSupport
} from '../utils';

export class SessionReplayCollector implements Collector {
  private isRunning = false;
  private isRecording = false;
  private records: ReplayRecord[] = [];
  private maxRecordTime = 60000; // 60秒
  private maxRecordsPerSession = 1000;
  private observers: Array<MutationObserver | IntersectionObserver> = [];
  private listeners: Array<{ element: EventTarget; event: string; handler: EventListener }> = [];
  
  // 节流处理器
  private throttledScrollHandler: (event: Event) => void;
  private throttledMouseMoveHandler: (event: Event) => void;
  private throttledResizeHandler: (event: Event) => void;

  constructor(
    private appId: string,
    private sessionId: string,
    private userId?: string,
    private config: ReplayConfig = {}
  ) {
    const {
      recordScrolls = true,
      recordMouseMove = false,
      recordInputs = true,
      recordClicks = true,
      recordViewportChanges = true,
      maskSensitiveElements = true,
      scrollThrottle = 100,
      mouseMoveThrottle = 50,
      resizeThrottle = 250
    } = config;

    // 创建节流处理器
    this.throttledScrollHandler = throttle((event: Event) => {
      if (recordScrolls) this.recordScroll(event);
    }, scrollThrottle);

    this.throttledMouseMoveHandler = throttle((event: Event) => {
      if (recordMouseMove) this.recordMouseMove(event);
    }, mouseMoveThrottle);

    this.throttledResizeHandler = throttle((event: Event) => {
      if (recordViewportChanges) this.recordViewportChange(event);
    }, resizeThrottle);
  }

  start(): void {
    if (this.isRunning || !this.checkBrowserSupport()) return;
    
    this.isRunning = true;
    logger.debug('Session replay collector started');
    
    this.startRecording();
  }

  stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    this.stopRecording();
    this.cleanup();
    logger.debug('Session replay collector stopped');
  }

  isRunning(): boolean {
    return this.isRunning;
  }

  async collect(): Promise<ReplayEvent[]> {
    if (this.records.length === 0) return [];
    
    const event = this.createReplayEvent();
    this.records = []; // 清空记录
    return [event];
  }

  // 手动开始录制
  startRecording(): void {
    if (this.isRecording) return;
    
    this.isRecording = true;
    this.records = [];
    
    // 记录初始DOM状态
    this.recordInitialState();
    
    // 设置事件监听器
    this.setupEventListeners();
    
    // 设置DOM变化观察器
    this.setupMutationObserver();
    
    // 设置视口观察器
    this.setupIntersectionObserver();
    
    logger.debug('Session recording started');
  }

  // 停止录制
  stopRecording(): void {
    if (!this.isRecording) return;
    
    this.isRecording = false;
    this.cleanup();
    
    logger.debug('Session recording stopped');
  }

  // 暂停录制
  pauseRecording(): void {
    this.isRecording = false;
  }

  // 恢复录制
  resumeRecording(): void {
    this.isRecording = true;
  }

  private checkBrowserSupport(): boolean {
    return browserSupport.mutationObserver && 
           browserSupport.intersectionObserver;
  }

  private recordInitialState(): void {
    if (!this.isRecording) return;

    const record: ReplayRecord = {
      timestamp: now(),
      type: 'dom',
      data: {
        type: 'fullSnapshot',
        html: this.serializeDOM(document.documentElement),
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        url: window.location.href,
        doctype: this.getDoctype()
      }
    };

    this.addRecord(record);
  }

  private setupEventListeners(): void {
    const { config } = this;

    // 点击事件
    if (config.recordClicks !== false) {
      this.addListener(document, 'click', this.recordClick.bind(this), true);
    }

    // 输入事件
    if (config.recordInputs !== false) {
      this.addListener(document, 'input', this.recordInput.bind(this), true);
      this.addListener(document, 'change', this.recordChange.bind(this), true);
    }

    // 滚动事件
    if (config.recordScrolls !== false) {
      this.addListener(window, 'scroll', this.throttledScrollHandler);
      this.addListener(document, 'scroll', this.throttledScrollHandler, true);
    }

    // 鼠标移动
    if (config.recordMouseMove) {
      this.addListener(document, 'mousemove', this.throttledMouseMoveHandler);
    }

    // 视口变化
    if (config.recordViewportChanges !== false) {
      this.addListener(window, 'resize', this.throttledResizeHandler);
    }

    // 焦点变化
    this.addListener(document, 'focus', this.recordFocus.bind(this), true);
    this.addListener(document, 'blur', this.recordBlur.bind(this), true);

    // 页面可见性变化
    this.addListener(document, 'visibilitychange', this.recordVisibilityChange.bind(this));
  }

  private setupMutationObserver(): void {
    if (!browserSupport.mutationObserver) return;

    const observer = new MutationObserver((mutations) => {
      if (!this.isRecording) return;

      const records: ReplayRecord[] = mutations.map(mutation => ({
        timestamp: now(),
        type: 'mutation',
        data: {
          type: mutation.type,
          target: this.getNodePath(mutation.target),
          addedNodes: Array.from(mutation.addedNodes).map(node => this.serializeNode(node)),
          removedNodes: Array.from(mutation.removedNodes).map(node => this.serializeNode(node)),
          attributeName: mutation.attributeName,
          attributeNamespace: mutation.attributeNamespace,
          oldValue: mutation.oldValue
        }
      }));

      records.forEach(record => this.addRecord(record));
    });

    observer.observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      characterData: true,
      characterDataOldValue: true
    });

    this.observers.push(observer);
  }

  private setupIntersectionObserver(): void {
    if (!browserSupport.intersectionObserver) return;

    const observer = new IntersectionObserver((entries) => {
      if (!this.isRecording) return;

      entries.forEach(entry => {
        const record: ReplayRecord = {
          timestamp: now(),
          type: 'intersection',
          data: {
            target: this.getNodePath(entry.target),
            isIntersecting: entry.isIntersecting,
            intersectionRatio: entry.intersectionRatio,
            boundingClientRect: entry.boundingClientRect,
            intersectionRect: entry.intersectionRect
          }
        };

        this.addRecord(record);
      });
    });

    // 观察所有图片和视频元素
    document.querySelectorAll('img, video').forEach(element => {
      observer.observe(element);
    });

    this.observers.push(observer as any);
  }

  private recordClick(event: MouseEvent): void {
    if (!this.isRecording) return;

    const record: ReplayRecord = {
      timestamp: now(),
      type: 'input',
      data: {
        type: 'click',
        target: this.getNodePath(event.target as Node),
        x: event.clientX,
        y: event.clientY,
        button: event.button
      }
    };

    this.addRecord(record);
  }

  private recordInput(event: Event): void {
    if (!this.isRecording) return;

    const target = event.target as HTMLInputElement;
    const value = this.sanitizeInputValue(target);

    const record: ReplayRecord = {
      timestamp: now(),
      type: 'input',
      data: {
        type: 'input',
        target: this.getNodePath(target),
        value,
        inputType: target.type
      }
    };

    this.addRecord(record);
  }

  private recordChange(event: Event): void {
    if (!this.isRecording) return;

    const target = event.target as HTMLInputElement | HTMLSelectElement;
    const value = this.sanitizeInputValue(target);

    const record: ReplayRecord = {
      timestamp: now(),
      type: 'input',
      data: {
        type: 'change',
        target: this.getNodePath(target),
        value
      }
    };

    this.addRecord(record);
  }

  private recordScroll(event: Event): void {
    if (!this.isRecording) return;

    const target = event.target as HTMLElement;
    const isWindow = target === window || target === document;

    let scrollTop: number;
    let scrollLeft: number;

    if (isWindow) {
      scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    } else {
      scrollTop = target.scrollTop;
      scrollLeft = target.scrollLeft;
    }

    const record: ReplayRecord = {
      timestamp: now(),
      type: 'scroll',
      data: {
        target: isWindow ? 'window' : this.getNodePath(target),
        scrollTop,
        scrollLeft
      }
    };

    this.addRecord(record);
  }

  private recordMouseMove(event: MouseEvent): void {
    if (!this.isRecording) return;

    const record: ReplayRecord = {
      timestamp: now(),
      type: 'input',
      data: {
        type: 'mousemove',
        x: event.clientX,
        y: event.clientY
      }
    };

    this.addRecord(record);
  }

  private recordViewportChange(event: Event): void {
    if (!this.isRecording) return;

    const record: ReplayRecord = {
      timestamp: now(),
      type: 'resize',
      data: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    };

    this.addRecord(record);
  }

  private recordFocus(event: FocusEvent): void {
    if (!this.isRecording) return;

    const record: ReplayRecord = {
      timestamp: now(),
      type: 'input',
      data: {
        type: 'focus',
        target: this.getNodePath(event.target as Node)
      }
    };

    this.addRecord(record);
  }

  private recordBlur(event: FocusEvent): void {
    if (!this.isRecording) return;

    const record: ReplayRecord = {
      timestamp: now(),
      type: 'input',
      data: {
        type: 'blur',
        target: this.getNodePath(event.target as Node)
      }
    };

    this.addRecord(record);
  }

  private recordVisibilityChange(): void {
    if (!this.isRecording) return;

    const record: ReplayRecord = {
      timestamp: now(),
      type: 'input',
      data: {
        type: 'visibilitychange',
        hidden: document.hidden
      }
    };

    this.addRecord(record);
  }

  private addRecord(record: ReplayRecord): void {
    if (this.records.length >= this.maxRecordsPerSession) {
      this.records.shift(); // 移除最旧的记录
    }

    this.records.push(record);

    // 检查录制时间限制
    const firstRecord = this.records[0];
    if (firstRecord && (record.timestamp - firstRecord.timestamp) > this.maxRecordTime) {
      this.stopRecording();
    }
  }

  private createReplayEvent(): ReplayEvent {
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
      type: 'replay',
      events: this.records.slice() // 创建副本
    };
  }

  private serializeDOM(node: Node): any {
    if (node.nodeType === Node.TEXT_NODE) {
      return {
        type: 'text',
        textContent: node.textContent
      };
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      const serialized: any = {
        type: 'element',
        tagName: element.tagName.toLowerCase(),
        attributes: this.getElementAttributes(element),
        children: []
      };

      // 处理敏感元素
      if (this.config.maskSensitiveElements && this.isSensitiveElement(element)) {
        serialized.attributes['data-masked'] = 'true';
        serialized.textContent = '[MASKED]';
      } else {
        // 序列化子节点
        Array.from(element.childNodes).forEach(child => {
          const childSerialized = this.serializeDOM(child);
          if (childSerialized) {
            serialized.children.push(childSerialized);
          }
        });
      }

      return serialized;
    }

    return null;
  }

  private serializeNode(node: Node): any {
    return this.serializeDOM(node);
  }

  private getElementAttributes(element: Element): Record<string, string> {
    const attributes: Record<string, string> = {};
    
    Array.from(element.attributes).forEach(attr => {
      // 跳过敏感属性
      if (this.isSensitiveAttribute(attr.name)) {
        attributes[attr.name] = '[MASKED]';
      } else {
        attributes[attr.name] = attr.value;
      }
    });

    return attributes;
  }

  private getNodePath(node: Node): string {
    const path: string[] = [];
    let current: Node | null = node;

    while (current && current !== document) {
      if (current.nodeType === Node.ELEMENT_NODE) {
        const element = current as Element;
        let selector = element.tagName.toLowerCase();

        if (element.id) {
          selector += `#${element.id}`;
          path.unshift(selector);
          break;
        }

        if (element.className) {
          const classes = element.className.split(' ').filter(Boolean);
          if (classes.length > 0) {
            selector += `.${classes.join('.')}`;
          }
        }

        const siblings = Array.from(current.parentNode?.children || []);
        const index = siblings.indexOf(element);
        if (index > 0) {
          selector += `:nth-child(${index + 1})`;
        }

        path.unshift(selector);
      }

      current = current.parentNode;
    }

    return path.join(' > ');
  }

  private getDoctype(): string {
    const doctype = document.doctype;
    if (!doctype) return '';
    
    return `<!DOCTYPE ${doctype.name}${doctype.publicId ? ` PUBLIC "${doctype.publicId}"` : ''}${doctype.systemId ? ` "${doctype.systemId}"` : ''}>`;
  }

  private sanitizeInputValue(element: HTMLInputElement | HTMLSelectElement): any {
    const sensitiveTypes = ['password', 'email', 'tel', 'credit-card'];
    const sensitiveNames = ['password', 'pass', 'pwd', 'email', 'phone', 'tel', 'credit', 'card'];
    
    const inputType = (element as HTMLInputElement).type?.toLowerCase();
    const inputName = element.name?.toLowerCase();

    const isSensitive = sensitiveTypes.includes(inputType) ||
                       sensitiveNames.some(name => inputName?.includes(name));

    if (isSensitive || this.isSensitiveElement(element)) {
      return '[MASKED]';
    }

    return element.value;
  }

  private isSensitiveElement(element: Element): boolean {
    const sensitiveSelectors = [
      'input[type="password"]',
      'input[type="email"]',
      'input[type="tel"]',
      '[data-sensitive]',
      '.password',
      '.credit-card',
      '.sensitive'
    ];

    return sensitiveSelectors.some(selector => element.matches(selector));
  }

  private isSensitiveAttribute(attrName: string): boolean {
    const sensitiveAttrs = ['data-secret', 'data-token', 'data-api-key'];
    return sensitiveAttrs.includes(attrName.toLowerCase());
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

  private cleanup(): void {
    // 清理事件监听器
    this.listeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler as EventListener);
    });
    this.listeners = [];

    // 清理观察器
    this.observers.forEach(observer => {
      observer.disconnect();
    });
    this.observers = [];
  }
}

// 会话重放配置接口
export interface ReplayConfig {
  recordScrolls?: boolean;
  recordMouseMove?: boolean;
  recordInputs?: boolean;
  recordClicks?: boolean;
  recordViewportChanges?: boolean;
  maskSensitiveElements?: boolean;
  scrollThrottle?: number;
  mouseMoveThrottle?: number;
  resizeThrottle?: number;
  maxRecordTime?: number;
  maxRecordsPerSession?: number;
}

// 重放数据压缩器
export class ReplayCompressor {
  // 压缩重放数据
  static compress(records: ReplayRecord[]): string {
    // 简单的压缩策略：
    // 1. 移除重复的DOM结构
    // 2. 合并连续的鼠标移动事件
    // 3. 压缩属性名
    
    const compressed = records.map(record => {
      const compressedRecord = { ...record };
      
      // 压缩时间戳为相对时间
      if (records.length > 0) {
        compressedRecord.timestamp = record.timestamp - records[0].timestamp;
      }
      
      return compressedRecord;
    });

    return JSON.stringify(compressed);
  }
  
  // 解压缩重放数据
  static decompress(compressedData: string, baseTimestamp: number): ReplayRecord[] {
    const records = JSON.parse(compressedData);
    
    return records.map((record: any) => ({
      ...record,
      timestamp: record.timestamp + baseTimestamp
    }));
  }
}

// 重放数据分析器
export class ReplayAnalyzer {
  static analyzeSession(records: ReplayRecord[]): {
    duration: number;
    interactions: number;
    scrollEvents: number;
    clickEvents: number;
    inputEvents: number;
    domMutations: number;
    errorEvents: number;
  } {
    if (records.length === 0) {
      return {
        duration: 0,
        interactions: 0,
        scrollEvents: 0,
        clickEvents: 0,
        inputEvents: 0,
        domMutations: 0,
        errorEvents: 0
      };
    }

    const firstRecord = records[0];
    const lastRecord = records[records.length - 1];
    const duration = lastRecord.timestamp - firstRecord.timestamp;

    const scrollEvents = records.filter(r => r.type === 'scroll').length;
    const clickEvents = records.filter(r => r.type === 'input' && r.data.type === 'click').length;
    const inputEvents = records.filter(r => r.type === 'input' && ['input', 'change'].includes(r.data.type)).length;
    const domMutations = records.filter(r => r.type === 'mutation').length;
    const errorEvents = records.filter(r => r.type === 'input' && r.data.type === 'error').length;
    
    const interactions = clickEvents + inputEvents + scrollEvents;

    return {
      duration,
      interactions,
      scrollEvents,
      clickEvents,
      inputEvents,
      domMutations,
      errorEvents
    };
  }
  
  // 提取用户路径
  static extractUserPath(records: ReplayRecord[]): string[] {
    const navigationEvents = records.filter(r => 
      r.type === 'input' && r.data.type === 'navigation'
    );
    
    return navigationEvents.map(event => event.data.url || '');
  }
  
  // 检测异常行为
  static detectAnomalies(records: ReplayRecord[]): string[] {
    const anomalies: string[] = [];
    
    // 检测快速连续点击
    const clickEvents = records.filter(r => r.type === 'input' && r.data.type === 'click');
    for (let i = 1; i < clickEvents.length; i++) {
      if (clickEvents[i].timestamp - clickEvents[i-1].timestamp < 100) {
        anomalies.push('rapid_clicking');
        break;
      }
    }
    
    // 检测页面错误
    const errorEvents = records.filter(r => r.type === 'input' && r.data.type === 'error');
    if (errorEvents.length > 5) {
      anomalies.push('multiple_errors');
    }
    
    // 检测异常滚动
    const scrollEvents = records.filter(r => r.type === 'scroll');
    if (scrollEvents.length > 100) {
      anomalies.push('excessive_scrolling');
    }
    
    return anomalies;
  }
}