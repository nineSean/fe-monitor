/**
 * 错误追踪模块
 */

import {
  ErrorEvent,
  BaseEvent,
  Collector,
  SEVERITY_LEVELS,
  ERROR_TYPES
} from '../types';
import {
  generateId,
  now,
  getDeviceInfo,
  parseStackTrace,
  generateErrorFingerprint,
  logger
} from '../utils';

export class ErrorCollector implements Collector {
  private isRunning = false;
  private errorBuffer: ErrorEvent[] = [];
  private errorFingerprints = new Set<string>();
  private maxErrorsPerSession = 100;
  private originalErrorHandler?: OnErrorEventHandler;
  private originalUnhandledRejectionHandler?: (event: PromiseRejectionEvent) => void;

  constructor(
    private appId: string,
    private sessionId: string,
    private userId?: string
  ) {}

  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    logger.debug('Error collector started');
    
    // 监听JavaScript错误
    this.setupJavaScriptErrorHandler();
    
    // 监听Promise rejection错误
    this.setupUnhandledRejectionHandler();
    
    // 监听资源加载错误
    this.setupResourceErrorHandler();
  }

  stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    // 恢复原始错误处理器
    window.onerror = this.originalErrorHandler || null;
    window.onunhandledrejection = this.originalUnhandledRejectionHandler || null;
    
    logger.debug('Error collector stopped');
  }

  isRunning(): boolean {
    return this.isRunning;
  }

  async collect(): Promise<ErrorEvent[]> {
    const events = this.errorBuffer.slice();
    this.errorBuffer = [];
    return events;
  }

  // 手动捕获错误
  captureException(error: Error, context?: Record<string, any>, severity?: string): void {
    if (!this.isRunning) return;
    
    const errorEvent = this.createErrorEvent({
      message: error.message,
      stackTrace: error.stack,
      fileName: this.extractFileNameFromStack(error.stack),
      errorType: 'custom',
      severity: severity as any || 'medium',
      context
    });
    
    this.addErrorEvent(errorEvent);
  }

  // 手动捕获消息
  captureMessage(message: string, severity: string = 'info', context?: Record<string, any>): void {
    if (!this.isRunning) return;
    
    const errorEvent = this.createErrorEvent({
      message,
      errorType: 'custom',
      severity: severity as any,
      context
    });
    
    this.addErrorEvent(errorEvent);
  }

  // 设置JavaScript错误处理器
  private setupJavaScriptErrorHandler(): void {
    // 保存原始处理器
    this.originalErrorHandler = window.onerror;
    
    window.onerror = (message, fileName, lineNumber, columnNumber, error) => {
      // 调用原始处理器
      if (this.originalErrorHandler) {
        this.originalErrorHandler.call(window, message, fileName, lineNumber, columnNumber, error);
      }
      
      const errorEvent = this.createErrorEvent({
        message: String(message),
        fileName: fileName || undefined,
        lineNumber: lineNumber || undefined,
        columnNumber: columnNumber || undefined,
        stackTrace: error?.stack,
        errorType: 'javascript',
        severity: this.determineSeverity(String(message))
      });
      
      this.addErrorEvent(errorEvent);
      
      // 不阻止默认行为
      return false;
    };
  }

  // 设置Promise rejection处理器
  private setupUnhandledRejectionHandler(): void {
    // 保存原始处理器
    this.originalUnhandledRejectionHandler = window.onunhandledrejection;
    
    window.onunhandledrejection = (event: PromiseRejectionEvent) => {
      // 调用原始处理器
      if (this.originalUnhandledRejectionHandler) {
        this.originalUnhandledRejectionHandler.call(window, event);
      }
      
      let message = 'Unhandled Promise Rejection';
      let stackTrace: string | undefined;
      
      if (event.reason instanceof Error) {
        message = event.reason.message;
        stackTrace = event.reason.stack;
      } else if (typeof event.reason === 'string') {
        message = event.reason;
      } else {
        message = JSON.stringify(event.reason);
      }
      
      const errorEvent = this.createErrorEvent({
        message,
        stackTrace,
        errorType: 'promise',
        severity: 'high'
      });
      
      this.addErrorEvent(errorEvent);
    };
  }

  // 设置资源错误处理器
  private setupResourceErrorHandler(): void {
    document.addEventListener('error', (event) => {
      const target = event.target as HTMLElement;
      
      // 检查是否是资源加载错误
      if (target && target !== window && 'src' in target) {
        const resourceType = target.tagName.toLowerCase();
        const resourceUrl = (target as any).src || (target as any).href;
        
        const errorEvent = this.createErrorEvent({
          message: `Failed to load ${resourceType}: ${resourceUrl}`,
          fileName: resourceUrl,
          errorType: 'network',
          severity: 'medium',
          context: {
            resourceType,
            resourceUrl,
            element: target.outerHTML.substring(0, 200)
          }
        });
        
        this.addErrorEvent(errorEvent);
      }
    }, true);
  }

  // 创建错误事件
  private createErrorEvent(params: {
    message: string;
    fileName?: string;
    lineNumber?: number;
    columnNumber?: number;
    stackTrace?: string;
    errorType: string;
    severity: string;
    context?: Record<string, any>;
  }): ErrorEvent {
    const {
      message,
      fileName,
      lineNumber,
      columnNumber,
      stackTrace,
      errorType,
      severity,
      context
    } = params;
    
    // 生成错误指纹用于去重
    const fingerprint = generateErrorFingerprint({
      message,
      fileName,
      lineNumber,
      columnNumber
    });
    
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
      type: 'error',
      errorType: errorType as any,
      message: this.sanitizeMessage(message),
      stackTrace: stackTrace ? this.sanitizeStackTrace(stackTrace) : undefined,
      lineNumber,
      columnNumber,
      fileName,
      severity: severity as any,
      context: context ? this.sanitizeContext(context) : undefined,
      fingerprint
    };
  }

  // 添加错误事件
  private addErrorEvent(errorEvent: ErrorEvent): void {
    // 检查是否已经收集过相同的错误
    if (this.errorFingerprints.has(errorEvent.fingerprint!)) {
      logger.debug('Duplicate error ignored:', errorEvent.message);
      return;
    }
    
    // 检查缓冲区大小
    if (this.errorBuffer.length >= this.maxErrorsPerSession) {
      logger.warn('Error buffer full, dropping oldest error');
      this.errorBuffer.shift();
    }
    
    this.errorFingerprints.add(errorEvent.fingerprint!);
    this.errorBuffer.push(errorEvent);
    
    logger.debug('Error captured:', errorEvent.message);
  }

  // 确定错误严重程度
  private determineSeverity(message: string): string {
    const lowerMessage = message.toLowerCase();
    
    // 严重错误关键词
    const criticalKeywords = ['crash', 'fatal', 'critical', 'security'];
    if (criticalKeywords.some(keyword => lowerMessage.includes(keyword))) {
      return SEVERITY_LEVELS.CRITICAL;
    }
    
    // 高级错误关键词
    const highKeywords = ['error', 'exception', 'failed', 'timeout'];
    if (highKeywords.some(keyword => lowerMessage.includes(keyword))) {
      return SEVERITY_LEVELS.HIGH;
    }
    
    // 中级错误关键词
    const mediumKeywords = ['warning', 'deprecated', 'invalid'];
    if (mediumKeywords.some(keyword => lowerMessage.includes(keyword))) {
      return SEVERITY_LEVELS.MEDIUM;
    }
    
    return SEVERITY_LEVELS.LOW;
  }

  // 清理错误消息
  private sanitizeMessage(message: string): string {
    // 移除敏感信息
    return message
      .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CARD]') // 信用卡号
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]') // 邮箱
      .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]') // 电话号码
      .substring(0, 1000); // 限制长度
  }

  // 清理堆栈跟踪
  private sanitizeStackTrace(stackTrace: string): string {
    const lines = parseStackTrace({ stack: stackTrace } as Error);
    
    return lines
      .slice(0, 10) // 只保留前10行
      .map(line => {
        // 移除绝对路径，只保留文件名
        return line.replace(/https?:\/\/[^\/]+\//g, '');
      })
      .join('\n')
      .substring(0, 2000); // 限制总长度
  }

  // 清理上下文信息
  private sanitizeContext(context: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(context)) {
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeMessage(value);
      } else if (typeof value === 'object' && value !== null) {
        // 简单序列化对象，避免循环引用
        try {
          sanitized[key] = JSON.parse(JSON.stringify(value));
        } catch {
          sanitized[key] = '[Object]';
        }
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  // 从堆栈跟踪中提取文件名
  private extractFileNameFromStack(stack?: string): string | undefined {
    if (!stack) return undefined;
    
    const lines = parseStackTrace({ stack } as Error);
    for (const line of lines) {
      const match = line.match(/https?:\/\/[^\/]+\/(.+?)(?::\d+){1,2}/);
      if (match) {
        return match[1];
      }
    }
    
    return undefined;
  }
}

// 错误工具类
export class ErrorUtils {
  // 包装函数以捕获错误
  static wrapFunction<T extends (...args: any[]) => any>(
    fn: T,
    errorCollector: ErrorCollector,
    context?: Record<string, any>
  ): T {
    return ((...args: any[]) => {
      try {
        const result = fn.apply(this, args);
        
        // 如果返回Promise，需要捕获异步错误
        if (result && typeof result.catch === 'function') {
          return result.catch((error: Error) => {
            errorCollector.captureException(error, {
              ...context,
              functionName: fn.name,
              arguments: args
            });
            throw error;
          });
        }
        
        return result;
      } catch (error) {
        errorCollector.captureException(error as Error, {
          ...context,
          functionName: fn.name,
          arguments: args
        });
        throw error;
      }
    }) as T;
  }
  
  // 包装Promise以捕获错误
  static wrapPromise<T>(
    promise: Promise<T>,
    errorCollector: ErrorCollector,
    context?: Record<string, any>
  ): Promise<T> {
    return promise.catch((error: Error) => {
      errorCollector.captureException(error, context);
      throw error;
    });
  }
  
  // 安全执行函数
  static safeExecute<T>(
    fn: () => T,
    errorCollector: ErrorCollector,
    defaultValue: T,
    context?: Record<string, any>
  ): T {
    try {
      return fn();
    } catch (error) {
      errorCollector.captureException(error as Error, context);
      return defaultValue;
    }
  }
  
  // 创建错误边界（React风格）
  static createErrorBoundary(
    errorCollector: ErrorCollector,
    fallback: () => void = () => {}
  ) {
    return {
      captureError: (error: Error, errorInfo?: any) => {
        errorCollector.captureException(error, {
          errorBoundary: true,
          componentStack: errorInfo?.componentStack
        });
        
        fallback();
      }
    };
  }
}

// 网络错误监控
export class NetworkErrorCollector {
  private errorCollector: ErrorCollector;
  private originalFetch?: typeof fetch;
  private originalXHROpen?: typeof XMLHttpRequest.prototype.open;
  private originalXHRSend?: typeof XMLHttpRequest.prototype.send;

  constructor(errorCollector: ErrorCollector) {
    this.errorCollector = errorCollector;
  }

  start(): void {
    this.interceptFetch();
    this.interceptXHR();
  }

  stop(): void {
    if (this.originalFetch) {
      window.fetch = this.originalFetch;
    }
    
    if (this.originalXHROpen) {
      XMLHttpRequest.prototype.open = this.originalXHROpen;
    }
    
    if (this.originalXHRSend) {
      XMLHttpRequest.prototype.send = this.originalXHRSend;
    }
  }

  // 拦截Fetch API
  private interceptFetch(): void {
    if (typeof fetch === 'undefined') return;
    
    this.originalFetch = window.fetch;
    
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const startTime = performance.now();
      const url = typeof input === 'string' ? input : input.toString();
      
      try {
        const response = await this.originalFetch!(input, init);
        const duration = performance.now() - startTime;
        
        // 检查HTTP错误状态
        if (!response.ok) {
          this.errorCollector.captureException(
            new Error(`HTTP ${response.status}: ${response.statusText}`),
            {
              url,
              method: init?.method || 'GET',
              status: response.status,
              statusText: response.statusText,
              duration,
              requestHeaders: init?.headers,
              responseHeaders: Object.fromEntries(response.headers.entries())
            },
            response.status >= 500 ? 'high' : 'medium'
          );
        }
        
        return response;
      } catch (error) {
        const duration = performance.now() - startTime;
        
        this.errorCollector.captureException(error as Error, {
          url,
          method: init?.method || 'GET',
          duration,
          requestHeaders: init?.headers,
          networkError: true
        }, 'high');
        
        throw error;
      }
    };
  }

  // 拦截XMLHttpRequest
  private interceptXHR(): void {
    this.originalXHROpen = XMLHttpRequest.prototype.open;
    this.originalXHRSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(method: string, url: string | URL, ...args: any[]) {
      (this as any)._monitorData = {
        method,
        url: url.toString(),
        startTime: performance.now()
      };
      
      return this.originalXHROpen!.call(this, method, url, ...args);
    };
    
    XMLHttpRequest.prototype.send = function(body?: Document | XMLHttpRequestBodyInit | null) {
      const monitorData = (this as any)._monitorData;
      
      this.addEventListener('loadend', () => {
        if (!monitorData) return;
        
        const duration = performance.now() - monitorData.startTime;
        
        if (this.status >= 400) {
          this.errorCollector.captureException(
            new Error(`HTTP ${this.status}: ${this.statusText}`),
            {
              url: monitorData.url,
              method: monitorData.method,
              status: this.status,
              statusText: this.statusText,
              duration,
              xhr: true
            },
            this.status >= 500 ? 'high' : 'medium'
          );
        }
      });
      
      this.addEventListener('error', () => {
        if (!monitorData) return;
        
        const duration = performance.now() - monitorData.startTime;
        
        this.errorCollector.captureException(
          new Error('Network request failed'),
          {
            url: monitorData.url,
            method: monitorData.method,
            duration,
            xhr: true,
            networkError: true
          },
          'high'
        );
      });
      
      this.addEventListener('timeout', () => {
        if (!monitorData) return;
        
        const duration = performance.now() - monitorData.startTime;
        
        this.errorCollector.captureException(
          new Error('Network request timeout'),
          {
            url: monitorData.url,
            method: monitorData.method,
            duration,
            xhr: true,
            timeout: true
          },
          'high'
        );
      });
      
      return this.originalXHRSend!.call(this, body);
    };
  }
}