# 前端监控系统架构设计文档

## 1. 系统概述

### 1.1 设计目标
- 构建企业级前端监控系统，支持高并发、低延迟的数据处理
- 提供实时性能监控、错误追踪、用户行为分析和智能告警
- 支持每日10亿+事件处理，99.9%系统可用性
- 轻量级SDK设计，不影响前端应用性能

### 1.2 核心指标
- **数据处理能力**: 100万事件/秒
- **查询响应时间**: 95%查询 < 2秒
- **告警延迟**: < 1分钟
- **SDK体积**: < 50KB (gzipped)
- **存储成本**: < $50/TB/月

## 2. 整体架构

### 2.1 架构图
```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────────┐
│   Browser   │───→│  Data Gateway │───→│ Message Queue│───→│ Processing   │
│   (SDK)     │    │   (Nginx)    │    │   (Kafka)   │    │   (Flink)    │
└─────────────┘    └──────────────┘    └─────────────┘    └──────────────┘
                                                                    │
┌─────────────┐    ┌──────────────┐    ┌─────────────┐            │
│  Dashboard  │←───│  API Service │←───│  Storage    │←───────────┘
│   (React)   │    │  (GraphQL)   │    │   Layer     │
└─────────────┘    └──────────────┘    └─────────────┘
                                              │
                           ┌──────────────────┼──────────────────┐
                           │                  │                  │
                    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
                    │  InfluxDB   │  │Elasticsearch│  │ PostgreSQL  │
                    │(时序数据)    │  │  (日志数据)  │  │ (元数据)    │
                    └─────────────┘  └─────────────┘  └─────────────┘
```

### 2.2 核心组件

#### 2.2.1 数据收集层
- **前端SDK**: 轻量级JavaScript库，负责数据采集
- **数据网关**: 基于Nginx的高性能接入层
- **数据预处理**: 压缩、去重、格式化

#### 2.2.2 数据传输层
- **消息队列**: Apache Kafka集群
- **分区策略**: 按app_id + 时间分区
- **容错机制**: 数据备份和自动恢复

#### 2.2.3 数据处理层
- **流处理**: Apache Flink实时计算
- **批处理**: Apache Spark离线分析
- **数据聚合**: 多维度指标统计

#### 2.2.4 存储层
- **时序数据**: InfluxDB存储性能指标
- **日志数据**: Elasticsearch存储错误和行为日志
- **关系数据**: PostgreSQL存储配置和元数据
- **文件存储**: MinIO存储会话重放文件

#### 2.2.5 服务层
- **API网关**: GraphQL + REST API
- **实时通信**: WebSocket推送
- **缓存层**: Redis集群

#### 2.2.6 展示层
- **前端仪表板**: React + Redux
- **数据可视化**: Echarts + D3.js
- **移动端**: 响应式设计

## 3. 数据流设计

### 3.1 数据采集流程
```
页面加载 → SDK初始化 → 性能指标采集 → 事件上报 → 网关接收 → 队列缓存
    ↓
用户交互 → 行为数据采集 → 批量上报 → 数据验证 → 实时处理 → 存储持久化
    ↓  
异常发生 → 错误捕获 → 立即上报 → 告警触发 → 通知发送 → 问题跟踪
```

### 3.2 数据模型

#### 3.2.1 事件基础结构
```typescript
interface BaseEvent {
  eventId: string;          // 事件唯一ID
  appId: string;           // 应用ID
  sessionId: string;       // 会话ID
  userId?: string;         // 用户ID
  timestamp: number;       // 时间戳
  pageUrl: string;         // 页面URL
  userAgent: string;       // 用户代理
  deviceInfo: DeviceInfo;  // 设备信息
  geoInfo?: GeoInfo;       // 地理信息
}
```

#### 3.2.2 性能事件
```typescript
interface PerformanceEvent extends BaseEvent {
  type: 'performance';
  metrics: {
    // Core Web Vitals
    lcp?: number;          // Largest Contentful Paint
    fid?: number;          // First Input Delay
    cls?: number;          // Cumulative Layout Shift
    fcp?: number;          // First Contentful Paint
    ttfb?: number;         // Time to First Byte
    
    // 页面性能
    pageLoadTime: number;   // 页面加载时间
    domReadyTime: number;   // DOM就绪时间
    resourceLoadTime: number; // 资源加载时间
    
    // 自定义指标
    customMetrics?: Record<string, number>;
  };
  resources?: ResourceTiming[]; // 资源加载详情
}
```

