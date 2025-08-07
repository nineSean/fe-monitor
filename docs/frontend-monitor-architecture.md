# 前端监控系统架构和代码解析

## 项目概述

这是一个企业级前端监控SDK，用于收集和上报前端应用的性能、错误、用户行为和会话重放数据。

### 核心功能
- **错误监控**: JavaScript错误、Promise拒绝、网络错误、资源加载错误
- **性能监控**: Core Web Vitals、页面加载时间、资源性能
- **行为追踪**: 用户点击、滚动、输入、导航等行为
- **会话重放**: DOM变化记录和回放功能

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend Monitor SDK                    │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ MonitorSDK  │  │DataCollector│  │   各种收集器  │             │
│  │   (入口)    │──│   (核心)    │──│ (ErrorCollector)          │
│  └─────────────┘  └─────────────┘  │ (PerformanceCollector)    │
│          │               │         │ (BehaviorCollector)       │
│          │               │         │ (ReplayCollector)         │
│          │               │         └─────────────┘             │
│          │               │                                      │
│          │          ┌────▼────┐     ┌──────────┐                │
│          │          │EventQueue│     │Transport │                │
│          └──────────│(事件队列)│─────│(传输器)  │────────────────┤
│                     └─────────┘     └──────────┘                │
└─────────────────────────────────────────────────────────────────┘
                                             │
                                             ▼
                                      Backend Server
```

## 项目目录结构

```
sdk/
├── src/
│   ├── core/                    # 核心模块
│   │   ├── index.ts            # SDK主入口
│   │   ├── collector.ts        # 数据收集器核心
│   │   ├── transport.ts        # 数据传输模块
│   │   └── storage.ts          # 数据存储模块
│   ├── modules/                # 功能模块
│   │   ├── error.ts           # 错误监控模块
│   │   ├── performance.ts     # 性能监控模块
│   │   ├── behavior.ts        # 行为追踪模块
│   │   └── replay.ts          # 会话重放模块
│   ├── types/                 # 类型定义
│   │   └── index.ts
│   ├── utils/                 # 工具函数
│   │   └── index.ts
│   └── index.ts              # 导出入口
├── __tests__/                # 测试文件
├── package.json
└── tsconfig.json
```

## 核心类详解

### 1. MonitorSDK (sdk/src/core/index.ts)

SDK的主入口类，采用单例模式。

```typescript
export class MonitorSDK {
  private static instance: MonitorSDK | null = null;
  private config: SDKConfig;
  private collector: DataCollector;
  private plugins: Map<string, Plugin> = new Map();
  private eventHandlers: Map<string, EventHandler[]> = new Map();
  private isInitialized = false;

  // 单例模式获取实例
  static getInstance(config?: SDKConfig): MonitorSDK
  
  // 初始化SDK
  static init(config: SDKConfig): MonitorSDK
  
  // 启动/停止SDK
  start(): void
  stop(): void
  
  // 手动追踪事件
  track(eventName: string, properties?: Record<string, any>): void
  
  // 错误捕获
  captureException(error: Error, context?: Record<string, any>, severity?: string): void
  captureMessage(message: string, level: string = 'info', context?: Record<string, any>): void
}
```

**初始化流程**:
```
MonitorSDK.init(config) → 
  MonitorSDK.getInstance(config) → 
  sdk.start() → 
  DataCollector.start() → 
  各个收集器.start()
```

### 2. DataCollector (sdk/src/core/collector.ts)

数据收集器核心，管理所有收集器的生命周期。

```typescript
export class DataCollector {
  private config: SDKConfig;
  private queue: EventQueue;
  private transport: HTTPTransport;
  private beaconTransport: BeaconTransport;
  private collectors: Map<string, Collector> = new Map();
  
  // 启动所有收集器
  start(): void
  
  // 手动添加事件
  addEvent(event: MonitorEvent): void
  
  // 刷新事件队列
  async flush(): Promise<void>
  
