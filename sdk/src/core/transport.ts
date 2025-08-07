/**
 * 数据传输模块
 */

import { MonitorEvent, Transport, Storage } from '../types';
import { retry, logger, safeJsonStringify, compressData } from '../utils';

export interface TransportConfig {
  endpoint: string;
  apiKey: string;
  timeout?: number;
  maxRetries?: number;
  batchSize?: number;
  flushInterval?: number;
  enableCompression?: boolean;
}

export class HTTPTransport implements Transport {
  private config: Required<TransportConfig>;
  private storage: Storage;

  constructor(config: TransportConfig, storage: Storage) {
    this.config = {
      timeout: 10000,
      maxRetries: 3,
      batchSize: 50,
      flushInterval: 5000,
      enableCompression: true,
      ...config
    };
    this.storage = storage;
  }

  configure(config: Partial<TransportConfig>): void {
    this.config = { ...this.config, ...config };
  }

  async send(events: MonitorEvent[]): Promise<void> {
    if (events.length === 0) return;

    const batches = this.createBatches(events);
    const promises = batches.map(batch => this.sendBatch(batch));
    
    await Promise.allSettled(promises);
  }

  private createBatches(events: MonitorEvent[]): MonitorEvent[][] {
    const batches: MonitorEvent[][] = [];
    for (let i = 0; i < events.length; i += this.config.batchSize) {
      batches.push(events.slice(i, i + this.config.batchSize));
    }
    return batches;
  }

  private async sendBatch(events: MonitorEvent[]): Promise<void> {
    try {
      await retry(
        () => this.performRequest(events),
        this.config.maxRetries,
        1000
      );
      
      logger.debug(`Successfully sent batch of ${events.length} events`);
    } catch (error) {
      logger.error('Failed to send batch after retries:', error);
      // 存储失败的事件以供后续重试
      this.storeFailedEvents(events);
      throw error;
    }
  }

  private async performRequest(events: MonitorEvent[]): Promise<void> {
    const payload = {
      events,
      timestamp: Date.now(),
      sdk_version: '1.0.0'
    };

    let body = safeJsonStringify(payload);
    
    if (this.config.enableCompression) {
      body = compressData(payload);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
      'X-SDK-Version': '1.0.0'
    };

    if (this.config.enableCompression) {
      headers['Content-Encoding'] = 'gzip';
    }

    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(this.config.timeout)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  }

  private storeFailedEvents(events: MonitorEvent[]): void {
    try {
      const existingEvents = this.getStoredFailedEvents();
      const allEvents = [...existingEvents, ...events];
      
      // 限制存储的事件数量
      const maxStoredEvents = 1000;
      const eventsToStore = allEvents.slice(-maxStoredEvents);
      
      this.storage.setItem('failed_events', safeJsonStringify(eventsToStore));
      logger.debug(`Stored ${events.length} failed events`);
    } catch (error) {
      logger.error('Failed to store failed events:', error);
    }
  }

  private getStoredFailedEvents(): MonitorEvent[] {
    try {
      const stored = this.storage.getItem('failed_events');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  // 重试发送失败的事件
  async retryFailedEvents(): Promise<void> {
    const failedEvents = this.getStoredFailedEvents();
    if (failedEvents.length === 0) return;

    try {
      await this.send(failedEvents);
      this.storage.removeItem('failed_events');
      logger.debug(`Successfully retried ${failedEvents.length} failed events`);
    } catch (error) {
      logger.error('Failed to retry failed events:', error);
    }
  }
}

// Beacon传输器（用于页面卸载时的数据发送）
export class BeaconTransport implements Transport {
  private config: TransportConfig;

  constructor(config: TransportConfig) {
    this.config = config;
  }

  configure(config: Partial<TransportConfig>): void {
    this.config = { ...this.config, ...config };
  }

  async send(events: MonitorEvent[]): Promise<void> {
    if (events.length === 0) return;
    if (typeof navigator.sendBeacon !== 'function') {
      throw new Error('Beacon API not supported');
    }

    const payload = {
      events,
      timestamp: Date.now(),
      sdk_version: '1.0.0'
    };

    const blob = new Blob([safeJsonStringify(payload)], {
      type: 'application/json'
    });

    const url = `${this.config.endpoint}?apiKey=${this.config.apiKey}`;
    const success = navigator.sendBeacon(url, blob);

    if (!success) {
      throw new Error('Beacon send failed');
    }

    logger.debug(`Sent ${events.length} events via Beacon`);
  }
}

// 队列管理器
export class EventQueue {
  private queue: MonitorEvent[] = [];
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  enqueue(event: MonitorEvent): void {
    if (this.queue.length >= this.maxSize) {
      // 移除最旧的事件
      this.queue.shift();
      logger.warn('Event queue full, dropping oldest event');
    }
    
    this.queue.push(event);
  }

  dequeue(): MonitorEvent | undefined {
    return this.queue.shift();
  }

  peek(): MonitorEvent | undefined {
    return this.queue[0];
  }

  size(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue = [];
  }

  toArray(): MonitorEvent[] {
    return this.queue.slice();
  }

  // 按类型获取事件
  getEventsByType(type: string): MonitorEvent[] {
    return this.queue.filter(event => event.type === type);
  }

  // 移除指定数量的事件
  drain(count?: number): MonitorEvent[] {
    if (count === undefined) {
      const events = this.queue.slice();
      this.queue = [];
      return events;
    }
    
    return this.queue.splice(0, count);
  }
}