#### 3.2.3 错误事件
```typescript
interface ErrorEvent extends BaseEvent {
  type: 'error';
  errorType: 'javascript' | 'network' | 'custom';
  message: string;         // 错误消息
  stackTrace?: string;     // 堆栈跟踪
  lineNumber?: number;     // 行号
  columnNumber?: number;   // 列号
  fileName?: string;       // 文件名
  severity: 'low' | 'medium' | 'high' | 'critical';
  context?: Record<string, any>; // 上下文信息
}
```

#### 3.2.4 行为事件
```typescript
interface BehaviorEvent extends BaseEvent {
  type: 'behavior';
  action: 'click' | 'scroll' | 'input' | 'navigate' | 'custom';
  target?: string;         // 目标元素
  value?: any;            // 操作值
  coordinates?: {         // 坐标信息
    x: number;
    y: number;
  };
  duration?: number;      // 持续时间
}
```

## 4. 存储设计

### 4.1 存储分层策略

#### 4.1.1 热数据存储 (InfluxDB)
```sql
-- 性能指标表 (保留7天)
CREATE MEASUREMENT performance_metrics (
  time TIMESTAMP,
  app_id TAG,
  page_url TAG,
  country TAG,
  
  lcp FIELD FLOAT,
  fid FIELD FLOAT,
  cls FIELD FLOAT,
  page_load_time FIELD FLOAT,
  user_count FIELD INTEGER
) WITH DURATION 7d;

-- 错误统计表 (保留30天)
CREATE MEASUREMENT error_stats (
  time TIMESTAMP,
  app_id TAG,
  error_type TAG,
  
  error_count FIELD INTEGER,
  error_rate FIELD FLOAT,
  affected_users FIELD INTEGER
) WITH DURATION 30d;
```

#### 4.1.2 温数据存储 (Elasticsearch)
```json
{
  "mappings": {
    "properties": {
      "timestamp": {"type": "date"},
      "app_id": {"type": "keyword"},
      "session_id": {"type": "keyword"},
      "event_type": {"type": "keyword"},
      "message": {"type": "text", "analyzer": "standard"},
      "stack_trace": {"type": "text"},
      "tags": {"type": "object"},
      "geo_location": {"type": "geo_point"}
    }
  },
  "settings": {
    "number_of_shards": 6,
    "number_of_replicas": 1,
    "index.lifecycle.name": "monitor-policy",
    "index.lifecycle.rollover_alias": "monitor-logs"
  }
}
```

#### 4.1.3 冷数据存储 (PostgreSQL)
```sql
-- 应用配置表
CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255) NOT NULL,
  api_key VARCHAR(255) UNIQUE NOT NULL,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 告警规则表
CREATE TABLE alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID REFERENCES applications(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  metric_type VARCHAR(100) NOT NULL,
  threshold_config JSONB NOT NULL,
  notification_config JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 用户会话聚合表 (按小时聚合)
CREATE TABLE session_aggregates (
  id BIGSERIAL PRIMARY KEY,
  app_id UUID REFERENCES applications(id),
  time_bucket TIMESTAMP NOT NULL,
  total_sessions INTEGER DEFAULT 0,
  total_page_views INTEGER DEFAULT 0,
  avg_session_duration REAL DEFAULT 0,
  bounce_rate REAL DEFAULT 0,
  
  UNIQUE(app_id, time_bucket)
);

-- 创建分区表 (按月分区)
CREATE TABLE error_events (
  id BIGSERIAL,
  app_id UUID NOT NULL,
  event_time TIMESTAMP NOT NULL,
  error_data JSONB NOT NULL,
  PRIMARY KEY (id, event_time)
) PARTITION BY RANGE (event_time);

-- 创建月度分区
CREATE TABLE error_events_2024_01 PARTITION OF error_events 
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
```

