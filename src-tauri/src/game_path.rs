// 游戏路径发现与识别
// 依据: docs/tasks/2026_10_20__003__launcher__m2_game_launch_tasks.md M2-T1
use serde::Serialize;

/// 识别结果:server 为 "cn" | "bili" | "os"
#[derive(Serialize)]
pub struct GameInfo {
    pub exe: String,
    pub server: String,
    pub channel: i64,
    pub sub_channel: i64,
    pub is_bili: bool,
}

/// 校验 exe 并读取其 config.ini,返回识别信息
pub fn inspect(exe: &str) -> Result<GameInfo, String> {
    let path = std::path::Path::new(exe);
    if !path.is_file() {
        return Err(format!("文件不存在:{exe}"));
    }
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_lowercase();
    let dir = path.parent().ok_or("无法取得游戏所在目录")?;

    // B 服特征:YuanShen_Data/Plugins/PCGameSDK.dll
    let is_bili = dir.join("YuanShen_Data").join("Plugins").join("PCGameSDK.dll").exists();

    let server = if name.contains("yuanshen") {
        if is_bili { "bili" } else { "cn" }
    } else if name.contains("genshinimpact") {
        "os"
    } else {
        return Err("无法识别的游戏主程序(期望 YuanShen.exe 或 GenshinImpact.exe)".into());
    };

    let (channel, sub_channel) = crate::game_config::read_channels(dir)?;
    Ok(GameInfo {
        exe: exe.to_string(),
        server: server.to_string(),
        channel,
        sub_channel,
        is_bili,
    })
}

/// Windows:从 Unity output_log.txt 提取安装目录;其他平台返回 None
pub fn detect() -> Option<String> {
    if !cfg!(target_os = "windows") {
        return None;
    }
    let local = std::env::var_os("LOCALAPPDATA")?;
    let locallow = std::path::Path::new(&local).parent()?.join("LocalLow").join("miHoYo");
    for sub in ["Genshin Impact", "原神"] {
        let log = locallow.join(sub).join("output_log.txt");
        let Ok(content) = std::fs::read_to_string(&log) else {
            continue;
        };
        // warmup 行形如:... "C:/Program Files/Genshin Impact/GenshinImpact_Data/..."
        // 手工解析:找 *_Data 标记,向前回溯到引号(不引 regex 依赖)
        for marker in ["GenshinImpact_Data", "YuanShen_Data"] {
            let Some(idx) = content.find(marker) else { continue };
            let before = &content[..idx];
            let Some(start) = before.rfind('"') else { continue };
            let dir = before[start + 1..].replace('/', "\\");
            if dir.len() < 3 || !dir[1..].starts_with(':') {
                continue;
            }
            let exe_name = marker.strip_suffix("_Data").unwrap_or(marker);
            let exe = std::path::Path::new(&dir).join(format!("{exe_name}.exe"));
            if exe.is_file() {
                return exe.to_str().map(str::to_string);
            }
        }
    }
    None
}
