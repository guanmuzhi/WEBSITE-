# Web Terminal OS - 终端滚动、计算器响应式及浏览器应用 PRD

## Overview
- **Summary**: 修复终端垂直滚动问题并确保输入置底；改进计算器响应式设计和长数字显示；设计并实现浏览器应用
- **Purpose**: 提升用户体验，修复已知问题，扩展系统功能
- **Target Users**: Web Terminal OS 的所有用户

## Goals
- 修复终端垂直滚动问题，确保输入行始终显示在底部
- 计算器改为响应式设计，适配不同窗口大小
- 改进计算器长数字显示策略，使用科学计数法而非省略号
- 设计并实现浏览器应用，支持基本网页浏览功能

## Non-Goals (Out of Scope)
- 浏览器不支持复杂功能如书签管理、多标签页
- 浏览器不支持 JavaScript 执行和复杂网页交互
- 不修改其他应用的核心功能

## Background & Context
- 当前终端输入行使用 fixed 定位，但滚动时可能出现问题
- 计算器当前使用固定字体大小，小窗口时按钮拥挤
- 计算器长数字使用省略号截断，不利于精确计算
- 系统需要一个基本浏览器应用来增强实用性

## Functional Requirements
- **FR-1**: 终端输入行始终显示在可视区域底部，滚动时自动跟随
- **FR-2**: 计算器布局响应式，按钮大小和字体随窗口大小自适应
- **FR-3**: 计算器长数字超出显示区域时使用科学计数法显示
- **FR-4**: 浏览器应用支持 URL 输入和网页内容显示
- **FR-5**: 浏览器应用支持前进、后退、刷新功能

## Non-Functional Requirements
- **NFR-1**: 终端滚动流畅，输入响应无延迟
- **NFR-2**: 计算器在小窗口下仍可正常操作
- **NFR-3**: 浏览器页面加载时间合理

## Constraints
- **Technical**: 纯前端实现，无后端支持
- **Dependencies**: 使用 iframe 实现浏览器功能

## Assumptions
- 用户网络环境可访问外部网页
- 浏览器使用 iframe 嵌入网页内容

## Acceptance Criteria

### AC-1: 终端输入行始终置底
- **Given**: 终端窗口有大量输出内容
- **When**: 用户滚动终端或输入新命令
- **Then**: 输入行始终显示在可视区域底部
- **Verification**: `human-judgment`

### AC-2: 计算器响应式布局
- **Given**: 计算器窗口大小变化
- **When**: 用户调整窗口大小
- **Then**: 按钮大小和字体自适应调整，保持布局完整
- **Verification**: `human-judgment`

### AC-3: 计算器长数字科学计数法显示
- **Given**: 计算器输入或计算出超过12位的数字
- **When**: 数字超出显示区域
- **Then**: 使用科学计数法显示完整数字，而非省略号
- **Verification**: `human-judgment`

### AC-4: 浏览器基本功能
- **Given**: 用户打开浏览器应用
- **When**: 输入 URL 并点击访问
- **Then**: 页面加载并显示网页内容
- **Verification**: `human-judgment`

### AC-5: 浏览器导航功能
- **Given**: 用户在浏览器中浏览多个页面
- **When**: 点击前进、后退、刷新按钮
- **Then**: 执行相应导航操作
- **Verification**: `human-judgment`

## Open Questions
- [ ] 浏览器是否需要支持历史记录功能？
- [ ] 浏览器是否需要支持书签？