### 4.2 数据保留策略
```yaml
retention_policies:
  # 原始数据
  raw_events: 7d
  error_logs: 90d
  behavior_logs: 30d
  
  # 聚合数据
  metrics_1min: 30d
  metrics_1hour: 180d
  metrics_1day: 2y
  
  # 文件数据
  session_replays: 30d
  screenshots: 14d
  
  # 元数据
  user_sessions: 1y
  alert_history: 1y
```

## 5. 实时处理设计

### 5.1 Flink流处理架构
```java
public class MonitoringStreamJob {
    public static void main(String[] args) throws Exception {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        
        // 配置检查点
        env.enableCheckpointing(60000); // 1分钟
        env.getCheckpointConfig().setCheckpointingMode(CheckpointingMode.EXACTLY_ONCE);
        
        // 数据源
        DataStream<String> kafkaStream = env
            .addSource(new FlinkKafkaConsumer<>(
                "monitor-events", 
                new SimpleStringSchema(), 
                kafkaProps))
            .name("kafka-source");
        
        // 数据解析和验证
        DataStream<MonitorEvent> eventStream = kafkaStream
            .map(new EventParser())
            .filter(new EventValidator())
            .name("parse-and-validate");
        
        // 性能指标处理
        eventStream
            .filter(event -> event.getType() == EventType.PERFORMANCE)
            .keyBy(event -> event.getAppId())
            .window(TumblingEventTimeWindows.of(Time.minutes(1)))
            .aggregate(new PerformanceAggregator())
            .addSink(new InfluxDBSink())
            .name("performance-aggregation");
        
        // 错误告警处理
        eventStream
            .filter(event -> event.getType() == EventType.ERROR)
            .keyBy(event -> event.getAppId())
            .process(new ErrorAlertFunction())
            .addSink(new AlertSink())
            .name("error-alerting");
        
        // 用户会话分析
        eventStream
            .filter(event -> event.getSessionId() != null)
            .keyBy(event -> event.getSessionId())
            .process(new SessionAnalysisFunction())
            .addSink(new SessionSink())
            .name("session-analysis");
        
        env.execute("Frontend Monitoring Stream Processing");
    }
}
```

### 5.2 性能指标聚合器
```java
public class PerformanceAggregator implements AggregateFunction<
    MonitorEvent, PerformanceAccumulator, PerformanceMetrics> {
    
    @Override
    public PerformanceAccumulator createAccumulator() {
        return new PerformanceAccumulator();
    }
    
    @Override
    public PerformanceAccumulator add(MonitorEvent event, PerformanceAccumulator acc) {
        if (event.getType() == EventType.PERFORMANCE) {
            acc.addPageLoadTime(event.getMetrics().getPageLoadTime());
            acc.addLCP(event.getMetrics().getLcp());
            acc.addFID(event.getMetrics().getFid());
            acc.addCLS(event.getMetrics().getCls());
            acc.incrementCount();
        }
        return acc;
    }
    
    @Override
    public PerformanceMetrics getResult(PerformanceAccumulator acc) {
        return PerformanceMetrics.builder()
            .appId(acc.getAppId())
            .timestamp(acc.getWindowEnd())
            .avgPageLoadTime(acc.getAvgPageLoadTime())
            .p95PageLoadTime(acc.getP95PageLoadTime())
            .avgLCP(acc.getAvgLCP())
            .avgFID(acc.getAvgFID())
            .avgCLS(acc.getAvgCLS())
            .totalPageViews(acc.getCount())
            .build();
    }
    
    @Override
    public PerformanceAccumulator merge(PerformanceAccumulator a, PerformanceAccumulator b) {
        return a.merge(b);
    }
}
```

