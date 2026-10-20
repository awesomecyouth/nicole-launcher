mod game_config;
mod game_path;
mod launch;

use game_path::GameInfo;

#[tauri::command]
fn is_windows() -> bool {
    cfg!(target_os = "windows")
}

/// 自动探测游戏路径(仅 Windows;其余平台返回 None)
#[tauri::command]
fn detect_game_path() -> Option<GameInfo> {
    game_path::detect().and_then(|exe| game_path::inspect(&exe).ok())
}

/// 校验手动选择的 exe 并读取其 config.ini
#[tauri::command]
fn inspect_game_path(exe: String) -> Result<GameInfo, String> {
    game_path::inspect(&exe)
}

/// 写回 channel/sub_channel(带备份)
#[tauri::command]
fn set_game_channels(exe: String, channel: i64, sub_channel: i64) -> Result<(), String> {
    let dir = std::path::Path::new(&exe)
        .parent()
        .ok_or("无法取得游戏所在目录")?;
    game_config::set_channels(dir, channel, sub_channel)
}

#[tauri::command]
fn launch_game(exe: String, args: Vec<String>) -> Result<(), String> {
    launch::launch(&exe, &args)
}

#[tauri::command]
fn is_game_running() -> bool {
    launch::is_running()
}

/// 追加一行日志到系统日志目录(时间戳由前端生成,保持本地时区可读)
#[tauri::command]
fn append_log(app: tauri::AppHandle, line: String) -> Result<(), String> {
    use tauri::Manager;
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("nicole.log"))
        .map_err(|e| e.to_string())?;
    use std::io::Write;
    file.write_all(format!("{line}\n").as_bytes()).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            is_windows,
            detect_game_path,
            inspect_game_path,
            set_game_channels,
            launch_game,
            is_game_running,
            append_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
