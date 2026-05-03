use tauri::{AppHandle, Manager};
use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct WindowState {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

fn get_data_dir(app: &AppHandle) -> PathBuf {
    let path = app.path().app_data_dir().expect("Failed to get app data dir");
    if !path.exists() {
        let _ = fs::create_dir_all(&path);
    }
    path
}

#[tauri::command]
pub fn load_tunnels(app: AppHandle) -> serde_json::Value {
    let path = get_data_dir(&app).join("tunnels.json");
    if path.exists() {
        let content = fs::read_to_string(path).unwrap_or_else(|_| "[]".to_string());
        serde_json::from_str(&content).unwrap_or(serde_json::json!([]))
    } else {
        serde_json::json!([])
    }
}

#[tauri::command]
pub fn save_tunnels(app: AppHandle, tunnels: serde_json::Value) {
    let path = get_data_dir(&app).join("tunnels.json");
    if let Ok(content) = serde_json::to_string_pretty(&tunnels) {
        let _ = fs::write(path, content);
    }
}

#[tauri::command]
pub fn load_settings(app: AppHandle) -> serde_json::Value {
    let path = get_data_dir(&app).join("settings.json");
    if path.exists() {
        let content = fs::read_to_string(path).unwrap_or_else(|_| "{}".to_string());
        serde_json::from_str(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({
            "autoUpdate": true,
            "minimizeToTray": false,
            "hotkeys": {
                "addCable": "Ctrl+Alt+N",
                "toggleSettings": "Ctrl+Alt+,"
            }
        })
    }
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: serde_json::Value) {
    let path = get_data_dir(&app).join("settings.json");
    if let Ok(content) = serde_json::to_string_pretty(&settings) {
        let _ = fs::write(path, content);
    }
}

#[tauri::command]
pub fn load_window_state(app: AppHandle) -> Option<WindowState> {
    let path = get_data_dir(&app).join("window.json");
    if path.exists() {
        let content = fs::read_to_string(path).ok()?;
        serde_json::from_str(&content).ok()
    } else {
        None
    }
}

#[tauri::command]
pub fn save_window_state(app: AppHandle, state: WindowState) {
    let path = get_data_dir(&app).join("window.json");
    if let Ok(content) = serde_json::to_string_pretty(&state) {
        let _ = fs::write(path, content);
    }
}