### 5.3 错误告警处理
```java
public class ErrorAlertFunction extends KeyedProcessFunction<String, MonitorEvent, AlertEvent> {
    
    private transient ValueState<ErrorState> errorState;
    private transient MapState<String, Long> errorCounts;
    
    @Override
    public void open(Configuration parameters) {
        ValueStateDescriptor<ErrorState> errorStateDesc = 
            new ValueStateDescriptor<>("error-state", ErrorState.class);
        errorState = getRuntimeContext().getState(errorStateDesc);
        
        MapStateDescriptor<String, Long> errorCountsDesc = 
            new MapStateDescriptor<>("error-counts", String.class, Long.class);
        errorCounts = getRuntimeContext().getMapState(errorCountsDesc);
    }
    
    @Override
    public void processElement(MonitorEvent event, Context ctx, Collector<AlertEvent> out) 
            throws Exception {
        
        if (event.getType() != EventType.ERROR) return;
        
        String errorKey = generateErrorKey(event);
        Long currentCount = errorCounts.get(errorKey);
        if (currentCount == null) currentCount = 0L;
        
        errorCounts.put(errorKey, currentCount + 1);
        
        // 检查告警阈值
        AlertRule rule = getAlertRule(event.getAppId(), errorKey);
        if (rule != null && shouldTriggerAlert(rule, currentCount + 1)) {
            AlertEvent alert = AlertEvent.builder()
                .appId(event.getAppId())
                .ruleId(rule.getId())
                .severity(rule.getSeverity())
                .message(buildAlertMessage(event, currentCount + 1))
                .timestamp(ctx.timestamp())
                .build();
            
            out.collect(alert);
        }
        
        // 设置清理定时器 (1小时后清理计数)
        ctx.timerService().registerEventTimeTimer(ctx.timestamp() + 3600000);
    }
    
    @Override
    public void onTimer(long timestamp, OnTimerContext ctx, Collector<AlertEvent> out) 
            throws Exception {
        // 清理过期的错误计数
        errorCounts.clear();
    }
}
```

## 6. API设计

### 6.1 GraphQL Schema
```graphql
scalar DateTime
scalar JSON

type Query {
  # 应用管理
  application(id: ID!): Application
  applications(filter: ApplicationFilter): [Application!]!
  
  # 性能监控
  performanceMetrics(input: PerformanceQueryInput!): PerformanceMetrics!
  performanceTrends(input: TrendQueryInput!): [PerformanceDataPoint!]!
  
  # 错误监控
  errors(input: ErrorQueryInput!): ErrorConnection!
  errorDetails(id: ID!): ErrorDetails
  errorStats(input: ErrorStatsInput!): ErrorStats!
  
  # 用户会话
  sessions(input: SessionQueryInput!): SessionConnection!
  sessionDetails(id: ID!): SessionDetails
  sessionReplay(id: ID!): SessionReplay
  
  # 告警管理
  alertRules(appId: ID!): [AlertRule!]!
  alertHistory(input: AlertHistoryInput!): AlertConnection!
}

type Mutation {
  # 应用管理
  createApplication(input: CreateApplicationInput!): Application!
  updateApplication(id: ID!, input: UpdateApplicationInput!): Application!
  deleteApplication(id: ID!): Boolean!
  
  # 告警规则
  createAlertRule(input: CreateAlertRuleInput!): AlertRule!
  updateAlertRule(id: ID!, input: UpdateAlertRuleInput!): AlertRule!
  deleteAlertRule(id: ID!): Boolean!
  
  # 告警操作
  acknowledgeAlert(id: ID!): Alert!
  resolveAlert(id: ID!, resolution: String): Alert!
}

type Subscription {
  # 实时数据
  performanceUpdates(appId: ID!): PerformanceMetrics!
  newErrors(appId: ID!): ErrorEvent!
  alertTriggered(appId: ID!): Alert!
}

# 类型定义
type Application {
  id: ID!
  name: String!
  domain: String!
  apiKey: String!
  settings: JSON!
  createdAt: DateTime!
  updatedAt: DateTime!
}

type PerformanceMetrics {
  appId: ID!
  timeRange: TimeRange!
  summary: PerformanceSummary!
  dataPoints: [PerformanceDataPoint!]!
  breakdown: PerformanceBreakdown!
}

type PerformanceDataPoint {
  timestamp: DateTime!
  pageLoadTime: Float!
  lcp: Float
  fid: Float
  cls: Float
  pageViews: Int!
}

type ErrorEvent {
  id: ID!
  appId: ID!
  message: String!
  type: ErrorType!
  severity: Severity!
  stackTrace: String
  firstSeen: DateTime!
  lastSeen: DateTime!
  count: Int!
  affectedUsers: Int!
  resolved: Boolean!
}

type SessionDetails {
  id: ID!
  userId: String
  startTime: DateTime!
  endTime: DateTime
  duration: Int
  pageViews: Int!
  events: [BehaviorEvent!]!
  deviceInfo: DeviceInfo!
  geoInfo: GeoInfo
}

type AlertRule {
  id: ID!
  appId: ID!
  name: String!
  metric: MetricConfig!
  condition: ConditionConfig!
  notifications: NotificationConfig!
  enabled: Boolean!
}

# 输入类型
input PerformanceQueryInput {
  appId: ID!
  timeRange: TimeRangeInput!
  granularity: Granularity = MINUTE_1
  filters: PerformanceFilters
}

input ErrorQueryInput {
  appId: ID!
  timeRange: TimeRangeInput
  severity: [Severity!]
  type: [ErrorType!]
  resolved: Boolean
  pagination: PaginationInput
}

input CreateAlertRuleInput {
  appId: ID!
  name: String!
  metric: MetricConfigInput!
  condition: ConditionConfigInput!
  notifications: NotificationConfigInput!
}

# 枚举类型
enum Granularity {
  MINUTE_1
  MINUTE_5
  HOUR_1
  DAY_1
}

enum ErrorType {
  JAVASCRIPT
  NETWORK
  CUSTOM
}

enum Severity {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}
```

