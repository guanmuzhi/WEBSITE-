# Web Terminal OS - UI修复与媒体合并 PRD

## Overview
- **Summary**: 修复5个UI问题（开机标题栏、浏览器弹窗、刷新按钮、用户切换、媒体合并）并更新GitHub仓库
- **Purpose**: 提升用户体验，统一媒体查看器，修复功能bug
- **Target Users**: Web Terminal OS 用户

## Goals
- 删除开机序列的终端标题栏
- 替换所有浏览器内置弹窗（alert/confirm/prompt）为自定义UI组件
- 修复文件管理器刷新按钮返回根目录的bug
- 修复切换用户后桌面清空的问题
- 合并图片查看器和影音播放器为统一的媒体查看器

## Non-Goals (Out of Scope)
- 不修改终端命令行的alert使用
- 不添加新的应用功能
- 不修改文件系统核心逻辑

## Background & Context
- 当前项目运行在 http://localhost:8080
- 已推送到 GitHub: guanmuzhi/WEBSITE-
- 多个应用使用浏览器原生弹窗，体验不一致

## Functional Requirements
- **FR-1**: 删除开机屏幕终端的标题栏元素
- **FR-2**: 替换文件管理器中的所有alert/confirm/prompt为自定义模态框
- **FR-3**: 替换图片查看器中的alert为自定义模态框
- **FR-4**: 替换影音播放器中的alert为自定义模态框
- **FR-5**: 修复文件管理器刷新按钮保留当前路径
- **FR-6**: 切换用户后重新加载桌面图标
- **FR-7**: 合并图片查看器和影音播放器为统一媒体查看器
- **FR-8**: 媒体查看器提供文件打开按钮

## Non-Functional Requirements
- **NFR-1**: 自定义弹窗样式与系统主题一致
- **NFR-2**: 媒体查看器支持所有原有格式（图片、视频、音频）

## Constraints
- **Technical**: JavaScript ES6+, 不依赖新的第三方库
- **Dependencies**: 现有项目结构和API

## Assumptions
- 用户熟悉基本的桌面操作
- localStorage中已有用户和文件数据

## Acceptance Criteria

### AC-1: 删除开机标题栏
- **Given**: 启动Web Terminal OS
- **When**: 显示开机序列
- **Then**: 终端区域没有标题栏
- **Verification**: `human-judgment`

### AC-2: 自定义弹窗替换alert/confirm/prompt
- **Given**: 在文件管理器中执行删除/重命名操作
- **When**: 需要确认或输入
- **Then**: 显示自定义样式的模态框，而非浏览器弹窗
- **Verification**: `human-judgment`

### AC-3: 文件管理器刷新保留路径
- **Given**: 在文件管理器中导航到子目录
- **When**: 点击刷新按钮
- **Then**: 停留在当前目录，显示最新文件列表
- **Verification**: `programmatic`

### AC-4: 切换用户后桌面正常显示
- **Given**: 创建多个用户并切换
- **When**: 从用户A切换到用户B
- **Then**: 用户B的桌面图标正常显示
- **Verification**: `human-judgment`

### AC-5: 统一媒体查看器
- **Given**: 双击图片、视频或音频文件
- **When**: 文件管理器打开文件
- **Then**: 使用同一个媒体查看器打开所有类型
- **Verification**: `human-judgment`

### AC-6: 媒体查看器打开按钮
- **Given**: 打开媒体查看器
- **When**: 需要打开新文件
- **Then**: 界面上有"打开"按钮可选择新文件
- **Verification**: `human-judgment`

## Open Questions
- [ ] 无