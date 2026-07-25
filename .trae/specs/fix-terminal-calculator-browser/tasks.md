# Web Terminal OS - 终端滚动、计算器响应式及浏览器应用 - 实现计划

## [x] Task 1: 修复终端垂直滚动问题，确保输入行始终置底
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 修改终端样式，将输入行从 fixed 定位改为 absolute 定位，相对于 terminal-body
  - 确保终端滚动时输入行始终在可视区域底部
  - 修改 scrollToBottom 方法，确保新输出后自动滚动到底部
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `human-judgement` TR-1.1: 终端有大量输出时输入行始终在底部
  - `human-judgement` TR-1.2: 滚动终端后输入行仍可见
- **Notes**: 需要修改 style.css 和 terminal.js

## [x] Task 2: 计算器响应式布局
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 修改计算器 CSS，使用 vw/vh 或 clamp 实现响应式字体大小
  - 按钮大小和间距自适应窗口大小
  - 确保小窗口下按钮仍可点击
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `human-judgement` TR-2.1: 调整窗口大小时按钮大小自适应
  - `human-judgement` TR-2.2: 小窗口下所有按钮仍可点击
- **Notes**: 修改 apps/calculator.app/main/style.css

## [x] Task 3: 计算器长数字科学计数法显示
- **Priority**: high
- **Depends On**: Task 2
- **Description**: 
  - 修改 calculator.app 的 update 方法，移除省略号截断逻辑
  - 使用科学计数法处理超长数字显示
  - 确保显示的数字完整准确
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `human-judgement` TR-3.1: 长数字使用科学计数法显示而非省略号
  - `human-judgement` TR-3.2: 科学计数法显示的数字准确无误
- **Notes**: 修改 apps/calculator.app/main/app.js 的 update 和 format 方法

## [x] Task 4: 创建浏览器应用目录结构
- **Priority**: medium
- **Depends On**: None
- **Description**: 
  - 创建 apps/browser.app 目录
  - 创建 info.json 配置文件
  - 创建图标文件
- **Acceptance Criteria Addressed**: AC-4, AC-5
- **Test Requirements**:
  - `programmatic` TR-4.1: 目录结构完整，包含所有必要文件
  - `programmatic` TR-4.2: info.json 配置正确
- **Notes**: 需要在 apps 目录下创建新文件夹

## [x] Task 5: 实现浏览器 HTML 结构
- **Priority**: medium
- **Depends On**: Task 4
- **Description**: 
  - 创建 index.html，包含地址栏、导航按钮和 iframe 显示区域
  - 设计简洁的浏览器界面
- **Acceptance Criteria Addressed**: AC-4, AC-5
- **Test Requirements**:
  - `human-judgement` TR-5.1: 界面布局合理，导航按钮和地址栏清晰可见
  - `human-judgement` TR-5.2: iframe 显示区域占据主要空间
- **Notes**: 创建 apps/browser.app/main/index.html

## [x] Task 6: 实现浏览器样式
- **Priority**: medium
- **Depends On**: Task 5
- **Description**: 
  - 创建 style.css，设计浏览器界面样式
  - 地址栏、导航按钮样式统一
  - iframe 无边框，全屏显示
- **Acceptance Criteria Addressed**: AC-4, AC-5
- **Test Requirements**:
  - `human-judgement` TR-6.1: 样式美观，与系统风格一致
  - `human-judgement` TR-6.2: 导航按钮有 hover 和 active 效果
- **Notes**: 创建 apps/browser.app/main/style.css

## [x] Task 7: 实现浏览器 JavaScript 逻辑
- **Priority**: high
- **Depends On**: Task 5, Task 6
- **Description**: 
  - 创建 app.js，实现 URL 输入和访问功能
  - 实现前进、后退、刷新导航功能
  - 处理 URL 验证和错误处理
- **Acceptance Criteria Addressed**: AC-4, AC-5
- **Test Requirements**:
  - `human-judgement` TR-7.1: 输入 URL 后页面正确加载
  - `human-judgement` TR-7.2: 前进、后退、刷新按钮正常工作
  - `human-judgement` TR-7.3: 无效 URL 显示错误提示
- **Notes**: 创建 apps/browser.app/main/app.js

## [x] Task 8: 注册浏览器应用到系统
- **Priority**: medium
- **Depends On**: Task 4-7
- **Description**: 
  - 在 apps/manifest.json 中注册浏览器应用
  - 在 index.html 桌面图标区域添加浏览器图标
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `human-judgement` TR-8.1: 桌面显示浏览器图标
  - `human-judgement` TR-8.2: 点击图标可打开浏览器应用
- **Notes**: 修改 apps/manifest.json 和 index.html