### 6.2 REST API端点

#### 6.2.1 数据上报API
```typescript
// POST /api/v1/collect
interface CollectRequest {
  events: MonitorEvent[];
  compressed?: boolean;
}

interface CollectResponse {
  received: number;
  processed: number;
  errors?: string[];
}
```

#### 6.2.2 查询API
```typescript
// GET /api/v1/apps/{appId}/performance/overview
interface PerformanceOverviewResponse {
  summary: {
    avgPageLoadTime: number;
    p95PageLoadTime: number;
    totalPageViews: number;
    bounceRate: number;
  };
  trends: {
    pageLoadTime: TimeSeriesData[];
    coreWebVitals: TimeSeriesData[];
  };
  topPages: {
    url: string;
    avgLoadTime: number;
    pageViews: number;
  }[];
}

// GET /api/v1/apps/{appId}/errors
interface ErrorListResponse {
  errors: {
    id: string;
    message: string;
    type: string;
    severity: string;
    count: number;
    firstSeen: string;
    lastSeen: string;
    affectedUsers: number;
  }[];
  pagination: PaginationInfo;
  filters: {
    types: string[];
    severities: string[];
    timeRanges: string[];
  };
}
```

### 6.3 WebSocket实时推送
```typescript
// 连接: wss://api.monitor.com/ws/v1/realtime
interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'data' | 'error';
  payload: any;
}

// 订阅消息
interface SubscribeMessage {
  type: 'subscribe';
  payload: {
    appId: string;
    channels: ('performance' | 'errors' | 'alerts')[];
    filters?: {
      severity?: string[];
      pages?: string[];
    };
  };
}

// 数据推送
interface DataMessage {
  type: 'data';
  payload: {
    channel: string;
    timestamp: number;
    data: any;
  };
}
```

## 7. 部署架构

