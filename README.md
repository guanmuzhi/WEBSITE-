# navore OS

一个**完全运行在浏览器里**的桌面操作系统：终端、虚拟文件系统、多用户、多工作区、窗口管理、应用安装、个性化设置和Service Worker离线缓存，全部由原生 HTML / CSS / JavaScript 实现，无需构建工具、无需后端数据库。

> 代码中的 `Web Terminal OS` 是项目早期名称，现统一称 navore OS。


---

## 目录

- [特性](#特性)
- [快速开始](#快速开始)
- [目录结构](#目录结构)
- [系统架构](#系统架构)
- [终端指南](#终端指南)
- [键盘快捷键](#键盘快捷键)
- [应用系统](#应用系统)
- [个性化与多语言](#个性化与多语言)
- [开发与发布](#开发与发布)
- [常见问题](#常见问题)

---

## 特性

- **纯前端**：无 npm 构建、无框架依赖，浏览器直接运行 ES Module。
- **虚拟文件系统（VFS）**：树形结构存于 `localStorage`，支持绝对路径、`~`、`../` 和条件选择器。
- **完整终端**：23 条命令（含简写）、`&&` 链式命令、返回值语义（整型 / 布尔值 / 字符串 / 字符串数组）。
- **多工作区**：窗口在后台常驻运行，切换桌面不丢失未保存状态；任务视图可平铺展示所有窗口。
- **多用户**：用户数据隔离，敏感凭据存于 VFS 之外，支持锁屏与手势解锁。
- **应用系统**：内置 9 个应用，支持从 `.app` 压缩包安装 / 卸载第三方应用。
- **个性化**：主题色、壁纸、字体、透明度、动画、任务栏自动隐藏，三语言（简体中文 / English / 日本語）。
- **离线可用**：Service Worker 采用 network-first 策略，代码更新后客户端自动刷新，无需强刷。

---

## 快速开始

```bash
# 默认端口 8000
python3 server.py

# 指定端口
python3 server.py --port 8765

# 部署平台通常注入 PORT 环境变量
PORT=8080 python3 server.py
```

浏览器打开 `http://localhost:8000/`。首次启动会初始化默认用户 `public`（无密码），并生成 `/user/public/welcome.txt` 与 `readme.md`。

`server.py` 是零依赖的标准库 HTTP 服务，另提供 `/proxy?...` 跨域代理供「浏览器」「文件管理器」应用使用。该代理默认阻断内网 / 保留地址与元数据接口，并开启 TLS 证书校验；仅本地开发确有需要时可设置 `WEBOS_PROXY_ALLOW_PRIVATE=1` 放行私网。

---

## 目录结构

```
WEBSITE--main/
├── index.html               # 页面骨架、窗口/终端模板
├── style.css                # 全系统样式（含主题变量、动画）
├── service-worker.js        # 缓存自愈 SW（VERSION 常量控制刷新）
├── server.py                # 零依赖 HTTP 服务 + /proxy 代理
├── favicon.svg
├── languages/               # 系统级三语言词条
│   ├── cmn.json
│   ├── eng.json
│   └── jpn.json
├── apps/                    # 内置应用与公共图标
│   ├── manifest.json        # 内置应用清单
│   ├── common.css
│   ├── icons/               # 系统图标（含默认头像 user-avatar.svg）
│   └── <name>.app/          # 单个应用：info.json / icon.svg / main/
├── src/
│   ├── main.js              # 入口：挂载全局对象 → 启动 BootManager
│   ├── boot-manager.js      # 启动编排、锁屏 → 桌面
│   ├── desktop.js           # 桌面、工作区、任务栏、任务视图、个性化
│   ├── window-manager.js    # 窗口生命周期、焦点、z-index、可见性
│   ├── storage.js           # StorageService 单例（localStorage 持久化）
│   ├── file-system.js       # FileSystem 门面：路径解析、复制/移动/删除
│   ├── user-manager.js      # 用户管理、家目录初始化与旧数据迁移
│   ├── lock-screen.js       # 锁屏/U I（时钟阶段 + 登录阶段）
│   ├── dialogs.js           # 输入框 / 确认框 / 文件选择器（供 iframe 应用调用）
│   ├── vi-editor.js         # vi 风格编辑器
│   ├── app-manager.js       # .app 包解析与内联化
│   ├── terminal.js          # 终端 UI、历史、撤销、导入导出、命令分发
│   ├── terminal/
│   │   ├── commands.js      # 23 条命令的 META + handlers + 简写迁移表
│   │   ├── parser.js        # 特殊字符语法层（~ [] && ../ 名称校验）
│   │   ├── selector.js      # [] 条件选择器解析与匹配
│   │   └── i18n.js          # 终端三语言词条
│   └── lib/
│       ├── path.js          # 路径规范化 / join / dirname 等
│       ├── fsedit.js        # 非交互式编辑操作（line/range/charRange/...）
│       ├── dom.js / icons.js / obj.js / index.js
└── examples/
    └── 示例便签.app         # 最小 .app 安装包，用于验证安装功能
```

---

## 系统架构

### 启动流程

```
index.html
  → src/main.js             挂载 StorageService / UserManager / Dialogs，预载图标
  → BootManager.init()      初始化用户与桌面
  → LockScreen              锁屏（若已登录则直接进桌面）
  → DesktopManager.init()   恢复个性化 → 恢复窗口状态 → 构建任务栏/工作区
```

所有 `import` 均带 `?v=<版本号>` 查询参数，配合 Service Worker 的 network-first 策略，避免浏览器缓存旧模块。

### 虚拟文件系统

`StorageService` 是单例，唯一数据树是 `storage.fs`，对应 `localStorage` 键：

| 键 | 内容 |
|---|---|
| `web-terminal-os-data` | VFS 树（文件 / 文件夹） |
| `web-terminal-os-users` | 用户凭据（VFS 之外，用户不可见） |
| `web-terminal-os-current-user` | 当前登录用户 |

默认目录约定：

```
/
├── /user/<用户名>/          # 用户家目录
│   ├── info/                # 个性化、壁纸、历史等系统配置
│   └── appinfo/             # 应用私有数据
├── /user/public/            # 默认用户，受删除保护
├── /application             # 已安装应用，只读系统路径
└── /languages               # 语言资源，只读系统路径
```

`/user/public/readme/` 表示文件夹，`/user/public/readme` 表示文件——尾斜杠有语义。

### 窗口与工作区

- `WindowManager` 维护窗口数组（`id / title / appIcon / workspaceId / isMinimized / zIndex`）。
- 切换工作区**不关闭、不重建**窗口：非当前工作区的窗口仅添加 `window-hidden` 类隐藏，DOM、iframe 和 JS 状态全部保留，行为类似最小化。
- 任务栏高亮严格取当前工作区内 `z-index` 最高的非最小化窗口。
- 任务视图（点击任务栏右侧用户按钮打开）：
  - 顶部为窄条桌面缩略图，横向滚动，每张是真实桌面的 DOM 克隆镜像；
  - 中部按真实尺寸同一比例平铺当前桌面的所有窗口（含最小化的），互不重叠；
  - 底部保留任务栏，原用户按钮变为「退出登录」。
- 任务视图打开时切换桌面，顶部高亮与中部窗口列表会同步刷新。

### 终端

`terminal.js` 只负责 UI、历史、撤销与导入导出；命令逻辑全部在 `src/terminal/`：

```
输入 → splitCommandLine(&&) → tokenize → resolveAlias
     → -h/--help 拦截 → entry.run(args) → term.print(...)
```

Tab 补全基于命令表；`↑` / `↓` 浏览历史；命令帮助支持 `help <命令>` 与 `<命令> -h`。

### 持久化与缓存

`service-worker.js` 监听 `fetch`：代码类资源（HTML/JS/CSS/JSON）走 network-first 且 `cache: 'no-store'`，静态资源走 cache-first。`VERSION` 变化时会清空旧缓存并立即激活新 SW。**修改代码后必须同步提升 `?v=` 与 `VERSION`，否则用户可能继续使用旧版本。**

---

## 终端指南

### 特殊字符

| 符号 | 含义 | 示例 |
|---|---|---|
| `~` | 当前工作目录 | `print ~`、`create ~/docs/note.txt` |
| `[]` | 条件选择器，附加在 `file` / `folder` 后 | `print file[size=0..10]` |
| `&&` | 顺序执行多条命令（引号内的 `&&` 不切分） | `create a.txt && print a.txt` |
| `../` | 返回上级目录，可多级；`/../` 非法 | `cd ../../` |

文件 / 文件夹名**禁止包含** `~`、`[`、`]`、`&`、`*`、`..` 与 `/`；含空格的名称可用单引号或双引号包裹。尾斜杠表示文件夹，指向文件时会报「不是文件夹」。

### 条件选择器

```
file[]                       所有文件
file[size=0..10]             大小 0~10 KB
file[size=..100]             不超过 100 KB
file[size=1024..]            至少 1 MB
file[size=10]                正好 10 KB
folder[time=3600..5]         3600 秒前 ~ 5 秒前修改
file[name=第三*.docx]        通配符（* 任意长度，? 单字符）
file[name=0..15]             文件名长度 0~15
file[name=15]                文件名长度正好 15
file[size=0..10,name=*.txt]  多条件，逗号分隔（AND）
```

`size` 单位为 KB，`time` 单位为秒（距离现在的时间差），`name` 支持精确名、长度范围和通配符。

### 命令速查

括号内为简写；旧命令（`ls`、`cat`、`mkdir` 等）通过迁移表兼容。

| 分组 | 命令 | 说明 | 示例 |
|---|---|---|---|
| 文本 | `print` (`p`) | 输出：文件先输出文件名再输出内容；`~` 输出路径；普通文本原样输出 | `print file.txt` |
| 文本 | `statistic` (`s`) | 统计，返回整型。`line` 行数、`word` 字符数、`size` 大小、自定义字词出现次数 | `statistic ~ line` |
| 文本 | `find` (`f`) | 文件内查找返回 `[行-起始位置,...]`；文件夹内递归返回路径数组 | `find file.txt hello` |
| 文本 | `SHA` (`sha`) | 计算 SHA1 / SHA256，缺省则两者都算 | `SHA file.txt SHA1` |
| 文本 | `vi` | 打开 vi 编辑器（`i` 插入、`Esc` 命令模式、`:w` 保存、`:q` 退出） | `vi file.txt` |
| 文本 | `edit` (`e`) | 非交互式编辑，见下方语法 | `edit file.txt 5-1 5-10 hello` |
| 文件 | `copy` (`cp`) | 复制文件 / 文件夹，目标省略则生成 `(1)` 副本 | `copy file.txt /user/public/` |
| 文件 | `create` (`c`) | 创建，文件夹以 `/` 结尾，返回布尔值 | `create docs/` |
| 文件 | `move` (`m`) | 移动到已存在的文件夹，不产生副本 | `move file.txt /user/public/` |
| 文件 | `rename` (`r`) | 重命名，返回布尔值 | `rename file.txt image.gif` |
| 文件 | `delete` (`d`) | 删除，返回布尔值；`/user/public/`、`/application` 受保护；`delete ~` 返回 `"0"` | `delete file.txt` |
| 文件 | `cd` | 切换目录，无参回家目录；离开自家目录会自动登出 | `cd /user/public` |
| 文件 | `list` (`l`) | 列项；`tree` 递归树形；`-b` 仅名称 | `list tree` |
| 文件 | `export` (`ex`) | 文件下载，文件夹打包 zip；无参等同 `export ~` | `export /user/public/` |
| 文件 | `import` (`im`) | 从 URL 下载到指定路径；无参数则从本地文件上传 | `import https://example.com/a.txt` |
| 系统 | `Clear` (`cl`) | 清屏 | `Clear` |
| 系统 | `account` (`a`) | `n` 新建 / `s` 切换 / `d` 删除；无参返回当前用户名；`public` 不可删除 | `a n newuser 123456` |
| 系统 | `personality` (`ps`) | 个性化配置，见下方 | `ps theme #ff3366` |
| 系统 | `language` (`ln`) | `cmn` / `eng` / `jpn`；无参列出语言 | `language eng` |
| 系统 | `date` (`dt`) | 当前时间，返回整型 | `date` |
| 系统 | `history` (`h`) | 历史记录，`clear` 清空 | `history clear` |
| 系统 | `help` | 全部命令树或单命令详细帮助 | `help edit` |
| 应用 | `application` (`app`) | `list` / `run` / `install` / `uninstall` | `app run filemanager` |

兼容简写：`ls` → `list`、`cat` / `echo` / `pwd` → `print`、`mkdir` / `touch` / `new` → `create`、`rm` → `delete`、`mv` → `move`、`whoami` → `account`、`run` / `apps` / `settings` → `application`、`tree` → `list tree`、`theme` / `wallpaper` / `font` / `opacity` / `animations` / `autohide` → `personality`、`open` → `vi`。

### `edit` 位置语法

```bash
edit file.txt 5-1 5-10 hello   # 把第 5 行第 1 到 10 个字符替换为 hello
edit file.txt 5 5 hello        # 把第 5 行整行替换为 hello
edit file.txt 5-1 5-10         # 删除该字符区间
edit file.txt 5 7              # 删除第 5 到第 7 行
```

位置可以是 `行`（整行）或 `行-列`（1 起始）。字符区间支持跨行，行号越界补空行、列越界截断；替换操作保留区间末行原有的换行状态。编辑结果支持撤销。

### 返回值约定

| 类型 | 命令 |
|---|---|
| 布尔值 `true` / `false` | `create`、`rename`、`delete` |
| 整型 | `statistic`、`date` |
| 字符串 | `SHA`、`cd`、`print`（路径） |
| 字符串数组 | `find`（文件内位置、文件夹内路径） |

---

## 键盘快捷键

统一使用 `Ctrl / Cmd + Alt` 前缀，避开浏览器保留键。

| 快捷键 | 功能 |
|---|---|
| `Ctrl/Cmd + Alt + →` / `↓` | 下一个工作区 |
| `Ctrl/Cmd + Alt + ←` / `↑` | 上一个工作区 |
| `Ctrl/Cmd + Alt + N` | 新建工作区 |
| `Ctrl/Cmd + Alt + W` | 关闭当前聚焦窗口 |
| `Ctrl/Cmd + Alt + D` | 显示 / 隐藏桌面 |
| `Ctrl/Cmd + Alt + Tab` | 当前工作区内循环切换窗口焦点 |
| `Esc` | 关闭任务视图 |

终端内：`↑` / `↓` 浏览历史，`Tab` 补全命令。桌面空白处拖拽可平移桌布，`Alt + 拖拽` 即使在 UI 上也强制平移。

---

## 应用系统

### 内置应用

定义于 `apps/manifest.json`，位于 `apps/<name>.app/`：计算器、文本编辑器、文件管理器、媒体查看器、浏览器、设置、应用商店、AI 助手，另有壁纸应用。

每个应用以 `iframe srcdoc` 方式运行，CSS / JS / 图片会被内联注入，因此单个应用完全自包含。应用可通过 `window.parent.Dialogs` 调用宿主的文件选择器等对话框。

### `.app` 包规范

`.app` 文件本质是 ZIP 压缩包，必需三个条目：

```
myapp.app
├── info.json          # 应用元数据（必需）
├── icon.svg           # 图标（必需）
└── main/
    ├── index.html     # 入口页面（必需）
    ├── style.css      # 可选，会被内联为 <style>
    └── app.js         # 可选，会被内联为 <script>
```

`info.json` 示例：

```json
{
  "id": "demo-notes",
  "name": "示例便签",
  "developer": "navore OS",
  "version": "1.0.0",
  "width": 420,
  "height": 520,
  "description": "用于验证安装功能的最小应用",
  "category": "productivity",
  "title": "示例便签"
}
```

安装时，`main/index.html` 中形如 `<script src="app.js">`、`<link href="style.css">`、`<img src="...">` 的引用若能在包内找到同名文件，会自动内联为 `data:` 或内嵌标签。

### 安装与卸载

- 图形界面：打开「应用商店」→ 右上角 **+**（从本地安装 .app）→ 选择 `.app` 文件。
- 终端：`application install ~/myapp.app/`，`application list` 查看，`application uninstall <应用名>` 卸载。

仓库 `examples/示例便签.app` 是一个可直接安装的最小示例，带输入便签和计数器，可用来同时验证安装流程与工作区后台状态保留。

---

## 个性化与多语言

`personality` 命令支持六个子项：

| 子项 | 参数 | 说明 |
|---|---|---|
| `animation` | `on` / `off` / `switch` | 界面动画开关 |
| `autohide` | `on` / `off` / `switch` | 任务栏自动隐藏 |
| `font` | 数字 | 全局字号 |
| `opacity` | 数字 | 界面透明度 |
| `theme` | 十六进制颜色 | 强调色，同步到所有应用窗口 |
| `wallpaper` | `solid` / `gradient` / `media` | 壁纸类型与参数 |

配置保存在 `/user/<用户名>/info/` 下。`language cmn|eng|jpn` 切换系统界面与终端输出；内置应用各自带三语言词条。

---

## 开发与发布

```bash
# 本地运行
python3 server.py --port 8765

# 修改代码后同步提升版本号（所有 ?v= 与 SW VERSION）
# 例如 54 → 55：
grep -rl '?v=54' src index.html | xargs sed -i 's/?v=54/?v=55/g'
sed -i "s/const VERSION = '54'/const VERSION = '55'/" service-worker.js

# 发布为在线应用
node /root/.codebuddy/skills/sites/scripts/publish.js \
  --dir /workspace/WEBSITE--main \
  --language python \
  --start-cmd "python3 server.py --port \$PORT"
```

项目为纯静态资源，可直接部署到任意支持 Python 的托管环境；也可用 `python3 -m http.server` 起静态服务（此时 `/proxy` 不可用）。

---

## 常见问题

**打开后仍是旧界面？**
Service Worker 缓存了旧模块。确认 `service-worker.js` 的 `VERSION` 与 `index.html` 的 `?v=` 已同步提升；代码层采用 network-first，正常访问一次即自动更新，无需强刷。

**应用第一次打开很慢？**
非当前工作区的窗口会被隐藏但保持运行。若浏览器限制了后台 iframe，首次进入对应工作区时可能才完成渲染；切换一次桌面即可。

**文件操作报错「名称含特殊字符」？**
文件 / 文件夹名不能包含 `~`、`[`、`]`、`&`、`*`、`..` 和 `/`。含空格请用引号包裹。

**如何恢复初始数据？**
在浏览器开发者工具中清除站点数据（localStorage），刷新后会重新初始化默认用户与示例文件。此操作不可撤销。

**`/proxy` 能访问内网服务吗？**
默认不能，出于 SSRF 防护只允许公网地址。本地开发可设置环境变量 `WEBOS_PROXY_ALLOW_PRIVATE=1` 后重启服务。
