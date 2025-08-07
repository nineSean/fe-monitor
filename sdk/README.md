# Frontend Monitor SDK

企业级前端监控SDK，提供实时性能监控、错误追踪、用户行为分析和会话重放功能。

## 🚀 特性

- **📊 性能监控**: Core Web Vitals、页面加载时间、资源性能分析
- **🔍 错误追踪**: JavaScript异常、网络错误、Promise rejection
- **👤 行为分析**: 用户交互、页面访问路径、转化漏斗
- **📹 会话重放**: 完整用户操作录制和回放
- **⚡ 轻量级**: 核心库 < 50KB，模块化加载
- **🔒 隐私保护**: 敏感数据脱敏，符合GDPR
- **📦 易于集成**: 简单配置，开箱即用

## 📦 安装

```bash
npm install @fe-monitor/sdk
```

或者通过CDN:

```html
<script src="https://cdn.jsdelivr.net/npm/@fe-monitor/sdk@latest/dist/index.min.js"></script>
```

## 🏁 快速开始

### 基础配置

```javascript
import { Monitor } from '@fe-monitor/sdk';

Monitor.init({
  appId: 'your-app-id',
  apiKey: 'your-api-key', 
  endpoint: 'https://api.yourmonitor.com/collect',
  
  // 功能开关
  features: {
    performance: true,  // 性能监控
    errors: true,      // 错误追踪
    behavior: true,    // 行为分析
    replay: false      // 会话重放
  },
  
  // 采样配置
  sampling: {
    performance: 1,    // 100% 采样
    errors: 1,         // 100% 采样
    behavior: 0.1,     // 10% 采样
    replay: 0.01       // 1% 采样
  }
});
```

### HTML直接引入

```html
<script src="https://cdn.jsdelivr.net/npm/@fe-monitor/sdk@latest/dist/index.min.js"></script>
<script>
  Monitor.init({
    appId: 'your-app-id',
    apiKey: 'your-api-key',
    endpoint: 'https://api.yourmonitor.com/collect'
  });
</script>
```

## 📋 功能详解

### 性能监控

自动收集页面性能指标：

```javascript
// 自动收集 Core Web Vitals
// - LCP (Largest Contentful Paint)
// - FID (First Input Delay) 
// - CLS (Cumulative Layout Shift)
// - FCP (First Contentful Paint)
// - TTFB (Time to First Byte)

// 手动性能标记
Monitor.mark('api-call-start');
// ... API调用
Monitor.mark('api-call-end');
Monitor.measure('api-call-duration', 'api-call-start', 'api-call-end');
```

### 错误追踪

自动捕获各类错误：

```javascript
// 自动捕获 JavaScript 错误、Promise rejection、网络错误

// 手动错误上报
try {
  // 可能出错的代码
} catch (error) {
  Monitor.captureException(error, {
    context: 'user-action',
    userId: 'user-123'
  });
}

// 自定义消息
Monitor.captureMessage('Custom log message', 'info', {
  module: 'payment'
});
```

### 用户行为追踪

```javascript
// 自动追踪用户交互（点击、滚动、输入等）

// 手动追踪自定义事件
Monitor.track('button_click', {
  buttonId: 'checkout',
  page: '/cart',
  userType: 'premium'
});

// 设置用户信息
Monitor.setUser('user-123', {
  email: 'user@example.com',
  plan: 'premium'
});
```

### 会话重放

```javascript
// 开启会话重放
Monitor.init({
  // ... 其他配置
  features: {
    replay: true
  },
  sampling: {
    replay: 0.1  // 10%采样
  }
});

// 手动控制录制
const sdk = Monitor.getInstance();
sdk.startReplay();  // 开始录制
sdk.stopReplay();   // 停止录制
```

## ⚙️ 高级配置

### 完整配置选项

```javascript
Monitor.init({
  appId: 'your-app-id',
  apiKey: 'your-api-key',
  endpoint: 'https://api.yourmonitor.com/collect',
  
  // 功能开关
  features: {
    performance: true,
    errors: true,
    behavior: true,
    replay: false
  },
  
  // 采样配置
  sampling: {
    performance: 1,
    errors: 1,
    behavior: 0.1,
    replay: 0.01
  },
  
  // 数据上报配置
  reporting: {
    batchSize: 50,        // 批量上报大小
    flushInterval: 5000,  // 上报间隔(ms)
    maxRetries: 3,        // 最大重试次数
    timeout: 10000        // 请求超时时间
  },
  
  // 隐私配置
  privacy: {
    maskSensitiveData: true,           // 脱敏敏感数据
    allowedDomains: ['*.example.com'], // 允许的域名
    blockedElements: ['.sensitive']    // 屏蔽的元素
  },
  
  // 调试配置
  debug: false,
  environment: 'production'
});
```

### 事件监听

```javascript
const sdk = Monitor.getInstance();

// 监听SDK事件
sdk.on('start', (data) => {
  console.log('SDK started:', data);
});

sdk.on('error', (error) => {
  console.log('SDK error:', error);
});

sdk.on('track', (event) => {
  console.log('Event tracked:', event);
});
```

### 插件系统

```javascript
// 自定义插件
const customPlugin = {
  name: 'custom-plugin',
  version: '1.0.0',
  install(sdk) {
    // 插件初始化逻辑
    sdk.on('track', (event) => {
      // 处理追踪事件
    });
  },
  uninstall() {
    // 清理逻辑
  }
};

// 安装插件
const sdk = Monitor.getInstance();
sdk.use(customPlugin);
```

## 🔧 开发

### 环境要求

- Node.js >= 14
- TypeScript >= 4.5

### 开发设置

```bash
# 克隆仓库
git clone <repository-url>
cd fe-monitor/sdk

# 安装依赖
npm install

# 开发模式
npm run dev

# 运行测试
npm test

# 代码检查
npm run lint

# 类型检查
npm run type-check

# 构建
npm run build
```

### 项目结构

```
sdk/
├── src/
│   ├── core/           # 核心模块
│   ├── modules/        # 功能模块
│   ├── types/          # 类型定义
│   ├── utils/          # 工具函数
│   └── index.ts        # 入口文件
├── dist/               # 构建输出
├── tests/              # 测试文件
└── docs/               # 文档
```

## 📊 性能指标

### 包大小
- 核心库: ~30KB (gzipped)
- 完整功能: ~45KB (gzipped)
- 按需加载: ~15KB (gzipped, 仅错误追踪)

### 性能影响
- 初始化时间: < 5ms
- 数据收集延迟: < 1ms
- 内存占用: < 2MB
- CPU占用: < 1%

## 🔒 隐私与安全

### 数据脱敏
- 自动识别敏感输入字段
- 密码、邮箱、电话等信息自动脱敏
- 支持自定义脱敏规则

### 数据传输
- HTTPS加密传输
- 支持数据压缩
- 离线缓存机制

### 合规性
- 符合GDPR要求
- 支持用户数据删除
- 可配置数据保留策略

## 🤝 贡献

欢迎提交Issue和Pull Request！

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 📄 许可证

[MIT License](LICENSE)

## 📞 支持

- 📧 邮箱: support@fe-monitor.com
- 📖 文档: https://docs.fe-monitor.com
- 🐛 问题反馈: [GitHub Issues](https://github.com/fe-monitor/sdk/issues)

---

**Made with ❤️ by the FE Monitor Team**