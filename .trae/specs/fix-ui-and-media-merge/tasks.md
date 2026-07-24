# Web Terminal OS - UI修复与媒体合并实现计划

## [x] Task 1: 删除开机序列终端标题栏
- **Priority**: high
- **Depends On**: None
- **Description**: 删除index.html中boot-screen终端的标题栏元素
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `human-judgement` TR-1.1: 开机序列终端无标题栏显示

## [x] Task 2: 文件管理器替换alert/confirm/prompt为自定义弹窗
- **Priority**: high
- **Depends On**: None
- **Description**: 在filemanager.app中创建自定义弹窗组件，替换所有alert/confirm/prompt调用
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `human-judgement` TR-2.1: 删除文件时显示自定义确认框
  - `human-judgement` TR-2.2: 重命名文件时显示自定义输入框
  - `human-judgement` TR-2.3: 保护目录操作时显示自定义警告

## [x] Task 3: 图片查看器替换alert为自定义弹窗（将被任务7合并）
- **Priority**: high
- **Depends On**: None
- **Description**: 将在统一媒体查看器中实现

## [x] Task 4: 影音播放器替换alert为自定义弹窗（将被任务7合并）
- **Priority**: high
- **Depends On**: None
- **Description**: 将在统一媒体查看器中实现

## [x] Task 5: 修复文件管理器刷新按钮保留当前路径
- **Priority**: high
- **Depends On**: None
- **Description**: 修改refresh按钮点击事件，在loadFS前保存当前路径，之后重新导航
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `programmatic` TR-5.1: 在子目录点击刷新后路径不变

## [x] Task 6: 修复切换用户后桌面图标显示
- **Priority**: high
- **Depends On**: None
- **Description**: 在desktop.js的switchUser方法中重新渲染桌面图标
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `human-judgement` TR-6.1: 切换用户后桌面图标正常显示

## [x] Task 7: 合并图片查看器和影音播放器为统一媒体查看器
- **Priority**: high
- **Depends On**: Task 3, Task 4
- **Description**: 创建统一的mediaviewer.app，整合图片和媒体播放功能，支持图片、视频、音频
- **Acceptance Criteria Addressed**: AC-5, AC-6
- **Test Requirements**:
  - `human-judgement` TR-7.1: 双击图片文件打开媒体查看器显示图片
  - `human-judgement` TR-7.2: 双击视频文件打开媒体查看器播放视频
  - `human-judgement` TR-7.3: 双击音频文件打开媒体查看器播放音频
  - `human-judgement` TR-7.4: 媒体查看器包含打开按钮

## [x] Task 8: 更新manifest和desktop配置
- **Priority**: medium
- **Depends On**: Task 7
- **Description**: 更新apps/manifest.json移除旧应用，添加新mediaviewer；更新desktop.js的事件监听
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `human-judgement` TR-8.1: 文件管理器能正确打开媒体查看器

## [/] Task 9: 更新GitHub仓库
- **Priority**: medium
- **Depends On**: 所有其他任务
- **Description**: 将所有修改推送到guanmuzhi/WEBSITE-仓库
- **Acceptance Criteria Addressed**: 所有
- **Test Requirements**:
  - `programmatic` TR-9.1: 代码成功推送到GitHub