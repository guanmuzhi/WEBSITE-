# WebOS 媒体文件和用户管理修复 - 实现计划

## [ ] Task 1: 修复媒体查看器图标问题
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 为 mediaviewer.app 创建 icon.svg 文件
  - 图标应符合系统风格，使用 SVG 格式
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `human-judgment` TR-1.1: 媒体查看器图标在桌面和任务栏显示正常，非问号占位符
- **Notes**: 参考其他应用的图标风格

## [ ] Task 2: 修复媒体文件打开问题
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 检查文件管理器 openFile 方法中的事件分发逻辑
  - 确保媒体文件类型（图片、视频、音频）正确触发 open-image-viewer 和 open-media-player 事件
  - 检查 desktop.js 中的事件监听器是否正确处理这些事件
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `human-judgment` TR-2.1: 点击图片文件能打开媒体查看器并显示图片
  - `human-judgment` TR-2.2: 点击视频文件能打开媒体查看器并播放视频
  - `human-judgment` TR-2.3: 点击音频文件能打开媒体查看器并播放音频
- **Notes**: 当前 desktop.js 中已有 open-image-viewer 和 open-media-player 监听器，都指向 mediaviewer.app

## [ ] Task 3: 文件管理器添加文件夹 ZIP 下载功能
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 在文件管理器中添加下载文件夹的功能
  - 使用 JSZip 库将文件夹内容打包为 ZIP
  - 在文件操作按钮中添加下载按钮（文件夹时显示）
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `human-judgment` TR-3.1: 点击文件夹的下载按钮能生成 ZIP 文件并下载
  - `human-judgment` TR-3.2: ZIP 文件包含文件夹中的所有文件和子文件夹
- **Notes**: JSZip 已在 index.html 中引入

## [ ] Task 4: 修复用户切换桌面状态保存问题
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 检查 desktop.js 中的 switchUser 方法
  - 确保切换用户时正确保存当前用户状态
  - 确保加载新用户状态时正确恢复窗口布局
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `human-judgment` TR-4.1: 用户A打开窗口后切换到用户B，再切换回用户A，窗口布局应恢复
- **Notes**: 当前实现已有 saveState 和 loadState 方法，但可能存在时序问题

## [ ] Task 5: 删除用户时添加密码验证
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 修改 lock-screen.js 中的 _confirmDeleteUser 方法
  - 删除带密码的用户时要求输入密码验证
  - 删除无密码用户时直接确认删除
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `human-judgment` TR-5.1: 删除带密码的用户时需输入正确密码才能删除
  - `human-judgment` TR-5.2: 删除无密码用户时直接确认即可删除
- **Notes**: 使用 userManager.verifyPassword 方法验证密码

## [ ] Task 6: 用户管理与文件系统集成 - 创建用户时自动创建目录
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 修改 user-manager.js 中的 createUser 方法
  - 创建用户时自动在 /home/ 下创建同名目录
  - 确保 /home 目录存在
- **Acceptance Criteria Addressed**: AC-6
- **Test Requirements**:
  - `programmatic` TR-6.1: 创建用户 testuser 后，/home/testuser 目录应存在
- **Notes**: 需要引入文件系统操作逻辑

## [ ] Task 7: 用户管理与文件系统集成 - 删除用户时自动删除目录
- **Priority**: high
- **Depends On**: Task 6
- **Description**: 
  - 修改 user-manager.js 中的 deleteUser 方法
  - 删除用户时自动删除 /home/ 下的同名目录
- **Acceptance Criteria Addressed**: AC-7
- **Test Requirements**:
  - `programmatic` TR-7.1: 删除用户 testuser 后，/home/testuser 目录应不存在
- **Notes**: 需要处理目录不存在的情况

## [ ] Task 8: 用户管理与文件系统集成 - 重命名用户时同步目录名
- **Priority**: medium
- **Depends On**: Task 6, Task 7
- **Description**: 
  - 在 user-manager.js 中添加 renameUser 方法
  - 重命名用户时同步重命名 /home/ 下的目录
  - 在 lock-screen.js 中添加重命名用户的 UI
- **Acceptance Criteria Addressed**: AC-8
- **Test Requirements**:
  - `programmatic` TR-8.1: 将用户 testuser 重命名为 newuser 后，/home/testuser 应变为 /home/newuser
- **Notes**: 这是新增功能，需要添加 UI 入口

## [ ] Task 9: 操作浏览器验证修复效果
- **Priority**: high
- **Depends On**: 所有任务完成后
- **Description**: 
  - 启动本地服务器
  - 验证媒体文件打开功能
  - 验证媒体播放器图标
  - 验证文件夹 ZIP 下载功能
  - 验证用户切换桌面保存功能
  - 验证删除用户密码验证功能
  - 验证用户目录绑定功能
- **Acceptance Criteria Addressed**: 所有 AC
- **Test Requirements**:
  - `human-judgment` TR-9.1: 所有功能正常工作
- **Notes**: 使用浏览器工具验证

## [ ] Task 10: 提交代码到 GitHub main 分支
- **Priority**: medium
- **Depends On**: Task 9 验证通过
- **Description**: 
  - 合并所有修改到 main 分支
  - 推送到 GitHub 远程仓库
- **Acceptance Criteria Addressed**: 无（部署任务）
- **Test Requirements**:
  - `programmatic` TR-10.1: 代码成功推送到远程仓库