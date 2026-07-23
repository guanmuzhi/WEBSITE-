# 用户管理修复与文件集成 - 产品需求文档

## Overview
- **Summary**: 修复用户管理相关bug，包括终端创建用户不显示、终端切换用户不广播事件、锁定界面缺少创建用户功能；同时修复文件管理器和文本编辑器的集成问题。
- **Purpose**: 解决用户反馈的多个功能缺陷，提升系统完整性和用户体验。
- **Target Users**: WebOS 用户

## Goals
- 锁定界面支持创建新用户
- 终端创建/删除用户后，其他组件能实时显示更新
- 终端切换用户后广播全局事件，所有组件同步更新
- 文件管理器禁止重命名特殊目录（home, tmp, 用户目录）
- 文本编辑器能够读取和写入文件系统（localStorage中的web-terminal-os-data）
- 文件管理器双击文件时调用文本编辑器打开

## Non-Goals (Out of Scope)
- 文件系统权限管理（已有的路径权限检查保持不变）
- 密码加密存储（保持当前明文存储方式）
- 文件上传/下载功能（已有的export/import保持不变）

## Background & Context
- 用户数据存储在 localStorage 的 `web-terminal-os-users` 和 `web-terminal-os-current-user` 键中
- 文件系统数据存储在 localStorage 的 `web-terminal-os-data` 键中，采用树状结构
- 当前各组件（终端、UserSwitcher、LockScreen）各自创建 UserManager 实例，用户列表在构造函数中加载，不会自动更新
- 文本编辑器使用独立的 `webos-texteditor-` 前缀存储文件，与文件系统不共享

## Functional Requirements
- **FR-1**: 锁定界面添加"创建用户"按钮和表单，支持创建新用户（用户名、密码可选）
- **FR-2**: UserManager 添加 `reload()` 方法重新从 localStorage 加载用户列表
- **FR-3**: 终端 `account new/delete` 命令执行后广播 `users-changed` 全局事件
- **FR-4**: 终端 `account switch` 命令执行成功后广播 `user-switched` 全局事件
- **FR-5**: UserSwitcher 监听 `users-changed` 事件，自动刷新用户列表
- **FR-6**: 文件管理器禁止重命名以下目录：`home`, `tmp`, `/home` 下的用户目录（如 `public`）
- **FR-7**: 文件管理器禁止删除 `home`, `tmp`, `/home` 下的用户目录
- **FR-8**: 文本编辑器修改为读取/写入文件系统（web-terminal-os-data），支持通过 URL 参数打开指定路径的文件
- **FR-9**: 文件管理器点击文件时打开文本编辑器应用，并传递文件路径参数

## Non-Functional Requirements
- **NFR-1**: 所有修改保持与现有深色主题一致的视觉风格
- **NFR-2**: 用户管理操作响应时间 < 500ms
- **NFR-3**: 确保各组件间事件通信正确，避免重复刷新

## Constraints
- **Technical**: 所有修改必须兼容现有 localStorage 数据结构
- **Dependencies**: 修改涉及的文件：
  - `src/lock-screen.js`
  - `src/user-manager.js`
  - `src/user-switcher.js`
  - `src/terminal.js`
  - `apps/filemanager.app/main/app.js`
  - `apps/texteditor.app/main/app.js`
  - `src/desktop.js`

## Assumptions
- 用户理解文件系统结构（/home/username）
- 用户知道密码是可选的（无密码用户可直接切换）

## Acceptance Criteria

### AC-1: 锁定界面创建用户
- **Given**: 用户在锁定界面
- **When**: 点击"创建用户"按钮，输入用户名（可选密码）
- **Then**: 用户创建成功，可切换到新用户进行解锁
- **Verification**: `human-judgment`

### AC-2: 终端创建用户后切换面板实时更新
- **Given**: 用户在终端输入 `account new testuser`
- **When**: 用户点击任务栏用户名打开切换面板
- **Then**: 切换面板显示新创建的 `testuser` 用户
- **Verification**: `human-judgment`

### AC-3: 终端切换用户后全局同步
- **Given**: 用户在终端窗口输入 `account switch testuser`（假设 testuser 无密码）
- **When**: 切换成功
- **Then**: 所有终端窗口的提示符更新为 testuser，任务栏用户名更新，文件管理器显示 testuser 的目录
- **Verification**: `human-judgment`

### AC-4: 文件管理器禁止重命名特殊目录
- **Given**: 用户在文件管理器中右键点击 `home` 目录
- **When**: 点击"重命名"
- **Then**: 弹出提示"无法重命名此目录"，操作被拒绝
- **Verification**: `human-judgment`

### AC-5: 文件管理器禁止删除特殊目录
- **Given**: 用户在文件管理器中右键点击 `public` 目录
- **When**: 点击"删除"
- **Then**: 弹出提示"无法删除此目录"，操作被拒绝
- **Verification**: `human-judgment`

### AC-6: 文本编辑器打开文件系统中的文件
- **Given**: 用户在文件管理器中点击 `welcome.txt`
- **When**: 文件管理器调用文本编辑器打开该文件
- **Then**: 文本编辑器显示 `welcome.txt` 的内容，用户可编辑并保存
- **Verification**: `human-judgment`

### AC-7: 文本编辑器保存回文件系统
- **Given**: 用户在文本编辑器中编辑并保存文件
- **When**: 点击"保存"按钮
- **Then**: 文件系统（localStorage web-terminal-os-data）中的文件内容更新
- **Verification**: `human-judgment`

## Open Questions
- [x] 文本编辑器是否需要保留独立存储（webos-texteditor-前缀）还是完全迁移到文件系统？→ 完全迁移到文件系统，删除独立存储逻辑
