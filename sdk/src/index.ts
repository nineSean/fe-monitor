/**
 * Frontend Monitor SDK
 * 企业级前端监控解决方案
 */

// 核心模块
export { MonitorSDK, Monitor } from './core';

// 类型定义
export {
  SDKConfig,
  MonitorEvent,
  PerformanceEvent,
  ErrorEvent,
  BehaviorEvent,
  ReplayEvent,
  PerformanceMetrics,
  DeviceInfo,
  GeoInfo,
  Plugin,
  EventHandler,
  Collector,
  Transport,
  Storage,
  EventQueue,
  MonitorError,
  EVENT_TYPES,
  ERROR_TYPES,
  SEVERITY_LEVELS
} from './types';

// 工具函数
export {
  generateId,
  generateSessionId,
  now,
  performanceNow,
  debounce,
  throttle,
  deepMerge,
  getElementPath,
  getDeviceInfo,
  getVisibilityState,
  isInIframe,
  parseStackTrace,
  generateErrorFingerprint,
  compressData,
  sanitizeData,
  safeJsonParse,
  safeJsonStringify,
  isValidUrl,
  getRelativeUrl,
  truncate,
  retry,
  browserSupport,
  Logger,
  logger
} from './utils';

// 模块导出
export { PerformanceCollector, PerformanceUtils } from './modules/performance';
export { ErrorCollector, ErrorUtils, NetworkErrorCollector } from './modules/error';
export { BehaviorCollector, SessionAnalyzer } from './modules/behavior';
export { SessionReplayCollector, ReplayCompressor, ReplayAnalyzer } from './modules/replay';

// 核心组件
export { DataCollector, SamplingManager } from './core/collector';
export { HTTPTransport, BeaconTransport, EventQueue as TransportEventQueue } from './core/transport';
export { MemoryStorage, LocalStorage, SessionStorage, PrefixedStorage, StorageFactory } from './core/storage';

// 版本信息
export const VERSION = '1.0.0';

// 默认导出
export default Monitor;