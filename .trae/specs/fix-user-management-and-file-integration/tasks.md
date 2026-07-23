# 用户管理修复与文件集成 - 实施计划

## [x] Task 1: UserManager 添加 reload() 方法
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 在 `src/user-manager.js` 中添加 `reload()` 方法，重新从 localStorage 加载用户列表
- **Acceptance Criteria Addressed**: AC-2, AC-3
- **Test Requirements**:
  - `programmatic` TR-1.1: `reload()` 方法调用后，`this.users` 数组与 localStorage 中的数据一致
  - `human-judgment` TR-1.2: 代码简洁，与现有方法风格一致

## [x] Task 2: 锁定界面添加创建用户功能
- **Priority**: high
- **Depends On**: Task 1
- **Description**: 
  - 修改 `src/lock-screen.js`，添加"创建用户"按钮和表单
  - 创建用户时调用 `userManager.createUser()` 和 `userManager.reload()`
  - 创建成功后切换到新用户的解锁界面
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `human-judgment` TR-2.1: 锁定界面显示"创建用户"按钮，点击后显示用户名/密码输入表单
  - `human-judgment` TR-2.2: 创建成功后自动切换到新用户，可直接解锁

## [x] Task 3: 终端 account 命令广播全局事件
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 修改 `src/terminal.js` 的 `handleAccountNew()` 和 `handleAccountDelete()`，成功后广播 `users-changed` 事件
  - 修改 `handleAccountSwitch()`，成功后广播 `user-switched` 事件
- **Acceptance Criteria Addressed**: AC-2, AC-3
- **Test Requirements**:
  - `human-judgment` TR-3.1: 终端创建用户后，切换面板能看到新用户
  - `human-judgment` TR-3.2: 终端切换用户后，其他终端窗口和任务栏同步更新

## [x] Task 4: UserSwitcher 监听 users-changed 事件
- **Priority**: high
- **Depends On**: Task 1, Task 3
- **Description**: 
  - 修改 `src/user-switcher.js`，在构造函数中监听 `users-changed` 事件
  - 事件触发时调用 `userManager.reload()` 和 `_renderUserList()`
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `human-judgment` TR-4.1: 终端创建用户后，切换面板打开时自动显示新用户

## [x] Task 5: 文件管理器禁止操作特殊目录
- **Priority**: medium
- **Depends On**: None
- **Description**: 
  - 修改 `apps/filemanager.app/main/app.js`
  - 禁止重命名：`home`, `tmp`, `/home` 下的用户目录
  - 禁止删除：`home`, `tmp`, `/home` 下的用户目录
- **Acceptance Criteria Addressed**: AC-4, AC-5
- **Test Requirements**:
  - `human-judgment` TR-5.1: 尝试重命名 `home` 目录时显示错误提示
  - `human-judgment` TR-5.2: 尝试删除 `public` 目录时显示错误提示

## [x] Task 6: 文本编辑器读取/写入文件系统
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 修改 `apps/texteditor.app/main/app.js`，读取/写入 localStorage 的 `web-terminal-os-data` 文件系统
  - 支持通过 URL 参数 `?path=/home/public/welcome.txt` 打开指定文件
  - 删除独立存储逻辑（webos-texteditor-前缀）
- **Acceptance Criteria Addressed**: AC-6, AC-7
- **Test Requirements**:
  - `human-judgment` TR-6.1: 打开文件管理器中的文件时，文本编辑器显示正确内容
  - `human-judgment` TR-6.2: 编辑并保存后，文件系统中的文件内容更新

## [x] Task 7: 文件管理器与文本编辑器集成
- **Priority**: high
- **Depends On**: Task 6
- **Description**: 
  - 修改 `apps/filemanager.app/main/app.js`，点击文件时触发全局事件 `open-file-in-editor`
  - 修改 `src/desktop.js`，监听 `open-file-in-editor` 事件，打开文本编辑器并传递路径参数
- **Acceptance Criteria Addressed**: AC-6
- **Test Requirements**:
  - `human-judgment` TR-7.1: 在文件管理器中点击文件时，文本编辑器打开并显示文件内容

## [x] Task 8: 更新版本号与集成测试
- **Priority**: medium
- **Depends On**: All previous tasks
- **Description**: 
  - 更新 `index.html` 中所有 JS/CSS 引用的版本号
  - 验证所有功能正常工作
- **Acceptance Criteria Addressed**: All
- **Test Requirements**:
  - `human-judgment` TR-8.1: 浏览器强制刷新后所有功能正常

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 4] depends on [Task 1], [Task 3]
- [Task 7] depends on [Task 6]
- [Task 8] depends on [Task 1], [Task 2], [Task 3], [Task 4], [Task 5], [Task 6], [Task 7]
