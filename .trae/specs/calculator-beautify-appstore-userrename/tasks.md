# Web Terminal OS - 计算器美化、应用商店规划、用户重命名修复 - 实现计划

## [x] Task 1: 计算器UI美化
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 重写计算器CSS样式，使用现代设计语言
  - 添加渐变背景、圆角按钮、阴影效果
  - 使用CSS变量统一颜色主题
  - 添加按钮点击动画和过渡效果
  - 确保按钮在不同窗口大小下自适应
- **Acceptance Criteria Addressed**: AC-1, AC-2
- **Test Requirements**:
  - `human-judgment` TR-1.1: 计算器界面具有现代感，包含渐变背景、圆角按钮和阴影效果
  - `human-judgment` TR-1.2: 调整窗口大小时按钮自动适应，字体大小自适应
  - `human-judgment` TR-1.3: 按钮点击时有平滑的动画效果
- **Notes**: 需要修改 /workspace/apps/calculator.app/main/style.css 文件

## [x] Task 2: 用户重命名功能修复
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 检查user-manager.js中的renameUser和renameUserDir方法
  - 确保重命名用户时同步更新用户目录名
  - 验证密码验证逻辑正确性
  - 测试public用户（无密码）和有密码用户的重命名流程
- **Acceptance Criteria Addressed**: AC-4, AC-5
- **Test Requirements**:
  - `programmatic` TR-2.1: 创建有密码用户并尝试重命名，验证目录名同步更新
  - `human-judgment` TR-2.2: 有密码用户重命名时必须输入正确密码
  - `human-judgment` TR-2.3: 无密码用户（如public）可直接重命名
  - `programmatic` TR-2.4: 文件管理器中用户目录名正确显示
- **Notes**: 需要修改 /workspace/src/user-manager.js 文件，可能需要修改锁定屏幕中的重命名逻辑

## [x] Task 3: 应用商店框架实现
- **Priority**: medium
- **Depends On**: None
- **Description**: 
  - 创建应用商店目录结构
  - 创建应用商店HTML页面和CSS样式
  - 实现应用列表展示功能
  - 添加应用分类浏览
  - 实现安装/卸载功能接口
  - 在manifest.json中注册应用商店
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `human-judgment` TR-3.1: 应用商店界面美观，响应式设计
  - `human-judgment` TR-3.2: 应用列表正常显示，包含图标、名称和描述
  - `programmatic` TR-3.3: 应用商店成功注册到系统中
  - `human-judgment` TR-3.4: 应用分类浏览功能正常
- **Notes**: 需要创建新目录 /workspace/apps/appstore.app/，包含info.json, icon.svg, main/index.html, main/style.css, main/app.js

## [x] Task 4: 浏览器验证和测试
- **Priority**: medium
- **Depends On**: Task 1, Task 2, Task 3
- **Description**: 
  - 启动开发服务器
  - 测试计算器UI效果
  - 测试用户重命名功能
  - 测试应用商店功能
  - 修复发现的bug
- **Acceptance Criteria Addressed**: 所有AC
- **Test Requirements**:
  - `human-judgment` TR-4.1: 所有功能正常运行
  - `human-judgment` TR-4.2: 界面美观，无明显bug
- **Notes**: 使用 npm run dev 启动服务器，浏览器访问 http://localhost:8080

## [x] Task 5: GitHub推送
- **Priority**: medium
- **Depends On**: Task 4
- **Description**: 
  - 提交所有代码更改
  - 推送到GitHub main分支
- **Acceptance Criteria Addressed**: 所有AC
- **Test Requirements**:
  - `programmatic` TR-5.1: 代码成功推送到GitHub
- **Notes**: 使用 git 命令提交和推送代码