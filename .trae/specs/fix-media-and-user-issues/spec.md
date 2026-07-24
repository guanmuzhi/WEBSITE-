# WebOS 媒体文件和用户管理修复 - Product Requirement Document

## Overview
- **Summary**: 修复媒体文件打开、媒体播放器图标、文件夹 ZIP 下载、用户切换桌面保存、删除用户密码验证、用户名与目录绑定等一系列问题
- **Purpose**: 解决当前系统中媒体文件无法正确打开、用户管理功能不完善等核心问题，提升系统稳定性和用户体验
- **Target Users**: WebOS 终端用户

## Goals
- 修复媒体文件从文件管理器打开无法跳转媒体播放器的问题
- 修复媒体播放器图标显示为问号的问题
- 为文件管理器添加文件夹打包 ZIP 下载功能
- 修复切换用户后桌面状态无法正确保存和恢复的问题
- 删除用户时要求输入密码验证
- 实现用户名与用户目录名的实时绑定（创建、删除、重命名时同步）

## Non-Goals (Out of Scope)
- 不修改终端命令行功能
- 不添加新的应用程序
- 不修改现有应用程序的 UI 设计风格

## Background & Context
- 当前系统使用 localStorage 存储文件系统和用户数据
- 媒体查看器应用已合并但缺少图标文件
- 用户管理和文件系统管理是分离的，没有实现用户名与目录名的绑定
- 文件管理器已支持单个文件下载，但不支持文件夹打包下载

## Functional Requirements
- **FR-1**: 文件管理器中点击媒体文件（图片/视频/音频）应能正确打开媒体查看器应用
- **FR-2**: 媒体查看器应用应显示正确的图标（非问号占位符）
- **FR-3**: 文件管理器应支持文件夹打包为 ZIP 并下载
- **FR-4**: 切换用户时应正确保存当前用户桌面状态，并在切换后恢复新用户的桌面状态
- **FR-5**: 删除用户时必须输入该用户的密码进行验证
- **FR-6**: 创建用户时自动创建同名用户目录（/home/用户名）
- **FR-7**: 删除用户时自动删除同名用户目录
- **FR-8**: 重命名用户名时同步重命名用户目录

## Non-Functional Requirements
- **NFR-1**: 所有对话框应使用自定义组件，不使用浏览器原生 alert/confirm/prompt
- **NFR-2**: 用户目录操作（其他用户目录）应验证密码

## Constraints
- **Technical**: 使用现有 localStorage 文件系统，使用 JSZip 库进行 ZIP 打包
- **Dependencies**: JSZip 库已在 index.html 中引入

## Assumptions
- 用户目录存储在 /home/ 下，目录名与用户名相同
- 用户数据和文件系统数据分别存储在不同的 localStorage key 中

## Acceptance Criteria

### AC-1: 媒体文件打开
- **Given**: 文件管理器中存在图片、视频、音频文件
- **When**: 用户点击媒体文件
- **Then**: 媒体查看器应用应打开并显示该文件内容
- **Verification**: `human-judgment`

### AC-2: 媒体播放器图标
- **Given**: 媒体查看器应用已安装
- **When**: 在任务栏或桌面图标中显示媒体查看器图标
- **Then**: 应显示正确的图标，而非问号占位符
- **Verification**: `human-judgment`

### AC-3: 文件夹 ZIP 下载
- **Given**: 文件管理器中存在包含文件的文件夹
- **When**: 用户选择下载文件夹
- **Then**: 应生成 ZIP 文件并触发浏览器下载
- **Verification**: `human-judgment`

### AC-4: 用户切换桌面保存
- **Given**: 用户A打开了多个窗口
- **When**: 用户切换到用户B，然后再切换回用户A
- **Then**: 用户A的窗口布局应与切换前一致
- **Verification**: `human-judgment`

### AC-5: 删除用户密码验证
- **Given**: 用户列表中有带密码的用户
- **When**: 尝试删除该用户
- **Then**: 应提示输入密码，密码正确才能删除
- **Verification**: `human-judgment`

### AC-6: 用户目录绑定 - 创建
- **Given**: 当前系统中不存在用户 testuser
- **When**: 创建用户 testuser
- **Then**: /home/testuser 目录应自动创建
- **Verification**: `programmatic`

### AC-7: 用户目录绑定 - 删除
- **Given**: 用户 testuser 存在且有 /home/testuser 目录
- **When**: 删除用户 testuser
- **Then**: /home/testuser 目录应自动删除
- **Verification**: `programmatic`

### AC-8: 用户目录绑定 - 重命名
- **Given**: 用户 testuser 存在且有 /home/testuser 目录
- **When**: 将用户名从 testuser 改为 newuser
- **Then**: /home/testuser 目录应重命名为 /home/newuser
- **Verification**: `programmatic`

## Open Questions
- [ ] 媒体文件内容存储为文本还是 base64？当前实现使用 base64，但读取时使用 readAsText，这可能导致大文件问题