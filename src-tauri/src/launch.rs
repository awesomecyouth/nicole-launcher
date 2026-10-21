// 游戏进程启动与运行检测
// 依据: docs/tasks/2026_10_20__003__launcher__m2_game_launch_tasks.md M2-T3
// 原则:不注入、不挂起(注入类功能按用户决策不实现)
use std::path::Path;

/// Windows:ShellExecuteW + runas verb。
/// 游戏主程序 manifest 要求管理员权限,CreateProcess(std::process)会得到 os error 740;
/// ShellExecute 走 shell 提升链路,由 UAC 弹窗授权(与参考实现 ShellExecuteEx runas 一致)。
#[cfg(target_os = "windows")]
fn spawn_elevated(exe: &str, args: &[String], dir: &str) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "shell32")]
    unsafe extern "system" {
        fn ShellExecuteW(
            hwnd: *mut core::ffi::c_void,
            verb: *const u16,
            file: *const u16,
            params: *const u16,
            dir: *const u16,
            show: i32,
        ) -> isize;
    }

    fn wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
    }

    let verb = wide("runas");
    let file = wide(exe);
    // Unity 启动参数与票据均不含空格,可直接拼接
    let params = wide(&args.join(" "));
    let dir_w = wide(dir);
    // SW_SHOWNORMAL = 1
    let code = unsafe {
        ShellExecuteW(std::ptr::null_mut(), verb.as_ptr(), file.as_ptr(), params.as_ptr(), dir_w.as_ptr(), 1)
    };
    if code <= 32 {
        Err(format!("启动失败(ShellExecute 码 {code});若在 UAC 弹窗中点了「否」也会出现此错误"))
    } else {
        Ok(())
    }
}

/// 启动游戏(Windows 经 ShellExecute 提权;其他平台 std::process,工作目录设为 exe 所在目录)
pub fn launch(exe: &str, args: &[String]) -> Result<(), String> {
    let path = Path::new(exe);
    if !path.is_file() {
        return Err(format!("游戏主程序不存在:{exe}"));
    }
    let dir = path.parent().ok_or("无法取得游戏所在目录")?;

    #[cfg(target_os = "windows")]
    {
        spawn_elevated(exe, args, &dir.to_string_lossy())
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new(path)
            .args(args)
            .current_dir(dir)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("启动失败:{e}"))
    }
}

const GAME_NAMES: [&str; 2] = ["YuanShen.exe", "GenshinImpact.exe"];

/// 游戏是否运行中(同步实现)
/// Windows:tasklist 带 IMAGENAME 过滤 + CREATE_NO_WINDOW(release 为 GUI 子系统,
/// 不加该标志每次拉起控制台程序都会闪一个 cmd 窗口,且每 5s 一次造成周期卡顿)
/// 其他平台:pgrep
pub fn is_running_blocking() -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;

        GAME_NAMES.iter().any(|name| {
            let Ok(out) = std::process::Command::new("tasklist")
                .args(["/FI", &format!("IMAGENAME eq {name}"), "/FO", "CSV", "/NH"])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
            else {
                return false;
            };
            // CSV 行首形如 "YuanShen.exe","1234",...;无匹配时 tasklist 输出 INFO 提示(不含 .exe)
            String::from_utf8_lossy(&out.stdout).to_lowercase().contains(&name.to_lowercase())
        })
    }
    #[cfg(not(target_os = "windows"))]
    {
        GAME_NAMES.iter().any(|name| {
            let process = name.trim_end_matches(".exe");
            std::process::Command::new("pgrep")
                .args(["-x", process])
                .status()
                .map(|s| s.success())
                .unwrap_or(false)
        })
    }
}

/// 异步包装:进程枚举有 IO 开销,移出命令执行线程,避免监控轮询(5s)造成 UI 卡顿
pub async fn is_running() -> bool {
    tauri::async_runtime::spawn_blocking(is_running_blocking)
        .await
        .unwrap_or(false)
}
