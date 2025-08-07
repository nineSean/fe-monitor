// 基础类型定义
export interface BaseEvent {
  eventId: string;
  appId: string;
  sessionId: string;
  userId?: string;
  timestamp: number;
  pageUrl: string;
  userAgent: string;
  deviceInfo: DeviceInfo;
  geoInfo?: GeoInfo;
}

export interface DeviceInfo {
  screenWidth: number;
  screenHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  pixelRatio: number;
  platform: string;
  language: string;
  timezone: string;
  connection?: {
    effectiveType: string;
    downlink: number;
    rtt: number;
  };
}

export interface GeoInfo {
  country?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
}

// 性能事件类型
export interface PerformanceEvent extends BaseEvent {
  type: 'performance';
  metrics: PerformanceMetrics;
  resources?: ResourceTiming[];
}

export interface PerformanceMetrics {
  // Core Web Vitals
  lcp?: number;          // Largest Contentful Paint
  fid?: number;          // First Input Delay
  cls?: number;          // Cumulative Layout Shift
  fcp?: number;          // First Contentful Paint
  ttfb?: number;         // Time to First Byte
  
  // 页面性能
  pageLoadTime: number;
  domReadyTime: number;
  resourceLoadTime: number;
  
  // 自定义指标
  customMetrics?: Record<string, number>;
}

export interface ResourceTiming {
  name: string;
  entryType: string;
  startTime: number;
  duration: number;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
}

// 错误事件类型
export interface ErrorEvent extends BaseEvent {
  type: 'error';
  errorType: 'javascript' | 'network' | 'custom' | 'promise';
  message: string;
  stackTrace?: string;
  lineNumber?: number;
  columnNumber?: number;
  fileName?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  context?: Record<string, any>;
  fingerprint?: string;  // 用于错误去重
}

// 行为事件类型
export interface BehaviorEvent extends BaseEvent {
  type: 'behavior';
  action: 'click' | 'scroll' | 'input' | 'navigate' | 'focus' | 'blur' | 'custom';
  target?: string;
  value?: any;
  coordinates?: {
    x: number;
    y: number;
  };
  duration?: number;
  path?: string;         // DOM路径
}

// 会话重放事件
export interface ReplayEvent extends BaseEvent {
  type: 'replay';
  events: ReplayRecord[];
}

export interface ReplayRecord {
  timestamp: number;
  type: 'dom' | 'input' | 'scroll' | 'resize' | 'mutation';
  data: any;
}

// SDK配置类型
export interface SDKConfig {
  appId: string;
  apiKey: string;
  endpoint: string;
  
  // 功能开关
  features?: {
    performance?: boolean;
    errors?: boolean;
    behavior?: boolean;
    replay?: boolean;
  };
  
  // 采样配置
  sampling?: {
    performance?: number;  // 0-1之间的采样率
    errors?: number;
    behavior?: number;
    replay?: number;
  };
  
  // 数据上报配置
  reporting?: {
    batchSize?: number;     // 批量上报大小
    flushInterval?: number; // 上报间隔(ms)
    maxRetries?: number;    // 最大重试次数
    timeout?: number;       // 请求超时时间
  };
  
  // 隐私配置
  privacy?: {
    maskSensitiveData?: boolean;
    allowedDomains?: string[];
    blockedElements?: string[];
  };
  
  // 调试配置
  debug?: boolean;
  environment?: 'development' | 'staging' | 'production';
}

// 事件联合类型
export type MonitorEvent = PerformanceEvent | ErrorEvent | BehaviorEvent | ReplayEvent;

// 事件处理器类型
export type EventHandler = (event: MonitorEvent) => void;

// 插件接口
export interface Plugin {
  name: string;
  version: string;
  install(sdk: any): void;
  uninstall?(): void;
}

// 数据收集器接口
export interface Collector {
  collect(): Promise<MonitorEvent[]>;
  start(): void;
  stop(): void;
  isRunning(): boolean;
}

// 数据传输器接口
export interface Transport {
  send(events: MonitorEvent[]): Promise<void>;
  configure(config: any): void;
}

// 存储接口
export interface Storage {
  setItem(key: string, value: string): void;
  getItem(key: string): string | null;
  removeItem(key: string): void;
  clear(): void;
}

// 队列接口
export interface EventQueue {
  enqueue(event: MonitorEvent): void;
  dequeue(): MonitorEvent | undefined;
  peek(): MonitorEvent | undefined;
  size(): number;
  clear(): void;
  toArray(): MonitorEvent[];
}

// 工具类型
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
export type Partial<T> = { [P in keyof T]?: T[P] };
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// 错误类型
export class MonitorError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'MonitorError';
  }
}

// 常量
export const EVENT_TYPES = {
  PERFORMANCE: 'performance',
  ERROR: 'error',
  BEHAVIOR: 'behavior',
  REPLAY: 'replay'
} as const;

export const ERROR_TYPES = {
  JAVASCRIPT: 'javascript',
  NETWORK: 'network',
  CUSTOM: 'custom',
  PROMISE: 'promise'
} as const;

export const SEVERITY_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
} as const;