### 7.1 Kubernetes部署清单
```yaml
# 命名空间
apiVersion: v1
kind: Namespace
metadata:
  name: fe-monitor

---
# ConfigMap
apiVersion: v1
kind: ConfigMap
metadata:
  name: monitor-config
  namespace: fe-monitor
data:
  database.url: "postgresql://monitor:password@postgres:5432/monitor"
  redis.url: "redis://redis:6379"
  kafka.brokers: "kafka:9092"
  influxdb.url: "http://influxdb:8086"

---
# 数据网关部署
apiVersion: apps/v1
kind: Deployment
metadata:
  name: data-gateway
  namespace: fe-monitor
spec:
  replicas: 3
  selector:
    matchLabels:
      app: data-gateway
  template:
    metadata:
      labels:
        app: data-gateway
    spec:
      containers:
      - name: nginx
        image: nginx:1.21
        ports:
        - containerPort: 80
        resources:
          requests:
            cpu: 500m
            memory: 1Gi
          limits:
            cpu: 1000m
            memory: 2Gi
        volumeMounts:
        - name: nginx-config
          mountPath: /etc/nginx/conf.d
      volumes:
      - name: nginx-config
        configMap:
          name: nginx-config

---
# API服务部署
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-service
  namespace: fe-monitor
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-service
  template:
    metadata:
      labels:
        app: api-service
    spec:
      containers:
      - name: api
        image: fe-monitor/api:latest
        ports:
        - containerPort: 8080
        env:
        - name: DATABASE_URL
          valueFrom:
            configMapKeyRef:
              name: monitor-config
              key: database.url
        - name: REDIS_URL
          valueFrom:
            configMapKeyRef:
              name: monitor-config
              key: redis.url
        resources:
          requests:
            cpu: 500m
            memory: 1Gi
          limits:
            cpu: 1000m
            memory: 2Gi
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5

---
# 流处理作业部署
apiVersion: apps/v1
kind: Deployment
metadata:
  name: stream-processor
  namespace: fe-monitor
spec:
  replicas: 2
  selector:
    matchLabels:
      app: stream-processor
  template:
    metadata:
      labels:
        app: stream-processor
    spec:
      containers:
      - name: flink
        image: fe-monitor/flink-job:latest
        env:
        - name: KAFKA_BROKERS
          valueFrom:
            configMapKeyRef:
              name: monitor-config
              key: kafka.brokers
        - name: INFLUXDB_URL
          valueFrom:
            configMapKeyRef:
              name: monitor-config
              key: influxdb.url
        resources:
          requests:
            cpu: 1000m
            memory: 2Gi
          limits:
            cpu: 2000m
            memory: 4Gi

---
# Service定义
apiVersion: v1
kind: Service
metadata:
  name: data-gateway-service
  namespace: fe-monitor
spec:
  selector:
    app: data-gateway
  ports:
  - port: 80
    targetPort: 80
  type: LoadBalancer

---
apiVersion: v1
kind: Service
metadata:
  name: api-service
  namespace: fe-monitor
spec:
  selector:
    app: api-service
  ports:
  - port: 8080
    targetPort: 8080
  type: ClusterIP

---
# HPA自动扩缩容
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-service-hpa
  namespace: fe-monitor
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-service
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### 7.2 监控配置
```yaml
# Prometheus配置
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-config
data:
  prometheus.yml: |
    global:
      scrape_interval: 15s
    
    scrape_configs:
    - job_name: 'fe-monitor-api'
      static_configs:
      - targets: ['api-service:8080']
      metrics_path: /metrics
      
    - job_name: 'fe-monitor-gateway'
      static_configs:
      - targets: ['data-gateway-service:80']
      metrics_path: /nginx-metrics
      
    - job_name: 'kafka'
      static_configs:
      - targets: ['kafka:9092']
      
    - job_name: 'postgres'
      static_configs:
      - targets: ['postgres:5432']

---
# Grafana仪表板配置
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-dashboards
data:
  fe-monitor-overview.json: |
    {
      "dashboard": {
        "title": "Frontend Monitor Overview",
        "panels": [
          {
            "title": "Events Per Second",
            "type": "graph",
            "targets": [
              {
                "expr": "rate(monitor_events_total[5m])",
                "legendFormat": "Events/sec"
              }
            ]
          },
          {
            "title": "API Response Time",
            "type": "graph", 
            "targets": [
              {
                "expr": "histogram_quantile(0.95, rate(api_request_duration_seconds_bucket[5m]))",
                "legendFormat": "95th percentile"
              }
            ]
          }
        ]
      }
    }
```

## 8. 性能优化

### 8.1 数据库优化
```sql
-- 创建复合索引
CREATE INDEX CONCURRENTLY idx_performance_app_time 
ON performance_metrics (app_id, time DESC);

CREATE INDEX CONCURRENTLY idx_errors_app_severity_time 
ON error_events (app_id, severity, event_time DESC);

-- 分区表优化
CREATE INDEX idx_error_events_app_time_local 
ON error_events_2024_01 (app_id, event_time);

