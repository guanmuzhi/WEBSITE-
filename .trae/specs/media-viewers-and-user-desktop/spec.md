# 图片影音查看器与用户桌面隔离 - 产品需求文档

## Overview
- **Summary**: 开发简约风格的图片查看器和影音播放器应用，实现用户桌面隔离（每个用户有独立的桌面图标和窗口状态），并在文件管理器中完善用户间文件访问的密码验证机制。
- **Purpose**: 丰富WebOS的多媒体能力，增强多用户体验的隔离性和安全性。
- **Target Users**: WebOS 多用户系统的使用者

## Goals
- 开发简约风格的图片查看器应用，支持查看常见图片格式
- 开发简约风格的影音播放器应用，支持播放常见音频和视频格式
- 实现用户桌面隔离：每个用户有独立的桌面图标布局和窗口状态
- 完善文件管理器的用户间文件访问密码验证机制
- 文件管理器点击不同类型文件时自动调用对应应用打开

## Non-Goals (Out of Scope)
- 图片编辑功能（仅查看）
- 视频编辑功能（仅播放）
- 媒体文件的元数据编辑
- 复杂的桌面美化和主题系统
- 多用户同时登录

## Background & Context
- 当前系统已有3个应用：计算器、文本编辑器、文件管理器
- 桌面状态（窗口位置、大小等）存储在 `webos-gui-state` 中，所有用户共享
- 文件系统存储在 `web-terminal-os-data` 中，用户目录位于 `/home/{username}`
- 终端已有 `checkPathPermission()` 方法进行路径权限检查，但文件管理器还没有
- 文件管理器点击文本文件时会通过 `open-file-in-editor` 事件调用文本编辑器

## Functional Requirements
- **FR-1**: 图片查看器应用（imageviewer.app）
  - 支持通过URL参数 `?path=/path/to/image.jpg` 打开图片
  - 支持格式：jpg, jpeg, png, gif, bmp, webp, svg
  - 简约界面：图片居中显示，带标题栏显示文件名
  - 支持关闭按钮
- **FR-2**: 影音播放器应用（mediaplayer.app）
  - 支持通过URL参数 `?path=/path/to/media.mp4` 打开媒体文件
  - 支持视频格式：mp4, webm, ogg
  - 支持音频格式：mp3, wav, ogg, flac
  - 简约界面：使用原生HTML5播放器控件
  - 显示文件名标题
- **FR-3**: 用户桌面隔离
  - 桌面状态按用户存储（localStorage键包含用户名）
  - 每个用户有独立的窗口布局和打开的应用状态
  - 切换用户时自动加载对应用户的桌面状态
  - 每个用户的桌面图标独立（系统默认图标所有用户都有）
- **FR-4**: 文件管理器用户间文件访问密码验证
  - 访问其他用户的目录时，如果该用户有密码，需要输入密码验证
  - 密码验证成功后可浏览该用户的文件
  - 验证状态在当前会话期间有效（无需每次都输入）
  - 尝试访问受保护目录时显示密码输入对话框
- **FR-5**: 文件管理器与媒体应用集成
  - 点击图片文件时调用图片查看器打开
  - 点击音视频文件时调用影音播放器打开
  - 根据文件扩展名判断文件类型并选择对应应用

## Non-Functional Requirements
- **NFR-1**: UI风格与现有应用保持一致（深色主题、简约设计）
- **NFR-2**: 图片和视频加载响应时间 < 1秒
- **NFR-3**: 用户切换时桌面状态恢复时间 < 500ms
- **NFR-4**: 密码验证流程清晰，错误提示友好

## Constraints
- **Technical**: 
  - 所有应用使用纯HTML/CSS/JS实现，无额外框架依赖
  - 文件数据存储在localStorage中，可能包含base64编码的二进制数据
  - 必须兼容现有文件系统结构
- **Dependencies**: 修改涉及的文件：
  - 新增 `apps/imageviewer.app/` 目录及文件
  - 新增 `apps/mediaplayer.app/` 目录及文件
  - 修改 `apps/manifest.json`
  - 修改 `apps/filemanager.app/main/app.js`
  - 修改 `src/desktop.js`
  - 修改 `src/user-manager.js`（如果需要）

## Assumptions
- 图片和音视频文件以base64或data URL形式存储在文件系统中
- 用户理解密码保护的含义，知道自己设置的密码
- 桌面隔离仅针对GUI状态，文件系统权限独立管理
- 简约风格指功能聚焦、界面简洁，无多余装饰

## Acceptance Criteria

### AC-1: 图片查看器打开图片文件
- **Given**: 文件系统中有一张图片文件
- **When**: 在文件管理器中点击该图片文件
- **Then**: 图片查看器应用打开，并显示该图片内容
- **Verification**: `human-judgment`

### AC-2: 影音播放器播放媒体文件
- **Given**: 文件系统中有一个音频或视频文件
- **When**: 在文件管理器中点击该媒体文件
- **Then**: 影音播放器应用打开，并可以播放该媒体
- **Verification**: `human-judgment`

### AC-3: 用户桌面隔离
- **Given**: 系统有两个用户A和B
- **When**: 用户A打开一些窗口并调整位置，然后切换到用户B，再切换回用户A
- **Then**: 用户A的桌面状态（窗口位置、打开的应用）与切换前一致
- **Verification**: `human-judgment`

### AC-4: 文件管理器访问有密码用户的目录
- **Given**: 用户A设置了密码，当前登录用户是B
- **When**: 用户B在文件管理器中尝试进入 `/home/A` 目录
- **Then**: 弹出密码输入框，输入正确密码后可进入，密码错误则拒绝访问
- **Verification**: `human-judgment`

### AC-5: 文件管理器访问无密码用户的目录
- **Given**: 用户A没有密码，当前登录用户是B
- **When**: 用户B在文件管理器中尝试进入 `/home/A` 目录
- **Then**: 直接进入，无需密码验证
- **Verification**: `human-judgment`

### AC-6: 图片查看器界面简约
- **Given**: 图片查看器已打开
- **When**: 查看界面
- **Then**: 界面简洁，图片居中显示，有关闭按钮和文件名显示
- **Verification**: `human-judgment`

### AC-7: 影音播放器界面简约
- **Given**: 影音播放器已打开
- **When**: 查看界面
- **Then**: 界面简洁，使用原生播放器控件，显示文件名
- **Verification**: `human-judgment`

## Open Questions
- [ ] 图片查看器是否需要支持缩放/旋转功能？→ 暂不需要，保持最简约
- [ ] 影音播放器是否需要播放列表功能？→ 暂不需要，单文件播放
- [ ] 用户桌面是否支持自定义图标？→ 暂不支持，使用系统默认图标
