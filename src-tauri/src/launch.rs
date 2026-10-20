// 游戏进程启动与运行检测
// 依据: docs/tasks/2026_10_20__003__launcher__m2_game_launch_tasks.md M2-T3
// 原则:std::process 直接启动,不提权、不注入、不挂起(注入类功能按用户决策不实现)
use std::path::Path;

/// 启动游戏(工作目录设为 exe 所在目录,Unity 需要)
pub fn launch(exe: &str, args: &[String]) -> Result<(), String> {
    let path = Path::new(exe);
    if !path.is_file() {
        return Err(format!("游戏主程序不存在:{exe}"));
    }
    let dir = path.parent().ok_or("无法取得游戏所在目录")?;
    std::process::Command::new(path)
        .args(args)
        .current_dir(dir)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("启动失败:{e}"))
}

/// 游戏是否运行中(Windows 走 tasklist,其他平台走 pgrep)
pub fn is_running() -> bool {
    const NAMES: [&str; 2] = ["YuanShen", "GenshinImpact"];
    if cfg!(target_os = "windows") {
        let Ok(out) = std::process::Command::new("tasklist")
            .args(["/FO", "CSV", "/NH"])
            .output()
        else {
            return false;
        };
        let list = String::from_utf8_lossy(&out.stdout).to_lowercase();
        NAMES.iter().any(|n| list.contains(&format!("{}.exe", n.to_lowercase())))
    } else {
        NAMES.iter().any(|n| {
            std::process::Command::new("pgrep")
                .args(["-x", n])
                .status()
                .map(|s| s.success())
                .unwrap_or(false)
        })
    }
}
