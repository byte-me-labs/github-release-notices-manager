# GitHub Release Notices Manager

[English](#english) | [中文](#中文)

---

<a id="english"></a>

## English

A Chrome extension that aggregates all your GitHub Release notifications, groups them by repository, and provides batch management capabilities — solving the pain of Release notifications scattered across multiple pages.

### Features

- **Full-load notifications** — Automatically iterates through all pages of the GitHub Notifications API to fetch every Release notification
- **Group by repository** — Notifications are grouped by `owner/repo`, sorted by the latest activity time
- **Smart collapse** — Repos with many notifications collapse by default, showing only the latest stable release + one pre-release. Expand to see the rest
- **Visual distinction** — Collapsed items are visually dimmed and left-indented when expanded
- **Pre-release detection** — Fetches release details to identify pre-release / latest release, with visual badges
- **Batch mark as read** — Mark individual, per-repo, selected, or all collapsed notifications as read
- **Auto mark on click** — Optional setting: clicking a notification automatically marks it as read
- **i18n** — Supports English and Chinese, auto-detects browser language
- **Dark theme** — GitHub-style dark UI

### Screenshot

```
┌─ GitHub Release Notices Manager ────── [Refresh] [Settings] ─┐
│ Ready                                     [42 notifications]  │
│ [☐ Select All] [Select Pre-release] 0 selected               │
│ [Multi-notif repos] [Expand All] [Fetch Details]              │
│ [Mark Collapsed as Read] [Mark as Read]                       │
├─ owner/repo ──────────────────────────────────────── [5] ─────┤
│ [☐] [Latest] [v2.0.0] ✨ Spring Release 2024         [3d ago] │
│ [☐] [Pre-release] [v2.0.0-rc.2] ...                  [1d ago] │
│ ┊ [v1.9.0]                                           [1w ago] │  ← collapsed
│ ┊ [v1.8.0]                                           [2w ago] │
│ ┌─ 3 more ──────────────────────────────────────────────────┐ │
├─ another/repo ─────────────────────────────────────── [2] ────┤
│ ...                                                            │
└────────────────────────────────────────────────────────────────┘
```

### Getting Started

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked** and select the extension directory
5. Click the extension icon in the toolbar to open the management page
6. Click the **Settings** button (gear icon) in the top-right
7. Enter your GitHub Personal Access Token with `notifications` scope
   - [Create a token here](https://github.com/settings/tokens)
8. Click **Save** — notifications will load automatically

### Token Permissions

The token needs the `notifications` scope (read-only is sufficient for loading, but marking as read requires the full scope). Generate a classic token at [GitHub Settings > Tokens](https://github.com/settings/tokens).

### Usage

| Action | Description |
|---|---|
| Click notification | Opens the release page; if "Auto-mark as read" is enabled, marks it as read |
| Checkbox | Select individual notifications for batch operations |
| Select All | Check/uncheck all notifications |
| Select Pre-release | Auto-select all pre-release notifications |
| Fetch Details | Fetches release name, tag, and pre-release status for selected items |
| Mark as Read | Marks selected notifications as read (one-by-one PATCH calls) |
| Mark Collapsed as Read | Marks all currently collapsed notifications as read |
| Per-repo Mark Read | Click the "Mark Read" button next to a repo name |
| Multi-notif repos | Filter to show only repos with 2+ notifications |
| Expand All | Expand all collapsed sections |
| Clear Cache | In Settings: clears cached release details |

### Tech Stack

- Chrome Extension Manifest V3
- GitHub REST API v3
- Native i18n API (`_locales/{en,zh_CN}/messages.json`)

### Project Structure

```
github-notices-manager/
├── manifest.json          # Extension manifest
├── background.js          # Service worker (opens tab on icon click)
├── popup.html             # Main page
├── popup.js               # Core logic
├── styles.css             # Dark theme styles
├── _locales/
│   ├── en/messages.json   # English translations
│   └── zh_CN/messages.json# Chinese translations
├── icon.svg               # Source icon (SVG)
├── icon-48.png            # Extension icon 48x48
└── icon-128.png           # Extension icon 128x128
```

---

<a id="中文"></a>

## 中文

一款 Chrome 扩展，聚合展示你所有的 GitHub Release 通知，按仓库分组，并提供批量管理功能——解决 Release 通知分散在多个分页中不便管理的问题。

### 功能

- **全量加载** — 自动遍历 GitHub Notifications API 所有分页，一次性获取所有 Release 通知
- **按仓库分组** — 以 `owner/repo` 分组，按最新活动时间排序
- **智能折叠** — 通知较多的项目默认折叠，只展示最新版 + 一条预发布版，可展开查看全部
- **视觉区分** — 折叠消息展开后左侧虚线缩进 + 半透明度，与默认展示的通知明显区分
- **预发布识别** — 获取 Release 详情识别是否为预发布（Pre-release）和最新版（Latest），带颜色徽标
- **批量标记已读** — 支持逐条、按项目、按选中、按折叠区域标记为已读
- **点击自动标记** — 可选设置：点击通知时自动标记为已读
- **国际化** — 支持英文和中文，自动匹配浏览器语言
- **深色主题** — GitHub 风格深色界面

### 截图示意

```
┌─ GitHub Release Notices Manager ──── [刷新] [设置] ─┐
│ 就绪                                      [42 条通知] │
│ [☐ 全选] [选中预发布] 已选 0 条                      │
│ [包含多条通知的项目] [展开所有] [获取详情]           │
│ [标记折叠消息为已读] [标记为已读]                    │
├─ owner/repo ─────────────────────────────── [5] ────┤
│ [☐] [最新版] [v2.0.0] ✨ 春季发布 2024     [3天前]  │
│ [☐] [预发布] [v2.0.0-rc.2]                [1天前]  │
│ ┊ [v1.9.0]                               [1周前]  │  ← 折叠
│ ┊ [v1.8.0]                               [2周前]  │
│ ┌─ 还有 3 条 ──────────────────────────────────────┐ │
├─ another/repo ────────────────────────────── [2] ──┤
│ ...                                                 │
└─────────────────────────────────────────────────────┘
```

### 快速开始

1. 克隆或下载本仓库
2. 打开 Chrome 进入 `chrome://extensions`
3. 开启**开发者模式**（右上角开关）
4. 点击**加载已解压的扩展**，选择扩展目录
5. 点击工具栏中的扩展图标打开管理页面
6. 点击右上角的**设置**按钮（齿轮图标）
7. 输入你的 GitHub Personal Access Token（需 `notifications` 权限）
   - [在此创建 Token](https://github.com/settings/tokens)
8. 点击**保存**——通知将自动加载

### Token 权限

Token 需要 `notifications` 权限（只读即可加载，标记已读需要完整权限）。在 [GitHub 设置 > 令牌](https://github.com/settings/tokens) 中创建经典 Token。

### 使用说明

| 操作 | 说明 |
|---|---|
| 点击通知 | 打开 Release 页面；如开启"自动标记为已读"则同时标记 |
| 勾选 | 选择通知用于批量操作 |
| 全选 | 勾选/取消所有通知 |
| 选中预发布 | 自动勾选所有预发布通知 |
| 获取详情 | 获取选中通知的 Release 名称、Tag 和预发布状态 |
| 标记为已读 | 将选中的通知标记为已读（逐条 PATCH） |
| 标记折叠消息为已读 | 将所有当前折叠状态的通知标记为已读 |
| 项目标记已读 | 点击项目名旁的"标记已读"按钮 |
| 包含多条通知的项目 | 过滤仅显示有 2 条以上通知的项目 |
| 展开所有 | 展开所有折叠区域 |
| 清除缓存 | 在设置中清除 Release 详情缓存 |

### 技术栈

- Chrome 扩展 Manifest V3
- GitHub REST API v3
- 原生国际化 API（`_locales/{en,zh_CN}/messages.json`）

### 项目结构

```
github-notices-manager/
├── manifest.json          # 扩展清单
├── background.js          # Service Worker（点击图标打开标签页）
├── popup.html             # 主页面
├── popup.js               # 核心逻辑
├── styles.css             # 深色主题样式
├── _locales/
│   ├── en/messages.json   # 英文翻译
│   └── zh_CN/messages.json# 中文翻译
├── icon.svg               # 图标源文件（SVG）
├── icon-48.png            # 扩展图标 48x48
└── icon-128.png           # 扩展图标 128x128
```
