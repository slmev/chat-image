# 功能待办清单 (Feature Backlog)

> 面向产品功能层面的评估结果，按优先级分组。每条包含：问题描述、影响文件、验收标准。
> 生成于对当前 `main` 分支的功能评审。

## 优先级图例

| 标记 | 含义 |
|------|------|
| 🔴 P0 | 体验割裂/名不副实，投入小收益大，建议优先 |
| 🟡 P1 | 明显能力缺口，中等投入 |
| 🟢 P2 | 增强型，可排后 |
| ⚪ P3 | 清理/技术债 |

---

## 🔴 P0 — 优先修复

### #1 画廊补齐删除、收藏、批量操作 ✅ 已完成
画廊有最丰富的筛选维度，却几乎没有操作能力，体验割裂。

- 能按「收藏」筛选，却无法在画廊里打星/取消（只能回聊天操作）
- 无删除入口
- 无多选/批量下载/批量删除
- 无排序控制（写死最新在前）

**影响文件**: `src/components/Gallery/GalleryView.vue`
**已有可复用能力**: `downloadMultipleImages`（打包 zip，见 `src/composables/useImageDownload.ts`）、收藏逻辑（`MessageActions.vue`）
**验收标准**:
- [x] 画廊每张图可收藏/取消收藏，与聊天态双向同步（消息级）
- [x] 画廊可删除单张（走 `deleteUnreferencedLocalImages` 清理，助手消息删空则移除）
- [x] 支持多选 + 批量下载(zip) + 批量删除
- [x] 提供排序切换（最新/最早/收藏优先）

**已知局限**：画廊收藏为**消息级**（与聊天 MessageActions 一致）。历史记录整体收藏（`ChatHistory.isFavorite`）是另一独立概念，会 OR 进画廊项的 `isFavorite`。因此对一条"整体已收藏的历史"里的图片点取消收藏，只会清掉消息级标记，刷新后仍因历史级收藏显示为已收藏。若需彻底统一两种收藏概念，属独立改动，未纳入本次。

### #2 接入图片前后对比 (ImageCompare)
`ImageCompare.vue` 是一个完整实现的「前后对比滑块」组件，但从未被任何地方引用——一个做好的能力被浪费。原图 vs 变体的对比是图片编辑场景的高价值功能。

**影响文件**: `src/components/Chat/ImageCompare.vue`（现成）、`src/components/Chat/ImagePreview.vue` 或 `MessageActions.vue`（加入口）
**验收标准**:
- [ ] 变体/编辑结果旁提供「与原图对比」入口
- [ ] 打开 `ImageCompare` 展示原图与结果的滑块对比
- [ ] 正确解析本地路径/外链/blob URL

### #3 图片编辑对话框补齐尺寸/质量控制
`editImage()` API 支持 size/quality/n，但 `ImageEditDialog` 只暴露一个提示词输入框，inpainting 时用户无法控制输出规格。而 `VariationDialog` 却有全套选项——两个入口体验不一致。

**影响文件**: `src/components/ImageEdit/ImageEditDialog.vue`、`src/composables/useImageEdit.ts`
**验收标准**:
- [ ] 编辑对话框暴露 size / quality / n 控制
- [ ] 参数正确透传到 `editImage`

### #4 统一两处风格列表
`ChatInput` 的风格 chip 含自定义风格，但 `VariationDialog` 的风格下拉只列内置风格，自定义风格用不了。

**影响文件**: `src/components/ImageEdit/VariationDialog.vue`、`src/composables/useCustomStyles.ts`
**验收标准**:
- [ ] VariationDialog 风格选择包含自定义风格
- [ ] 两处风格来源统一（抽取共享 composable/数据源）

---

## 🟡 P1 — 明显能力缺口

### #5 Web 端存储用量可视化与清理
桌面端设置页有图片数/占用空间/孤儿清理，Web 端刚迁到 IndexedDB 却没有对应的容量管理 UI，用户无法知道用了多少、怎么清。

**影响文件**: `src/components/Config/SettingsPage.vue`、`src/platform/webPersistence.ts`（补统计/清理 API）
**验收标准**:
- [ ] Web 端设置页显示图片数量与占用空间
- [ ] Web 端可清理孤儿图片（复用 `getWebReferencedImageKeys` + `deleteWebImages`）

### #6 「变体生成」名不副实
变体功能本质是拿原图走 `editImage`，硬拼英文后缀 `", alternative version, different perspective"`（`useImageEdit.ts:73`）。不是真正的 variation，效果取决于模型是否听懂该措辞；且后缀写死英文，i18n 覆盖不到。

**影响文件**: `src/composables/useImageEdit.ts`
**验收标准**:
- [ ] 若目标 API 支持真正的 variations 端点，改用之
- [ ] 否则至少将后缀 i18n 化、可在设置中配置
- [ ] 文档说明变体的实现方式与局限

### #7 输出格式不可选
size/quality/n 全暴露，唯独输出格式写死 `b64_json`，无 PNG/JPEG/WebP 选择。对在意体积/透明通道的用户是缺失。