  // 定时收集和刷新
  private async collectAndFlush(): Promise<void>
}
```

**数据流处理**:
```
各种事件 → DataCollector.addEvent() → EventQueue.enqueue() → 
根据事件类型选择发送策略 → Transport.send() → Backend
```

## 错误监控详解

### ErrorCollector (sdk/src/modules/error.ts)

错误监控的核心实现，支持多种错误类型的捕获。

#### 错误类型和监听机制

```
┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  JavaScript     │    │ window.onerror   │    │  ErrorCollector  │
│  错误类型       │───▶│ 错误处理器        │───▶│ 处理方法          │
└─────────────────┘    └──────────────────┘    └──────────────────┘

1. JavaScript错误     → window.onerror           → setupJavaScriptErrorHandler()
2. Promise拒绝       → window.onunhandledrejection → setupUnhandledRejectionHandler()  
3. 资源加载错误      → document.addEventListener   → setupResourceErrorHandler()
4. 网络请求错误      → fetch/XHR拦截              → NetworkErrorCollector
```

#### JavaScript错误处理流程

```
┌─────────────────┐
│ JavaScript Error│
│ (TypeError,     │
│  SyntaxError)   │
└─────────┬───────┘
          │
          ▼
┌─────────────────┐
│ window.onerror  │
│ Handler         │
│ error.ts:108    │
└─────────┬───────┘
          │
          ▼
┌──────────────────────────────────────────────────────────┐
│           createErrorEvent() - error.ts:193             │
│ ┌────────────────────────────────────────────────────┐   │
│ │ 1. 生成错误指纹 (generateErrorFingerprint)         │   │
│ │ 2. 创建基础事件信息 (BaseEvent)                    │   │
│ │ 3. 设置错误类型为 'javascript'                     │   │
│ │ 4. 确定严重程度 (determineSeverity)                │   │
│ │ 5. 清理堆栈跟踪 (sanitizeStackTrace)               │   │
│ └────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────┐
│            addErrorEvent() - error.ts:249               │
│ ┌────────────────────────────────────────────────────┐   │
│ │ 1. 检查错误指纹去重 (errorFingerprints.has)        │   │
│ │ 2. 检查缓冲区大小限制 (maxErrorsPerSession)        │   │
│ │ 3. 添加到错误缓冲区 (errorBuffer.push)             │   │
│ │ 4. 记录调试日志                                     │   │
│ └────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
          │
          ▼
     ┌─────────────────────────┐
     │   DataCollector         │
     │   .addEvent()           │
     │   collector.ts:113      │
     └─────────────────────────┘
```

#### 网络错误监控

**NetworkErrorCollector** 通过拦截 `fetch` 和 `XMLHttpRequest` 来监控网络请求错误。

**Fetch API 拦截流程**:

```typescript
// 保存原始fetch函数
this.originalFetch = window.fetch;

// 替换fetch函数
window.fetch = async (input, init) => {
  const startTime = performance.now();
  try {
    const response = await this.originalFetch(input, init);
    
    // 检查HTTP错误状态
    if (!response.ok) {
      this.errorCollector.captureException(
        new Error(`HTTP ${response.status}: ${response.statusText}`),
        { url, method, status: response.status, ... }
      );
    }
    
    return response;
  } catch (error) {
    // 网络异常处理
    this.errorCollector.captureException(error, {
      url, method, networkError: true, ...
    });
    throw error;
  }
};
```

#### 错误去重机制

```typescript
// 生成错误指纹用于去重
const fingerprint = generateErrorFingerprint({
  message,
  fileName,
  lineNumber,
  columnNumber
});

