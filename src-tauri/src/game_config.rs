// config.ini 的 channel/sub_channel 读写(写前备份)
// 依据: docs/tasks/2026_10_20__003__launcher__m2_game_launch_tasks.md M2-T2
// 已知方案:国服官服 1/1、B 服 14/*、国际服 1/0(Snap.Hutao KnownLaunchSchemes)
use std::path::Path;

fn ini_path(dir: &Path) -> std::path::PathBuf {
    dir.join("config.ini")
}

/// 读取 channel/sub_channel;文件不存在返回 (0, 0) 由调用方决定是否写回
pub fn read_channels(dir: &Path) -> Result<(i64, i64), String> {
    let ini = ini_path(dir);
    if !ini.exists() {
        return Ok((0, 0));
    }
    let content = std::fs::read_to_string(&ini).map_err(|e| format!("读取 config.ini 失败:{e}"))?;
    let mut channel = 0;
    let mut sub_channel = 0;
    for line in content.lines() {
        let l = line.trim();
        if let Some(v) = l.strip_prefix("channel=") {
            channel = v.trim().parse().unwrap_or(0);
        } else if let Some(v) = l.strip_prefix("sub_channel=") {
            sub_channel = v.trim().parse().unwrap_or(0);
        }
    }
    Ok((channel, sub_channel))
}

/// 写回 channel/sub_channel:先复制 config.ini → config.ini.bak,再原位替换这两个键(其余内容保留)
pub fn set_channels(dir: &Path, channel: i64, sub_channel: i64) -> Result<(), String> {
    let ini = ini_path(dir);
    let original = if ini.exists() {
        let content = std::fs::read_to_string(&ini).map_err(|e| format!("读取 config.ini 失败:{e}"))?;
        std::fs::copy(&ini, dir.join("config.ini.bak"))
            .map_err(|e| format!("备份 config.ini 失败:{e}"))?;
        content
    } else {
        String::from("[general]\r\n")
    };

    let mut out_lines: Vec<String> = Vec::new();
    let mut wrote_channel = false;
    let mut wrote_sub = false;
    let mut has_general = false;
    for line in original.lines() {
        let trimmed = line.trim();
        if trimmed.eq_ignore_ascii_case("[general]") {
            has_general = true;
        }
        if trimmed.starts_with("channel=") {
            out_lines.push(format!("channel={channel}"));
            wrote_channel = true;
        } else if trimmed.starts_with("sub_channel=") {
            out_lines.push(format!("sub_channel={sub_channel}"));
            wrote_sub = true;
        } else {
            out_lines.push(line.to_string());
        }
    }
    if !has_general {
        out_lines.insert(0, "[general]".to_string());
    }
    if !wrote_channel {
        out_lines.push(format!("channel={channel}"));
    }
    if !wrote_sub {
        out_lines.push(format!("sub_channel={sub_channel}"));
    }

    std::fs::write(&ini, out_lines.join("\r\n") + "\r\n").map_err(|e| format!("写入 config.ini 失败:{e}"))
}
