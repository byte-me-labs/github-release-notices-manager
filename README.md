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
- **Visual distinction** — Collapsed items are visually dimmed and left-indented; read notifications are semi-transparent
- **Pre-release detection** — Fetches release details to identify pre-release / latest release, with visual badges
- **Filter modes** — Three filter options: all repos / multi-notif repos / repos with pre-releases
- **Batch mark as read** — Mark individual, per-repo, or selected notifications as read
- **Load read messages** — Optional: show a Load More button to fetch 50 notifications at a time including already-read ones
- **Auto-fetch details** — Optional: automatically fetch release details on load (enabled by default)
- **Auto mark on click** — Optional: clicking a notification automatically marks it as read (enabled by default)
- **i18n** — Supports English and Chinese, auto-detects browser language
- **Dark theme** — GitHub-style dark UI

### Screenshot

```
┌─ GitHub Release Notices Manager ──────── [Refresh] [Settings] ─┐
│ Ready                                      [42 notifications]   │
│ [☐] [Select ▼] [All repos ▼] [Expand All] 0 selected           │
│                               [Load More] [Fetch Details] [Mark as Read] │
├─ owner/repo ───────────────────────────────────────── [5] ──────┤
│ [☐] [Latest] [v2.0.0] ✨ Spring Release 2024          [3d ago]  │
│ [☐] [Pre-release] [v2.0.0-rc.2] ...                   [1d ago]  │
│ ┊ [v1.9.0] (read)                                     [1w ago]  │  ← collapsed & read
│ ┊ [v1.8.0]                                            [2w ago]  │
│ ┌─ 3 more ───────────────────────────────────────────────────┐  │
├─ another/repo ──────────────────────────────────────── [2] ───┤
│ ...                                                             │
└─────────────────────────────────────────────────────────────────┘
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

### Settings

| Setting | Description | Default |
|---|---|---|
| GitHub Personal Access Token | Token with `notifications` scope | — |
| Clear Cache | Clears locally cached release details (24h TTL) | — |
| Auto-fetch release details | Automatically fetch tag/prerelease info on load | ✅ On |
| Auto-mark as read on click | Mark notification as read when clicking | ✅ On |
| Load read messages | Show Load More button to fetch notifications including read | ☐ Off |

### Usage

| Action | Description |
|---|---|
| ☐ Checkbox (leftmost) | Select / deselect all currently displayed notifications |
| Select ▾ | Quick selection: Select All / Select Pre-release / Select Collapsed |
| All repos ▾ | Filter: All repos / Multi-notif repos / With pre-releases |
| Expand All | Expand / collapse all hidden sections |
| Load More | Load next 50 notifications (including read). Visible when "Load read messages" is on |
| Fetch Details | Fetch release name, tag, and pre-release status for selected items |
| Mark as Read | Mark selected notifications as read |
| Click notification | Opens the release page; if auto-mark is on, marks it as read |
| Per-repo Mark Read | Click "Mark Read" button next to a repo name |

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
- **视觉区分** — 折叠消息展开后左侧虚线缩进 + 半透明度；已读消息半透明显示
- **预发布识别** — 获取 Release 详情识别是否为预发布（Pre-release）和最新版（Latest），带颜色徽标
- **筛选模式** — 三种筛选：全部仓库 / 含多条通知 / 含预发布
- **批量标记已读** — 支持逐条、按仓库、按选中标记为已读
- **加载已读消息** — 可选：显示"加载更多"按钮，每次拉取 50 条通知（含已读）
- **自动拉取详情** — 可选：页面加载时自动拉取 Release 详情（默认开启）
- **点击自动标记** — 可选：点击通知时自动标记为已读（默认开启）
- **国际化** — 支持英文和中文，自动匹配浏览器语言
- **深色主题** — GitHub 风格深色界面

### 截图示意

```
┌─ GitHub Release Notices Manager ────── [刷新] [设置] ──┐
│ 就绪                                     [42 条通知]    │
│ [☐] [选择 ▼] [全部仓库 ▼] [展开所有] 已选 0 条         │
│                             [加载更多] [获取详情] [标记为已读] │
├─ owner/repo ──────────────────────────────── [5] ───────┤
│ [☐] [最新版] [v2.0.0] ✨ 春季发布 2024        [3天前]   │
│ [☐] [预发布] [v2.0.0-rc.2]                   [1天前]   │
│ ┊ [v1.9.0] (已读)                            [1周前]   │  ← 折叠+已读
│ ┊ [v1.8.0]                                   [2周前]   │
│ ┌─ 还有 3 条 ─────────────────────────────────────────┐ │
├─ another/repo ───────────────────────────────── [2] ───┤
│ ...                                                      │
└──────────────────────────────────────────────────────────┘
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

### 设置选项

| 设置 | 说明 | 默认值 |
|---|---|---|
| GitHub Personal Access Token | 具有 `notifications` 权限的 Token | — |
| Clear Cache | 清除本地缓存的 Release 详情（24 小时 TTL） | — |
| 自动拉取通知详情 | 页面加载时自动拉取 tag/prerelease 信息 | ✅ 开启 |
| 点击通知后自动标记为已读 | 点击通知链接时自动标记为已读 | ✅ 开启 |
| 加载已读消息 | 显示"加载更多"按钮，可拉取含已读的通知 | ☐ 关闭 |

### 使用说明

| 操作 | 说明 |
|---|---|
| ☐ 左侧复选框 | 全选/取消全选当前显示的所有通知 |
| 选择 ▾ | 快捷选择：全选 / 选中预发布 / 选中折叠内容 |
| 全部仓库 ▾ | 筛选：全部仓库 / 含多条通知 / 含预发布 |
| 展开所有 | 展开/折叠所有隐藏区域 |
| 加载更多 | 加载下 50 条通知（含已读）。需在设置中开启"加载已读消息" |
| 获取详情 | 获取选中通知的 Release 名称、Tag 和预发布状态 |
| 标记为已读 | 将选中的通知逐条标记为已读 |
| 点击通知 | 打开 Release 页面；如开启自动标记则同时标记为已读 |
| 仓库标记已读 | 点击仓库名旁的"标记已读"按钮 |

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
