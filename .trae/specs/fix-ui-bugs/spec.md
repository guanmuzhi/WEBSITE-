# Web Terminal OS - UI Bug修复 PRD

## Overview
- **Summary**: 修复4个UI bug（低分辨率图标堆叠、计算器显示、锁屏public点击、媒体查看器配置）
- **Purpose**: 提升用户体验，修复应用功能缺陷
- **Target Users**: Web Terminal OS 用户

## Goals
- 修复低分辨率下桌面图标堆叠问题
- 修复计算器显示溢出和表达式清空问题
- 修复锁屏界面public用户无法点击切换的问题
- 为媒体查看器添加info.json配置文件

## Non-Goals (Out of Scope)
- 不添加新功能
- 不修改文件系统核心逻辑
- 不修改GitHub仓库

## Background & Context
- 当前项目运行在 http://localhost:8080
- 多个UI bug影响用户体验

## Functional Requirements
- **FR-1**: 修复桌面图标在低分辨率下的垂直堆叠问题
- **FR-2**: 修复计算器显示溢出和表达式清空问题
- **FR-3**: 修复锁屏界面public用户无法点击切换的问题
- **FR-4**: 为媒体查看器创建info.json配置文件

## Non-Functional Requirements
- **NFR-1**: 修复后界面响应式正常
- **NFR-2**: 修复后功能正常运行

## Constraints
- **Technical**: JavaScript ES6+, 不依赖新的第三方库
- **Dependencies**: 现有项目结构和API

## Assumptions
- 用户熟悉基本的桌面操作
- localStorage中已有用户和文件数据

## Acceptance Criteria

### AC-1: 桌面图标响应式正常
- **Given**: 窗口宽度小于768px
- **When**: 查看桌面
- **Then**: 桌面图标水平排列，不堆叠
- **Verification**: `human-judgment`

### AC-2: 计算器显示正常
- **Given**: 在计算器中输入数字和表达式
- **When**: 点击运算按钮或输入
- **Then**: 表达式和结果正确显示，无溢出
- **Verification**: `human-judgment`

### AC-3: 锁屏public用户可点击
- **Given**: 锁屏界面显示用户列表
- **When**: 点击public用户（无密码）
- **Then**: 直接切换到public用户
- **Verification**: `human-judgment`

### AC-4: 媒体查看器info.json存在
- **Given**: 打开媒体查看器
- **When**: 应用启动
- **Then**: 应用正常显示，窗口大小正确
- **Verification**: `programmatic`

## Open Questions
- [ ] 无