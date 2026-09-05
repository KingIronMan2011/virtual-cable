use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize)]
pub struct WindowState {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

fn get_data_dir(app: &AppHandle) -> Option<PathBuf> {
    let path = app.path().app_data_dir().ok()?;
    if !path.exists() {
        fs::create_dir_all(&path).ok()?;
    }
    Some(path)
}

#[tauri::command]
pub async fn load_tunnels(app: AppHandle) -> serde_json::Value {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(path) = get_data_dir(&app).map(|dir| dir.join("tunnels.json")) else {
            return serde_json::json!([]);
        };
        fs::read_to_string(path)
            .ok()
            .and_then(|content| serde_json::from_str(&content).ok())
            .unwrap_or(serde_json::json!([]))
    })
    .await
    .unwrap_or(serde_json::json!([]))
}

#[tauri::command]
pub async fn save_tunnels(app: AppHandle, tunnels: serde_json::Value) {
    let _ = tauri::async_runtime::spawn_blocking(move || {
        if let (Some(path), Ok(content)) = (
            get_data_dir(&app).map(|dir| dir.join("tunnels.json")),
            serde_json::to_string_pretty(&tunnels),
        ) {
            let _ = fs::write(path, content);
        }
    })
    .await;
}

#[tauri::command]
pub async fn load_settings(app: AppHandle) -> serde_json::Value {
    tauri::async_runtime::spawn_blocking(move || {
        let default = serde_json::json!({
            "autoUpdate": true,
            "minimizeToTray": false,
            "hotkeys": {
                "addCable": "Ctrl+Alt+N",
                "toggleSettings": "Ctrl+Alt+,"
            }
        });
        let Some(path) = get_data_dir(&app).map(|dir| dir.join("settings.json")) else {
            return default;
        };
        fs::read_to_string(path)
            .ok()
            .and_then(|content| serde_json::from_str(&content).ok())
            .unwrap_or(default)
    })
    .await
    .unwrap_or_else(|_| serde_json::json!({}))
}

#[tauri::command]
pub async fn save_settings(app: AppHandle, settings: serde_json::Value) {
    let _ = tauri::async_runtime::spawn_blocking(move || {
        if let (Some(path), Ok(content)) = (
            get_data_dir(&app).map(|dir| dir.join("settings.json")),
            serde_json::to_string_pretty(&settings),
        ) {
            let _ = fs::write(path, content);
        }
    })
    .await;
}

#[tauri::command]
pub async fn load_window_state(app: AppHandle) -> Option<WindowState> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = get_data_dir(&app)?.join("window.json");
        serde_json::from_str(&fs::read_to_string(path).ok()?).ok()
    })
    .await
    .ok()
    .flatten()
}

#[tauri::command]
pub async fn save_window_state(app: AppHandle, state: WindowState) {
    let _ = tauri::async_runtime::spawn_blocking(move || {
        if let (Some(path), Ok(content)) = (
            get_data_dir(&app).map(|dir| dir.join("window.json")),
            serde_json::to_string_pretty(&state),
        ) {
            let _ = fs::write(path, content);
        }
    })
    .await;
}