-- 物化视图
CREATE MATERIALIZED VIEW daily_performance_summary AS
SELECT 
  app_id,
  DATE(time) as date,
  AVG(page_load_time) as avg_load_time,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY page_load_time) as p95_load_time,
  COUNT(*) as page_views
FROM performance_metrics 
WHERE time >= NOW() - INTERVAL '30 days'
GROUP BY app_id, DATE(time);

-- 自动刷新物化视图
CREATE OR REPLACE FUNCTION refresh_daily_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY daily_performance_summary;
END;
$$ LANGUAGE plpgsql;

-- 定时任务
SELECT cron.schedule('refresh-summary', '0 1 * * *', 'SELECT refresh_daily_summary();');
```

### 8.2 缓存策略
```typescript
// Redis缓存配置
class CacheService {
  private redis: Redis;
  
  // 多级缓存
  async getPerformanceMetrics(appId: string, timeRange: TimeRange): Promise<PerformanceMetrics> {
    const cacheKey = `perf:${appId}:${timeRange.start}:${timeRange.end}`;
    
    // L1: 内存缓存 (5分钟)
    let data = this.memoryCache.get(cacheKey);
    if (data) return data;
    
    // L2: Redis缓存 (1小时)
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      data = JSON.parse(cached);
      this.memoryCache.set(cacheKey, data, 300); // 5分钟
      return data;
    }
    
    // L3: 数据库查询
    data = await this.queryDatabase(appId, timeRange);
    
    // 缓存结果
    await this.redis.setex(cacheKey, 3600, JSON.stringify(data)); // 1小时
    this.memoryCache.set(cacheKey, data, 300); // 5分钟
    
    return data;
  }
  
  // 缓存预热
  async warmupCache(appId: string) {
    const timeRanges = [
      { start: moment().subtract(1, 'hour'), end: moment() },
      { start: moment().subtract(1, 'day'), end: moment() },
      { start: moment().subtract(7, 'days'), end: moment() }
    ];
    
    const promises = timeRanges.map(range => 
      this.getPerformanceMetrics(appId, range)
    );
    
    await Promise.all(promises);
  }
}
```

### 8.3 查询优化
```typescript
// 数据聚合优化
class PerformanceQueryService {
  // 使用预聚合数据
  async getHourlyMetrics(appId: string, days: number): Promise<TimeSeriesData[]> {
    if (days <= 1) {
      // 使用实时数据 (分钟级别)
      return this.queryRealTimeMetrics(appId, days);
    } else if (days <= 30) {
      // 使用小时聚合数据
      return this.queryHourlyAggregates(appId, days);
    } else {
      // 使用日聚合数据
      return this.queryDailyAggregates(appId, days);
    }
  }
  
  // 批量查询优化
  async getMultiAppMetrics(appIds: string[], timeRange: TimeRange): Promise<Map<string, PerformanceMetrics>> {
    const query = `
      SELECT app_id, 
             AVG(page_load_time) as avg_load_time,
             PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY page_load_time) as p95_load_time,
             COUNT(*) as page_views
      FROM performance_metrics 
      WHERE app_id = ANY($1) 
        AND time BETWEEN $2 AND $3
      GROUP BY app_id
    `;
    
    const results = await this.db.query(query, [appIds, timeRange.start, timeRange.end]);
    return new Map(results.rows.map(row => [row.app_id, row]));
  }
  
  // 流式查询大数据集
  async streamLargeDataset(appId: string, timeRange: TimeRange): Promise<AsyncIterable<DataPoint>> {
    const query = `
      SELECT time, page_load_time, lcp, fid, cls
      FROM performance_metrics 
      WHERE app_id = $1 AND time BETWEEN $2 AND $3
      ORDER BY time
    `;
    
    return this.db.streamQuery(query, [appId, timeRange.start, timeRange.end], {
      batchSize: 1000
    });
  }
}
```

这份系统设计文档涵盖了前端监控系统的核心架构、数据模型、存储设计、实时处理、API设计和部署策略。文档提供了详细的技术实现方案和优化策略，为系统开发提供了完整的技术指导。