# 图片影音查看器与用户桌面隔离 - 实施计划

## [ ] Task 1: 创建图片查看器应用 (imageviewer.app)
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 创建 `apps/imageviewer.app/` 目录结构
  - 实现 `index.html` - 简约图片查看器界面
  - 实现 `style.css` - 深色主题，与现有应用风格一致
  - 实现 `app.js` - 从文件系统加载图片，支持URL参数打开
  - 创建 `icon.svg` - 图片查看器图标
  - 创建 `info.json` - 应用信息
- **Acceptance Criteria Addressed**: AC-1, AC-6
- **Test Requirements**:
  - `human-judgment` TR-1.1: 图片查看器界面简约，深色主题，图片居中显示
  - `human-judgment` TR-1.2: 通过URL参数 ?path= 可以正确打开并显示图片
  - `human-judgment` TR-1.3: 支持 jpg/png/gif/svg 等常见图片格式
  - `human-judgment` TR-1.4: 显示文件名，有关闭按钮
- **Notes**: 图片数据从 localStorage 的 web-terminal-os-data 读取，content 可能是 base64 或 data URL

## [ ] Task 2: 创建影音播放器应用 (mediaplayer.app)
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 创建 `apps/mediaplayer.app/` 目录结构
  - 实现 `index.html` - 简约播放器界面
  - 实现 `style.css` - 深色主题，与现有应用风格一致
  - 实现 `app.js` - 从文件系统加载媒体，支持URL参数打开
  - 创建 `icon.svg` - 播放器图标
  - 创建 `info.json` - 应用信息
  - 使用 HTML5 video/audio 原生控件
- **Acceptance Criteria Addressed**: AC-2, AC-7
- **Test Requirements**:
  - `human-judgment` TR-2.1: 影音播放器界面简约，深色主题
  - `human-judgment` TR-2.2: 通过URL参数 ?path= 可以正确打开并播放媒体
  - `human-judgment` TR-2.3: 支持 mp4/webm/mp3/wav 等常见格式
  - `human-judgment` TR-2.4: 使用原生播放器控件，显示文件名
- **Notes**: 视频和音频都使用 video 标签，音频时视频区域显示占位

## [ ] Task 3: 更新应用清单 (manifest.json)
- **Priority**: high
- **Depends On**: Task 1, Task 2
- **Description**: 
  - 在 `apps/manifest.json` 中添加图片查看器和影音播放器
- **Acceptance Criteria Addressed**: AC-1, AC-2
- **Test Requirements**:
  - `programmatic` TR-3.1: manifest.json 包含 imageviewer 和 mediaplayer 条目
- **Notes**:

## [ ] Task 4: 文件管理器集成媒体应用
- **Priority**: high
- **Depends On**: Task 1, Task 2, Task 3
- **Description**: 
  - 修改 `apps/filemanager.app/main/app.js`
  - 添加文件类型判断逻辑（图片、视频、音频、文本）
  - 点击图片文件时触发 `open-image-viewer` 事件
  - 点击音视频文件时触发 `open-media-player` 事件
  - 文本文件继续使用 `open-file-in-editor` 事件
- **Acceptance Criteria Addressed**: AC-1, AC-2
- **Test Requirements**:
  - `human-judgment` TR-4.1: 点击 .jpg/.png/.gif 文件时打开图片查看器
  - `human-judgment` TR-4.2: 点击 .mp4/.webm 文件时打开影音播放器
  - `human-judgment` TR-4.3: 点击 .mp3/.wav 文件时打开影音播放器
  - `human-judgment` TR-4.4: 点击 .txt/.md 文件时仍然打开文本编辑器
- **Notes**: 文件扩展名判断不区分大小写

## [ ] Task 5: 桌面管理器集成媒体应用事件
- **Priority**: high
- **Depends On**: Task 4
- **Description**: 
  - 修改 `src/desktop.js`
  - 监听 `open-image-viewer` 事件，打开图片查看器并传递路径参数
  - 监听 `open-media-player` 事件，打开影音播放器并传递路径参数
- **Acceptance Criteria Addressed**: AC-1, AC-2
- **Test Requirements**:
  - `human-judgment` TR-5.1: 文件管理器点击图片时，桌面管理器打开图片查看器
  - `human-judgment` TR-5.2: 文件管理器点击媒体时，桌面管理器打开影音播放器
- **Notes**: 与 texteditor.app 的集成方式一致

## [ ] Task 6: 文件管理器用户间文件访问密码验证
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 修改 `apps/filemanager.app/main/app.js`
  - 添加权限检查逻辑，访问其他用户目录时检查密码
  - 添加密码输入对话框UI
  - 验证成功后允许访问，会话期间保持验证状态
  - 验证失败显示错误提示
  - 无密码用户可直接访问
- **Acceptance Criteria Addressed**: AC-4, AC-5
- **Test Requirements**:
  - `human-judgment` TR-6.1: 访问有密码用户的目录时弹出密码输入框
  - `human-judgment` TR-6.2: 输入正确密码后可以进入目录浏览
  - `human-judgment` TR-6.3: 输入错误密码时显示错误提示
  - `human-judgment` TR-6.4: 访问无密码用户的目录时直接进入
  - `human-judgment` TR-6.5: 验证成功后同一会话内再次访问无需重复输入
- **Notes**: 
  - 当前用户从 localStorage 的 web-terminal-os-current-user 读取
  - 用户信息从 localStorage 的 web-terminal-os-users 读取
  - 验证状态存在内存中，刷新页面后失效

## [ ] Task 7: 用户桌面隔离
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 修改 `src/desktop.js`
  - 桌面状态存储键改为包含用户名（如 `webos-gui-state-{username}`）
  - 切换用户时保存当前用户状态，加载新用户状态
  - 监听 `user-switched` 事件，切换用户桌面状态
  - 关闭所有当前窗口，恢复新用户的窗口布局
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `human-judgment` TR-7.1: 每个用户有独立的窗口状态存储
  - `human-judgment` TR-7.2: 切换用户后，桌面窗口布局与切换前对应用户的状态一致
  - `human-judgment` TR-7.3: 新用户首次登录时桌面为空（或只有默认终端）
- **Notes**: 
  - 用户切换时需要关闭所有现有窗口再恢复新用户状态
  - 终端窗口的路径信息也要保存和恢复

## [ ] Task 8: 更新版本号与集成测试
- **Priority**: medium
- **Depends On**: Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7
- **Description**: 
  - 更新所有相关文件的版本号
  - 在浏览器中测试所有功能
- **Acceptance Criteria Addressed**: All
- **Test Requirements**:
  - `human-judgment` TR-8.1: 浏览器测试所有功能正常工作
- **Notes**:

# Task Dependencies
- [Task 3] depends on [Task 1], [Task 2]
- [Task 4] depends on [Task 1], [Task 2], [Task 3]
- [Task 5] depends on [Task 4]
- [Task 8] depends on [Task 1], [Task 2], [Task 3], [Task 4], [Task 5], [Task 6], [Task 7]
