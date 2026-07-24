# Web Terminal OS - UI Bug修复实现计划

## [ ] Task 1: 修复低分辨率桌面图标堆叠问题
- **Priority**: high
- **Depends On**: None
- **Description**: 修复style.css中移动端桌面图标的样式，使其水平排列而不是垂直堆叠
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `human-judgement` TR-1.1: 窗口宽度小于768px时，桌面图标水平排列

## [ ] Task 2: 修复计算器显示溢出和表达式清空问题
- **Priority**: high
- **Depends On**: None
- **Description**: 修改calculator.app/app.js的update()方法，修复表达式显示和结果溢出问题
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `human-judgement` TR-2.1: 计算器表达式正确显示，不被清空
  - `human-judgement` TR-2.2: 计算器数字不溢出，显示正常

## [ ] Task 3: 修复锁屏界面public用户无法点击切换
- **Priority**: high
- **Depends On**: None
- **Description**: 修改lock-screen.js中用户点击逻辑，确保无密码用户可以正常切换
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `human-judgement` TR-3.1: 锁屏界面点击public用户（无密码）可直接切换

## [ ] Task 4: 为媒体查看器创建info.json配置文件
- **Priority**: medium
- **Depends On**: None
- **Description**: 创建mediaviewer.app/info.json配置文件，定义应用名称和窗口大小
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `programmatic` TR-4.1: info.json文件存在且内容正确
  - `human-judgement` TR-4.2: 媒体查看器窗口大小正确