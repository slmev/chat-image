# 桌面构建产物验收记录

最后自动验证日期：2026-06-24

## 已自动验证

- `npm test` 通过：16 个测试文件，77 个测试。
- `npm run build:desktop` 通过：TypeScript 和 Vite 桌面前端构建正常。
- `npm run tauri:build` 通过：成功生成 macOS app 和 dmg。
- macOS app bundle 可启动：`AI 图片生成助手.app` 主进程成功运行。
- 产物名称正确：`AI 图片生成助手.app`、`AI 图片生成助手_0.1.0_aarch64.dmg`。
- `com.chatimage.app` 以 `.app` 结尾的 identifier 警告已消失。
- 本轮复验已确认 `.app` 启动后主进程存在，随后正常退出验证进程。

## 待人工验收

以下项目需要有效 API Key 和交互式桌面操作：

- 首次启动后打开设置页，确认应用标题、图标和窗口尺寸正常。
- 配置 API Endpoint、API Key 和模型，测试连接成功。
- 生成至少一张图片，确认生成结果正常显示。
- 重启应用，确认当前对话、历史记录和本地图片仍可恢复。
- 打开图片预览，验证打开、显示、另存为、复制图片操作。
- 导出桌面 zip，确认 zip 包包含 `history.json` 和 `images/`。
- 使用 replace 模式导入 zip，确认历史和图片恢复。
- 使用 merge 模式导入 zip，确认不会重复覆盖现有记录。
- 删除消息、删除历史、清空历史，确认不再引用的本地图片会被清理。
- 设置页刷新存储统计，执行孤儿图片清理并确认统计更新。

## 验收命令

```bash
npm test
npm run build:desktop
npm run tauri:build
open -a "/Users/zhujie/Workspace/website/chat-image/src-tauri/target/release/bundle/macos/AI 图片生成助手.app"
```
