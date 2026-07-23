# 验证检查清单

- [x] UserManager 添加了 reload() 方法，能重新从 localStorage 加载用户列表
- [x] 锁定界面显示"创建用户"按钮，点击后显示用户名/密码输入表单
- [x] 锁定界面创建用户成功后自动切换到新用户，可直接解锁
- [x] 终端 account new/delete 命令执行后广播 users-changed 事件
- [x] 终端 account switch 命令执行成功后广播 user-switched 事件
- [x] UserSwitcher 监听 users-changed 事件，自动刷新用户列表
- [x] 文件管理器禁止重命名 home、tmp、用户目录
- [x] 文件管理器禁止删除 home、tmp、用户目录
- [x] 文本编辑器能够读取文件系统（web-terminal-os-data）中的文件
- [x] 文本编辑器能够保存文件到文件系统
- [x] 文本编辑器支持通过 URL 参数打开指定路径的文件
- [x] 文件管理器点击文件时，文本编辑器打开并显示文件内容
- [x] 所有 JS/CSS 文件版本号已更新