// 检查是否已经收集过相同的错误
if (this.errorFingerprints.has(errorEvent.fingerprint!)) {
  logger.debug('Duplicate error ignored:', errorEvent.message);
  return;
}
```

#### 数据清理和隐私保护

```typescript
// 清理敏感信息
private sanitizeMessage(message: string): string {
  return message
    .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CARD]') // 信用卡号
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]') // 邮箱
    .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]') // 电话号码
    .substring(0, 1000); // 限制长度
}
```

## 数据传输系统

### Transport层架构

```
┌──────────────────────────────────────────────────────────────────┐
│                     传输层 (Transport Layer)                     │
├──────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐           │
│  │HTTPTransport│    │BeaconTrans  │    │ EventQueue  │           │
│  │(正常发送)    │    │port(卸载时) │    │(事件缓冲)    │           │
│  └─────────────┘    └─────────────┘    └─────────────┘           │
│         │                   │                   │                │
│         │                   │                   ▼                │
│         │                   │         ┌─────────────┐           │
│         │                   │         │   失败重试   │           │
│         │                   │         │ 本地存储     │           │
│         │                   │         └─────────────┘           │
│         │                   │                                    │
│         └───────────────────┼────────────────────────────────────┤
│                             │                                    │
│                             ▼                                    │
│                    ┌─────────────┐                              │
│                    │   Backend   │                              │
│                    │   Server    │                              │
│                    └─────────────┘                              │
└──────────────────────────────────────────────────────────────────┘
```

### HTTPTransport (sdk/src/core/transport.ts)

负责正常情况下的数据传输，支持批量发送、重试机制、失败存储。

```typescript
export class HTTPTransport implements Transport {
  private config: Required<TransportConfig>;
  private storage: Storage;

  async send(events: MonitorEvent[]): Promise<void> {
    // 1. 创建批次
    const batches = this.createBatches(events);
    
    // 2. 并行发送所有批次
    const promises = batches.map(batch => this.sendBatch(batch));
    await Promise.allSettled(promises);
  }

  private async sendBatch(events: MonitorEvent[]): Promise<void> {
    try {
      // 重试机制
      await retry(
        () => this.performRequest(events),
        this.config.maxRetries,
        1000
      );
    } catch (error) {
      // 失败存储，供后续重试
      this.storeFailedEvents(events);
      throw error;
    }
  }
}
```

### BeaconTransport

用于页面卸载时的可靠数据发送。

```typescript
export class BeaconTransport implements Transport {
  async send(events: MonitorEvent[]): Promise<void> {
    const payload = {
      events,
      timestamp: Date.now(),
      sdk_version: '1.0.0'
    };

    const blob = new Blob([safeJsonStringify(payload)], {
      type: 'application/json'
    });

    const success = navigator.sendBeacon(this.config.endpoint, blob);
    if (!success) {
      throw new Error('Beacon send failed');
    }
  }
}
```

## 事件队列和发送策略

### EventQueue (sdk/src/core/transport.ts)

```typescript
export class EventQueue {
  private queue: MonitorEvent[] = [];
  private maxSize: number;

  enqueue(event: MonitorEvent): void {
    if (this.queue.length >= this.maxSize) {
      // 移除最旧的事件
      this.queue.shift();
    }
    this.queue.push(event);
  }

  // 排空队列，返回所有事件
  drain(count?: number): MonitorEvent[] {
    if (count === undefined) {
      const events = this.queue.slice();
      this.queue = [];
      return events;
    }
    return this.queue.splice(0, count);
  }
}
```

### 发送策略

不同类型的事件采用不同的发送策略：

```typescript
// 根据事件类型决定刷新策略
if (event.type === 'error') {
  // 错误事件立即发送 (1秒内去重发送)
  this.debouncedFlush();
} else {
  // 其他事件使用节流发送 (5秒间隔)
  this.throttledFlush();
}
```

**防抖和节流函数**:
```typescript
// 防抖：1秒内多次调用只执行最后一次
this.debouncedFlush = debounce(() => this.flush(), 1000);

// 节流：5秒内只执行一次
this.throttledFlush = throttle(() => this.flush(), 5000);
```

## 配置系统

### SDKConfig接口 (sdk/src/types/index.ts)

```typescript
export interface SDKConfig {
  appId: string;
  apiKey: string;
  endpoint: string;
  
  // 功能开关
  features?: {
    performance?: boolean;    // 性能监控
    errors?: boolean;        // 错误监控
    behavior?: boolean;      // 行为追踪
    replay?: boolean;        // 会话重放
  };
  
  // 采样配置 (0-1之间的采样率)
  sampling?: {
    performance?: number;
    errors?: number;
    behavior?: number;
    replay?: number;
  };
  
  // 数据上报配置
  reporting?: {
    batchSize?: number;     // 批量大小，默认50
    flushInterval?: number; // 上报间隔(ms)，默认5000
    maxRetries?: number;    // 最大重试次数，默认3
    timeout?: number;       // 请求超时时间，默认10000
  };
  
