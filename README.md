# AI 图片生成助手

基于 Vue 3、TypeScript 和 Tauri 2 的对话式图片生成应用。项目同时支持 Web 运行时和桌面运行时：Web 端保留浏览器体验，桌面端将配置、历史记录和生成图片保存在本机，并提供本地文件管理、zip 导入导出和存储清理能力。

## 功能特性

- 对话式图片生成：输入描述后调用兼容 OpenAI 图片生成 API 的端点生成图片。
- 自定义 API 配置：支持配置 API Endpoint、API Key 和模型名称。
- 图片生成选项：支持尺寸、质量、数量和风格模板。
- 对话历史：支持当前对话和历史列表管理。
- 桌面本地保存：Tauri 端将生成图片写入应用数据目录下的 `images/`。
- 桌面导入导出：Tauri 端使用 zip 包导出历史和图片，Web 端继续使用 JSON。
- 本地图片操作：桌面端可打开图片、在文件管理器中显示、另存为、复制到剪贴板。
- 存储清理：设置页可查看数据目录、图片数量、占用空间，并清理孤儿图片。
- 主题切换：支持浅色、深色和跟随系统主题。

## 技术栈

- 前端框架：Vue 3 + TypeScript
- 构建工具：Vite
- 状态管理：Pinia
- 桌面框架：Tauri 2
- 元数据存储：Web 使用 localStorage，桌面使用 Tauri Store
- 图片文件存储：桌面使用 Tauri AppData 下的 `images/`
- 文件能力：Tauri fs、dialog、opener、clipboard-manager 插件
- 网络能力：Web 使用浏览器 `fetch`，桌面使用 Tauri HTTP 插件
- 测试：Vitest

## 快速开始

### 安装依赖

```bash
npm install
```

### Web 开发

```bash
npm run dev
```

### 桌面开发

```bash
npm run tauri:dev
```

### Web 构建

```bash
npm run build
```

### 桌面前端构建

```bash
npm run build:desktop
```

### 桌面安装包构建

```bash
npm run tauri:build
```

### 测试

```bash
npm test
```

## 使用指南

### 配置 API

首次使用需要配置 API：

- 打开右上角设置。
- 输入 API 端点，例如 `https://api.openai.com`。
- 输入 API Key。
- 按需调整模型名称。
- 点击“测试连接”验证配置，再保存。

Web 端配置保存在浏览器 localStorage。桌面端配置保存在 Tauri Store 文件中，不会上传到应用服务器。

### 生成和管理图片

- 在输入框中描述需要生成的图片。
- 选择尺寸、质量、数量和风格模板。
- 发送后生成结果会进入当前对话。
- 点击图片可放大预览。
- 桌面端本地图片在预览弹窗中支持打开、显示、另存为和复制。

### 桌面本地存储

桌面端会把图片保存到系统应用数据目录下的 `images/` 子目录。实际数据目录会显示在设置页的“本地存储”区域，也可以从设置页直接打开。

桌面端保存的数据包括：

- API 配置和用户偏好。
- 当前对话和历史列表。
- 生成图片文件。
- 导入 zip 后写入本机的图片文件。

删除消息、删除历史和清空历史会尝试清理不再被引用的本地图片。设置页还提供孤儿图片统计和手动清理入口，清理前会显示数量和预计释放空间。

### 导入导出差异

Web 端：

- 导出为 JSON。
- 适合浏览器内简单备份。
- 不包含桌面端本地图片文件目录结构。

桌面端：

- 导出为 zip 包。
- zip 内包含 `history.json` 和 `images/`。
- 图片引用使用相对路径，便于迁移到另一台机器。
- 导入支持 replace 和 merge 模式。
- 导入失败时不会破坏当前数据。

## API 格式

图片生成请求使用兼容 OpenAI 图片生成 API 的格式：

```http
POST {endpoint}/v1/images/generations
Authorization: Bearer {api_key}
Content-Type: application/json
```

```json
{
  "model": "gpt-image-2",
  "prompt": "图片描述",
  "n": 1,
  "size": "1024x1024",
  "quality": "standard",
  "response_format": "b64_json"
}
```

图片编辑使用 multipart form data 调用 `{endpoint}/v1/images/edits`。

## 桌面发布信息

- 应用名：`AI 图片生成助手`
- Bundle identifier：`com.chatimage.desktop`
- 当前版本：`0.1.0`
- macOS 构建产物：`src-tauri/target/release/bundle/macos/AI 图片生成助手.app`
- macOS DMG：`src-tauri/target/release/bundle/dmg/AI 图片生成助手_0.1.0_aarch64.dmg`

## 常见问题

### Web 端跨域错误

Web 端仍受浏览器 CORS 限制。如果 API 端点不允许浏览器跨域请求，需要使用支持 CORS 的端点或代理服务。

桌面端使用 Tauri HTTP 插件发起请求，通常可以减少 CORS、代理和证书兼容问题。

### 图片丢失或无法预览

桌面端图片依赖本地 `images/` 文件。不要手动删除应用数据目录中的图片文件。若出现孤儿图片或空间占用异常，可在设置页刷新存储统计并执行清理。

### 导入 zip 失败

请确认 zip 包来自桌面端导出，并包含有效的 `history.json` 和 `images/` 文件。损坏或缺失图片的 zip 会被拒绝或给出错误提示。

## 项目结构

```text
src/
  components/     Vue 组件
  composables/    组合式逻辑
  platform/       Web/Tauri 平台能力封装
  services/       API 服务
  stores/         Pinia 状态
  types/          TypeScript 类型
  utils/          工具函数
src-tauri/
  capabilities/   Tauri 权限配置
  icons/          桌面应用图标
  src/            Tauri Rust 入口
```

## 许可证

MIT License
