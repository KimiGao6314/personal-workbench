-- 卸载「我的工作台」工具
-- 产物：dist/卸载我的工作台.app（osacompile）
on run
	set theAnswer to button returned of (display dialog "即将卸载「我的工作台」桌面应用。" & return & return & "你的待办、课程表、项目、设备台账、外借记录与背景等用户数据要如何处理？" buttons {"取消", "保留数据，仅卸载", "连同数据一起卸载"} default button "保留数据，仅卸载" with title "卸载 我的工作台" with icon caution)
	if theAnswer is "取消" then return

	-- 先退出正在运行的工作台
	try
		tell application "我的工作台" to quit
	end try
	delay 1

	if theAnswer is "连同数据一起卸载" then
		try
			do shell script "rm -rf '/Applications/我的工作台.app'; rm -rf \"$HOME/Library/Application Support/我的工作台\""
		on error errMsg
			display dialog "删除需要管理员权限：" & return & errMsg & return & return & "请点「继续」输入密码完成删除。" buttons {"取消", "继续"} default button "继续"
			if button returned of result is "继续" then
				do shell script "rm -rf '/Applications/我的工作台.app'; rm -rf \"$HOME/Library/Application Support/我的工作台\"" with administrator privileges
			else
				return
			end if
		end try
		display dialog "卸载完成。" & return & "应用已删除，用户数据也已一并清空。" buttons {"好"} default button "好" with icon note
	else
		try
			do shell script "rm -rf '/Applications/我的工作台.app'"
		on error errMsg
			display dialog "删除应用需要管理员权限：" & return & errMsg & return & return & "请点「继续」输入密码完成删除。" buttons {"取消", "继续"} default button "继续"
			if button returned of result is "继续" then
				do shell script "rm -rf '/Applications/我的工作台.app'" with administrator privileges
			else
				return
			end if
		end try
		display dialog "卸载完成（已保留用户数据）。" & return & "重新安装后，会自动恢复你之前的待办、课程表、项目、设备台账、外借记录与背景设置。" buttons {"好"} default button "好" with icon note
	end if
end run