  // 隐私配置
  privacy?: {
    maskSensitiveData?: boolean;    // 是否屏蔽敏感数据
    allowedDomains?: string[];      // 允许的域名
    blockedElements?: string[];     // 需要屏蔽的元素选择器
  };
}
```

### 默认配置

```typescript
const defaultConfig: Partial<SDKConfig> = {
  features: {
    performance: true,
    errors: true,
    behavior: true,
    replay: false  // 会话重放默认关闭
  },
  sampling: {
    performance: 1,    // 性能数据100%采样
    errors: 1,         // 错误数据100%采样
    behavior: 0.1,     // 行为数据10%采样
    replay: 0.01       // 重放数据1%采样
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
  }
};
```

## 使用示例

### 基础初始化

```typescript
import { Monitor } from '@fe-monitor/sdk';

// 初始化SDK
const monitor = Monitor.init({
  appId: 'your-app-id',
  apiKey: 'your-api-key', 
  endpoint: 'https://api.monitor.com/events',
  features: {
    performance: true,
    errors: true,
    behavior: true,
    replay: false
  },
  debug: true // 开发环境开启调试
});

// 设置用户信息
monitor.setUser('user-123', {
  name: 'John Doe',
  email: 'john@example.com'
});

// 手动追踪事件
monitor.track('button_click', {
  buttonName: 'signup',
  page: 'homepage'
});

// 手动捕获错误
try {
  // 业务逻辑
} catch (error) {
  monitor.captureException(error, {
    action: 'user_signup',
    step: 'validate_form'
  });
}
```

### 高级配置

```typescript
// 自定义采样策略
const monitor = Monitor.init({
  appId: 'your-app-id',
  apiKey: 'your-api-key',
  endpoint: 'https://api.monitor.com/events',
  
  // 只在生产环境启用某些功能
  features: {
    performance: true,
    errors: true,
    behavior: process.env.NODE_ENV === 'production',
    replay: false
  },
  
  // 针对不同事件类型的采样率
  sampling: {
    performance: 1.0,    // 性能数据全量采集
    errors: 1.0,         // 错误数据全量采集
    behavior: 0.1,       // 行为数据10%采样
    replay: 0.01         // 重放数据1%采样
  },
  
  // 隐私保护配置
  privacy: {
    maskSensitiveData: true,
    blockedElements: [
      'input[type="password"]',
      '.sensitive-data',
      '[data-sensitive]'
    ]
  }
});
```

## 性能优化策略

### 1. 内存管理
- 错误缓冲区限制：最多存储100个错误事件
- 事件队列限制：最多存储1000个事件
- 失败事件存储限制：最多存储1000个失败事件

### 2. 网络优化
- 批量发送：默认每批50个事件
- 数据压缩：支持gzip压缩
- 失败重试：最多重试3次，指数退避
- Beacon发送：页面卸载时使用Beacon API确保数据不丢失

### 3. 采样策略
- 不同事件类型支持不同采样率
- 支持基于错误严重程度的智能采样
- 支持基于性能阈值的采样

### 4. 防抖节流
- 错误事件：1秒内去重发送
- 其他事件：5秒间隔批量发送
- 用户行为：滚动250ms节流，输入500ms防抖

## 扩展性设计

### 插件系统

```typescript
export interface Plugin {
  name: string;
  version: string;
  install(sdk: MonitorSDK): void;
  uninstall?(): void;
}

// 使用插件
const customPlugin: Plugin = {
  name: 'custom-tracker',
  version: '1.0.0',
  install(sdk) {
    // 插件逻辑
    sdk.on('error', (event) => {
      // 自定义错误处理
    });
  }
};

monitor.use(customPlugin);
```

### 事件监听系统

```typescript
// 监听SDK事件
monitor.on('start', (data) => {
  console.log('SDK started:', data);
});

monitor.on('error', (event) => {
  console.log('Error captured:', event);
});

monitor.on('track', (data) => {
  console.log('Event tracked:', data);
});
```

这个前端监控系统通过模块化设计、多层错误捕获、智能数据处理和可靠传输机制，为生产环境提供了企业级的前端监控解决方案。整个系统具有良好的扩展性、可配置性和性能优化，能够满足大规模Web应用的监控需求。