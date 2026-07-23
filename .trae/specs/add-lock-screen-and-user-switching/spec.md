# 切换用户和锁定界面 Spec

## Why
当前系统启动后直接以默认 `public` 用户进入桌面，无登录界面。用户切换只能通过终端 `account switch` 命令完成，使用浏览器原生 `prompt()` 输入密码，体验差且 GUI 层完全不感知当前用户。需要一个图形化的锁屏/登录界面和用户切换面板，使系统具备正式操作系统的用户身份管理能力。

## What Changes
- 新增锁屏界面（LockScreen）：全屏覆盖层，显示当前用户名和密码输入框，验证通过后进入桌面
- 新增用户切换面板（UserSwitcher）：从任务栏触发，显示所有用户列表，支持点击切换
- 任务栏新增用户区域：显示当前用户名，点击打开用户切换面板
- BootManager 启动流程修改：进入 GUI 前先检查是否需要锁屏（有非 public 用户且设密码时显示锁屏）
- 新增用户切换事件机制：切换用户后通知所有终端窗口更新上下文
- 支持手动锁屏：任务栏用户菜单提供"锁定"选项

## Impact
- Affected code:
  - `src/lock-screen.js`（新增）
  - `src/user-switcher.js`（新增）
  - `src/boot-manager.js`（修改启动流程）
  - `src/desktop.js`（任务栏集成、用户切换事件监听）
  - `src/terminal.js`（响应全局用户切换事件）
  - `src/user-manager.js`（可能扩展方法）
  - `index.html`（新增锁屏和用户切换面板的 DOM 结构）
  - `style.css`（新增锁屏和用户切换面板样式）

## ADDED Requirements

### Requirement: 锁屏界面
系统 SHALL 提供全屏锁屏界面，覆盖在桌面之上，显示当前用户名和密码输入框。

#### Scenario: 无密码用户解锁
- **WHEN** 锁屏界面显示且当前用户无密码
- **THEN** 显示"点击解锁"按钮，点击后直接进入桌面

#### Scenario: 有密码用户解锁
- **WHEN** 锁屏界面显示且当前用户有密码
- **THEN** 显示密码输入框，输入正确密码后进入桌面；输入错误显示错误提示

#### Scenario: 系统启动锁屏
- **WHEN** 系统启动且存在非 public 的有密码用户
- **THEN** 进入 GUI 前先显示锁屏界面

#### Scenario: 手动锁屏
- **WHEN** 用户从任务栏用户菜单点击"锁定"
- **THEN** 桌面被锁屏界面覆盖，需要密码解锁

### Requirement: 用户切换面板
系统 SHALL 提供用户切换面板，从任务栏用户区域触发，显示所有用户列表。

#### Scenario: 打开用户切换面板
- **WHEN** 用户点击任务栏的用户区域
- **THEN** 弹出用户切换面板，显示所有用户名列表

#### Scenario: 切换到无密码用户
- **WHEN** 用户在切换面板点击无密码用户
- **THEN** 直接切换到该用户，关闭面板，所有终端窗口更新上下文

#### Scenario: 切换到有密码用户
- **WHEN** 用户在切换面板点击有密码用户
- **THEN** 显示密码输入框，验证通过后切换用户

### Requirement: 任务栏用户区域
系统 SHALL 在任务栏显示当前用户名，点击可打开用户切换面板和锁定选项。

#### Scenario: 显示当前用户
- **WHEN** 桌面初始化完成
- **THEN** 任务栏显示当前登录用户名

#### Scenario: 用户切换后更新
- **WHEN** 用户切换成功
- **THEN** 任务栏用户名更新为新用户

### Requirement: 全局用户切换事件
系统 SHALL 在用户切换时广播事件，通知所有终端窗口更新用户上下文。

#### Scenario: 终端窗口响应切换
- **WHEN** 用户切换事件触发
- **THEN** 所有打开的终端窗口更新 currentUser、文件系统路径和提示符

## MODIFIED Requirements

### Requirement: 启动流程
BootManager 进入 GUI 前 SHALL 检查是否需要锁屏。若有非 public 用户且当前用户有密码，则先显示锁屏界面；否则直接进入桌面。
