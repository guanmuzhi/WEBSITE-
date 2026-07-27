# Web Terminal OS - 计算器美化、应用商店规划、用户重命名修复 PRD

## Overview
- **Summary**: 修复三个问题：计算器UI美化、规划应用商店功能、修复用户重命名时目录名同步更新问题
- **Purpose**: 提升用户体验，完善系统功能，确保数据一致性
- **Target Users**: Web Terminal OS 用户

## Goals
- 美化计算器UI，使其更现代、更美观
- 规划并实现应用商店功能框架
- 修复用户重命名时目录名未同步更新的bug

## Non-Goals (Out of Scope)
- 不修改文件系统核心逻辑（除用户目录名同步外）
- 不添加复杂的应用商店后端API
- 不修改GitHub仓库（仅在验证完成后推送）

## Background & Context
- 当前项目运行在 http://localhost:8080
- 计算器样式过于简单，缺少现代感
- 用户重命名功能已在user-manager.js中实现，但可能存在bug
- 应用商店尚未实现，需要规划基础框架

## Functional Requirements
- **FR-1**: 计算器UI美化，包括渐变背景、圆角按钮、阴影效果、动画过渡
- **FR-2**: 规划应用商店功能，包括应用列表展示、安装/卸载功能、分类浏览
- **FR-3**: 修复用户重命名时目录名同步更新功能，确保用户名和用户目录名实时绑定

## Non-Functional Requirements
- **NFR-1**: 计算器按钮在不同窗口大小下自适应
- **NFR-2**: 应用商店界面美观，响应式设计
- **NFR-3**: 用户重命名操作具有密码验证机制

## Constraints
- **Technical**: JavaScript ES6+, 不依赖新的第三方库
- **Dependencies**: 现有项目结构和API

## Assumptions
- 用户熟悉基本的桌面操作
- localStorage中已有用户和文件数据
- 用户目录位于/home/{username}路径下

## Acceptance Criteria

### AC-1: 计算器UI美化完成
- **Given**: 打开计算器应用
- **When**: 查看计算器界面
- **Then**: 计算器具有现代感的UI设计，包括渐变背景、圆角按钮、阴影效果
- **Verification**: `human-judgment`

### AC-2: 计算器按钮自适应
- **Given**: 调整计算器窗口大小
- **When**: 查看按钮布局
- **Then**: 按钮自动调整大小，填满整个窗口，字体大小自适应
- **Verification**: `human-judgment`

### AC-3: 应用商店界面展示
- **Given**: 打开应用商店
- **When**: 浏览应用列表
- **Then**: 应用列表正常显示，包含应用图标、名称和描述
- **Verification**: `human-judgment`

### AC-4: 用户重命名功能正常
- **Given**: 在锁定屏幕点击当前用户的重命名按钮
- **When**: 输入新用户名和密码（如有）
- **Then**: 用户名成功修改，用户目录名同步更新
- **Verification**: `programmatic`

### AC-5: 用户重命名密码验证
- **Given**: 用户设置了密码
- **When**: 尝试重命名用户
- **Then**: 必须输入正确密码才能完成重命名
- **Verification**: `human-judgment`

## Open Questions
- [ ] 应用商店的应用来源是本地还是远程？
- [ ] 应用商店是否需要搜索功能？
- [ ] 计算器是否需要添加主题切换功能？