**影响文件**: `src/components/Chat/ChatInput.vue`、`src/services/api.ts`、`src/types/index.ts`
**验收标准**:
- [ ] 生成选项暴露输出格式选择
- [ ] 请求与持久化正确处理所选格式

### #8 键盘快捷键形同虚设
`useKeyboardShortcuts` 有完整注册框架，但全局只注册了一个 Ctrl/Cmd+N（新对话，且仅桌面端）。发送、聚焦输入、切画廊/设置、搜索都没有快捷键。

**影响文件**: `src/composables/useKeyboardShortcuts.ts`、`src/components/Chat/ChatContainer.vue`
**验收标准**:
- [ ] 补充：发送(Ctrl+Enter)、聚焦输入、切换画廊/设置、搜索、Esc 返回
- [ ] Web 端避开浏览器保留键
- [ ] 提供快捷键帮助面板

### #9 可访问性:操作按钮键盘用户够不到
`MessageActions` 用 `opacity:0` + hover 才显示，无 focus 揭示；`ImagePreview` 悬浮层同理。键盘/屏幕阅读器用户无法触达。蒙版画布编辑也无键盘替代方案。（关联记忆中的焦点陷阱已知问题。）

**影响文件**: `src/components/Chat/MessageActions.vue`、`src/components/Chat/ImagePreview.vue`
**验收标准**:
- [ ] hover 显示的操作在 `:focus-within` 时同样揭示
- [ ] 操作按钮可 Tab 到达并触发
- [ ] 蒙版编辑提供键盘可达的替代路径（至少非画布操作）

### #10 Web 端外链图片仍导不出实体文件
IndexedDB 迁移解决了本地生成图的导出（转回 base64），但纯外链图片在 web 端批量导出时仍被写成 `external-image-links.txt` 而非二进制。

**影响文件**: `src/composables/useImageDownload.ts`、`src/platform/webImageRepository.ts`
**验收标准**:
- [ ] 评估经代理/后端拉取外链的可行性，或明确提示用户该限制
- [ ] 至少在导出前告知哪些图片将以链接形式导出

---

## 🟢 P2 — 增强

### #11 生成进度反馈
pending 状态只有文字，无进度/预估，长时间生成体验差。
**验收标准**: [ ] 生成中显示进度指示（骨架/spinner/预估）

### #12 失败自动重试与退避
429/5xx 只报错，需用户手动重试。
**影响文件**: `src/services/api.ts`
**验收标准**: [ ] 对可重试错误(429/5xx)做带退避的自动重试，可配置次数

### #13 Prompt 历史/复用库
有模板浏览器和「复用某次参数」，但没有可搜索的「我用过的 prompt」沉淀。
**验收标准**: [ ] 记录并可搜索历史 prompt，一键复用

### #14 Seed 与负面提示词 (negative prompt)
无 seed（不可复现）、无 negative prompt（无法精细控制）。
**验收标准**: [ ] 生成选项支持 seed 与 negative prompt（在 API 支持时）

### #15 图片编辑 redo 与撤销栈优化
编辑无 redo；undo 是浅 20 步 ImageData 栈，高分辨率吃内存。
**影响文件**: `src/components/ImageEdit/ImageEditDialog.vue`
**验收标准**: [ ] 支持 redo；[ ] 撤销栈改为增量/压缩存储

### #16 配置导出导入
只导对话，多配置(API profiles)换设备要手动重配。
**验收标准**: [ ] 支持导出/导入配置（含多 profile，API Key 处理需注意安全）

### #17 Outpainting / 扩图
当前只有 inpainting。
**验收标准**: [ ] 在 API 支持时提供扩图能力

---

## ⚪ P3 — 清理 / 技术债

### #18 清理死代码
以下组件完全无人引用：
- `src/components/Chat/ImageGrid.vue` — 删除
- `src/components/Style/StyleTemplates.vue` — 删除（已被 ChatInput 内联风格 chip 取代，且仍用不一致的 Tailwind 类）
- `src/components/Chat/ImageCompare.vue` — **不要删**，见 #2 接入后保留

**验收标准**:
- [ ] 删除 `ImageGrid.vue`、`StyleTemplates.vue` 及其无用引用/i18n 键
- [ ] 确认 `ImageCompare.vue` 在 #2 完成后被引用

### #19 ConfigModal 遗留样式清理
`ConfigModal.vue`（首次配置引导，仍在 App.vue 使用）CSS 里残留已不再使用的 storage-section 样式。
**验收标准**: [ ] 移除无用样式块

---

## 已知问题（已在项目记忆中记录，非本次新增）

以下为既有已知问题，列此仅供交叉参考，评估其是否值得纳入本轮：
- `decodeApiKey` 的 atob 解码缺陷
- ConfigModal / CustomStyleDialog 焦点陷阱缺失（与 #9 同类）
- 孤儿图片清理的 TOCTOU 竞态（web 端新清理逻辑同样是 read-then-delete，理论窗口仍在）
- Esc 多触发、currentChatId 不同步、UpdatePrompt 反复弹等低优先级项

