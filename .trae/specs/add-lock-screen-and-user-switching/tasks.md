# Tasks

- [x] Task 1: 创建锁屏界面模块（LockScreen）
  - [x] SubTask 1.1: 创建 `src/lock-screen.js`，实现 LockScreen 类
  - [x] SubTask 1.2: 锁屏 DOM 由 JS 动态创建并挂载到 document.body
  - [x] SubTask 1.3: 在 `style.css` 中添加锁屏界面样式（全屏覆盖、用户名显示、密码输入框、解锁按钮）

- [x] Task 2: 创建用户切换面板模块（UserSwitcher）
  - [x] SubTask 2.1: 创建 `src/user-switcher.js`，实现 UserSwitcher 类
  - [x] SubTask 2.2: 用户切换面板 DOM 由 JS 动态创建并挂载到 document.body
  - [x] SubTask 2.3: 在 `style.css` 中添加用户切换面板样式（用户列表、密码输入、切换按钮）

- [x] Task 3: 任务栏集成用户区域
  - [x] SubTask 3.1: 在 `index.html` 任务栏中添加用户区域 DOM
  - [x] SubTask 3.2: 在 `style.css` 中添加任务栏用户区域样式
  - [x] SubTask 3.3: 在 `desktop.js` 中实现任务栏用户区域逻辑（显示用户名、点击打开面板、锁定选项）

- [x] Task 4: 修改 BootManager 启动流程
  - [x] SubTask 4.1: 在 `boot-manager.js` 的 `enterGUI()` 中添加锁屏检查逻辑
  - [x] SubTask 4.2: 若需要锁屏，先显示锁屏界面，解锁后再调用 `initDesktop()`

- [x] Task 5: 实现全局用户切换事件机制
  - [x] SubTask 5.1: 定义用户切换事件名 `user-switched` 和事件 detail 格式 `{ username }`
  - [x] SubTask 5.2: 在 `user-switcher.js` 的 `_doSwitch` 中广播 `user-switched` 事件
  - [x] SubTask 5.3: 在 `terminal.js` 中监听 `user-switched` 事件，更新 currentUser、路径和提示符

- [x] Task 6: 集成测试与缓存版本号更新
  - [x] SubTask 6.1: 更新 `index.html` 中所有 JS 引用的版本号
  - [x] SubTask 6.2: 验证锁屏、解锁、用户切换、任务栏更新、终端窗口同步等功能

# Task Dependencies
- [Task 3] depends on [Task 2]（任务栏用户区域需要打开用户切换面板）
- [Task 4] depends on [Task 1]（BootManager 需要使用 LockScreen）
- [Task 5] depends on [Task 2]（事件广播在用户切换后触发）
- [Task 6] depends on [Task 1], [Task 2], [Task 3], [Task 4], [Task 5]
