# AI 图片生成应用

一个基于 Vue 3 + TypeScript 的对话式图片生成应用，支持用户自定义 API 端点和密钥，使用 GPT-image-2 模型生成图片。

## 功能特性

### 核心功能
- 🎨 **对话式生成**：通过对话界面描述需求，AI 自动生成图片
- 🔧 **自定义配置**：用户可输入自定义 API 端点和密钥
- 📱 **响应式设计**：支持桌面和移动设备
- 🌓 **主题切换**：支持浅色、深色和跟随系统主题

### 图片生成选项
- **尺寸选择**：1024×1024、1792×1024、1024×1792
- **质量选择**：标准、高清
- **生成数量**：1-4 张图片
- **风格模板**：动漫、写实、油画、水彩、素描、赛博朋克

### 图片管理
- 图片预览与放大查看
- 图片下载功能
- 对话历史保存

## 技术栈

- **框架**: Vue 3 + TypeScript
- **构建工具**: Vite
- **UI 框架**: Tailwind CSS
- **状态管理**: Pinia
- **图标库**: Lucide Vue Next

## 快速开始

### 安装依赖
```bash
npm install
```

### 运行开发服务器
```bash
npm run dev
```

### 构建生产版本
```bash
npm run build
```

### 预览生产版本
```bash
npm run preview
```

## 使用指南

### 1. 配置 API
首次使用需要配置 API 端点和密钥：
- 点击右上角的设置按钮
- 输入 API 端点地址（例如：`https://api.openai.com`）
- 输入 API Key
- 点击"测试连接"验证配置
- 点击"保存配置"

### 2. 生成图片
- 在输入框中描述您想要的图片
- 选择图片参数（尺寸、质量、数量）
- 可选择风格模板快速应用预设风格
- 点击"发送"按钮或按 Enter 键生成图片

### 3. 查看和管理图片
- 生成的图片会在对话中显示
- 点击图片可以放大查看
- hover 图片可以下载

### 4. 其他功能
- 点击右上角太阳/月亮图标切换主题
- 点击垃圾桶图标清空对话历史

## API 格式

应用使用标准的 OpenAI 图片生成 API 格式：

```typescript
POST {endpoint}/v1/images/generations
Headers:
  Authorization: Bearer {api_key}
  Content-Type: application/json

Body:
{
  "model": "gpt-image-2",
  "prompt": "图片描述",
  "n": 1,
  "size": "1024x1024",
  "quality": "standard"
}
```

## 安全说明

- API Key 仅存储在用户本地 localStorage，不会上传到任何服务器
- 用户需自行保管 API Key 的安全性
- 建议定期更换 API Key

## 注意事项

### 跨域问题
如果遇到跨域错误，请确保：
- API 端点支持 CORS
- 或使用代理服务器转发请求

### 错误处理
应用会处理以下常见错误：
- 401: API Key 无效
- 429: 请求过于频繁
- 500: 服务器错误
- 网络错误

## 项目结构

```
src/
├── components/        # Vue 组件
│   ├── Chat/         # 对话相关组件
│   ├── Config/       # 配置相关组件
│   ├── Style/        # 风格模板组件
│   └── Layout/       # 布局组件
├── composables/      # Vue Composition API
├── stores/           # Pinia 状态管理
├── services/         # API 服务
├── types/            # TypeScript 类型定义
├── utils/            # 工具函数
├── App.vue           # 主应用组件
└── main.ts           # 应用入口
```

## 开发计划

- [ ] 提示词优化建议功能
- [ ] 自定义风格模板保存
- [ ] 对话历史导出
- [ ] 图片批量下载
- [ ] 多语言支持

## 许可证

MIT License

## 作者

Created with Claude Code