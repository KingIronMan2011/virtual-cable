use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Emitter};
use std::sync::OnceLock;

// --- Modules ---
pub mod audio;
pub mod storage;
pub mod system;
pub mod ui;

// --- Data Models ---

/// Serializable audio device for UI (camelCase fields for JSON compatibility)
#[derive(Serialize)]
#[allow(non_snake_case)]
struct AudioDeviceDTO {
    id: i32,
    name: String,
    maxInputChannels: i32,
    maxOutputChannels: i32,
    hostAPIName: String,
    defaultSampleRate: i32,
    isVirtual: bool,
    virtualLabel: Option<String>,
}

/// Serializable audio app for UI
#[derive(Serialize)]
struct AudioAppDTO {
    pid: u32,
    name: String,
    exe: String,
}

#[derive(Deserialize)]
#[allow(non_snake_case)]
struct TunnelInput {
    deviceId: i32,
    appPid: Option<u32>,
    gain: f32,
    priority: bool,
}

#[derive(Deserialize)]
struct DuckingConfig {
    enabled: bool,
    amount: f32,
    release: f32,
}

// --- Global State & Callback ---

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

fn on_audio_level(tunnel_id: String, level: f32) {
    if let Some(handle) = APP_HANDLE.get() {
        let _ = handle.emit("audio-level", (tunnel_id, level));
    }
}

// --- Commands ---

#[tauri::command]
fn get_devices() -> Vec<AudioDeviceDTO> {
    audio::get_audio_devices()
        .into_iter()
        .map(|d| AudioDeviceDTO {
            id: d.id,
            name: d.name,
            maxInputChannels: d.max_input_channels,
            maxOutputChannels: d.max_output_channels,
            hostAPIName: d.host_api_name,
            defaultSampleRate: d.default_sample_rate,
            isVirtual: d.is_virtual,
            virtualLabel: d.virtual_label,
        })
        .collect()
}

#[tauri::command]
fn get_audio_apps() -> Vec<AudioAppDTO> {
    audio::get_audio_apps()
        .into_iter()
        .map(|a| AudioAppDTO {
            pid: a.pid,
            name: a.name,
            exe: a.exe,
        })
        .collect()
}

#[tauri::command]
fn create_tunnel(
    id: String,
    inputs: Vec<TunnelInput>,
    output_id: i32,
    channel_count: Option<i32>,
    ducking: DuckingConfig,
) {
    let inputs = inputs.into_iter().map(|i| audio::tunnel::TunnelInputConfig {
        device_id: i.deviceId,
        app_pid: i.appPid.unwrap_or(0),
        gain: i.gain,
        priority: i.priority,
    }).collect();

    let ducking_cfg = audio::tunnel::DuckingConfig {
        enabled: ducking.enabled,
        amount: ducking.amount,
        release: ducking.release,
    };

    audio::engine::create_tunnel(
        id,
        inputs,
        output_id,
        256,
        channel_count.unwrap_or(2) as u32,
        ducking_cfg,
    );
}

#[tauri::command]
fn destroy_tunnel(id: String) {
    audio::engine::destroy_tunnel(&id);
}

#[tauri::command]
fn set_tunnel_muted(id: String, muted: bool) {
    audio::engine::set_tunnel_muted(&id, muted);
}

#[tauri::command]
fn set_tunnel_gain(id: String, gain: f32) {
    audio::engine::set_tunnel_gain(&id, gain);
}

#[tauri::command]
fn set_tunnel_input_gain(id: String, input_index: i32, gain: f32) {
    audio::engine::set_tunnel_input_gain(&id, input_index, gain);
}

#[tauri::command]
fn set_tunnel_input_priority(id: String, input_index: i32, priority: bool) {
    audio::engine::set_tunnel_input_priority(&id, input_index, priority);
}

#[tauri::command]
fn set_tunnel_ducking(id: String, enabled: bool, amount: f32, release: f32) {
    audio::engine::set_tunnel_ducking(&id, audio::tunnel::DuckingConfig {
        enabled,
        amount,
        release,
    });
}

#[tauri::command]
fn get_tunnel_sample_rate(id: String) -> i32 {
    audio::engine::get_tunnel_sample_rate(&id)
}

#[tauri::command]
fn get_tunnel_channel_count(id: String) -> i32 {
    audio::engine::get_tunnel_channel_count(&id)
}

// --- Storage ---

use std::fs;
use std::path::PathBuf;

fn get_data_dir(app: &AppHandle) -> PathBuf {
    let path = app.path().app_data_dir().unwrap();
    if !path.exists() {
        fs::create_dir_all(&path).unwrap();
    }
    path
}

#[tauri::command]
fn load_tunnels(app: AppHandle) -> serde_json::Value {
    let path = get_data_dir(&app).join("tunnels.json");
    if path.exists() {
        let content = fs::read_to_string(path).unwrap_or_else(|_| "[]".to_string());
        serde_json::from_str(&content).unwrap_or(serde_json::json!([]))
    } else {
        serde_json::json!([])
    }
}

#[tauri::command]
fn save_tunnels(app: AppHandle, tunnels: serde_json::Value) {
    let path = get_data_dir(&app).join("tunnels.json");
    let content = serde_json::to_string_pretty(&tunnels).unwrap();
    let _ = fs::write(path, content);
}

#[tauri::command]
fn load_settings(app: AppHandle) -> serde_json::Value {
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
fn save_settings(app: AppHandle, settings: serde_json::Value) {
    let path = get_data_dir(&app).join("settings.json");
    let content = serde_json::to_string_pretty(&settings).unwrap();
    let _ = fs::write(path, content);
}

// --- Window State ---

#[derive(Serialize, Deserialize)]
struct WindowState {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[tauri::command]
fn load_window_state(app: AppHandle) -> Option<WindowState> {
    let path = get_data_dir(&app).join("window.json");
    if path.exists() {
        let content = fs::read_to_string(path).ok()?;
        serde_json::from_str(&content).ok()
    } else {
        None
    }
}

#[tauri::command]
fn save_window_state(app: AppHandle, state: WindowState) {
    let path = get_data_dir(&app).join("window.json");
    if let Ok(content) = serde_json::to_string_pretty(&state) {
        let _ = fs::write(path, content);
    }
}

// --- Windows Startup (now using system module) ---

#[tauri::command]
fn set_launch_on_startup(_app: AppHandle, enable: bool) -> Result<(), String> {
    system::set_launch_on_startup(enable)
}

#[tauri::command]
fn get_launch_on_startup() -> Result<bool, String> {
    system::is_launch_on_startup()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::CloseRequested { api: _api, .. } = event {
                // If minimizeToTray is enabled, we hide the window instead of closing it
                // We'll check the setting here. For now, let's just always stop tunnels.
                audio::engine::destroy_all_tunnels();
            }
        })
        .setup(|app| {
            use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState};
            use tauri::menu::{Menu, MenuItem};

            // Setup Tray Icon
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "quit" => {
                            audio::engine::terminate();
                            app.exit(0);
                        }
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { 
                        button: MouseButton::Left, 
                        button_state: MouseButtonState::Up, .. 
                    } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            let _ = APP_HANDLE.set(app.handle().clone());
            audio::engine::initialize();
            audio::engine::set_level_callback(on_audio_level);
            Ok(())
        })
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_devices,
            get_audio_apps,
            create_tunnel,
            destroy_tunnel,
            set_tunnel_muted,
            set_tunnel_gain,
            set_tunnel_input_gain,
            set_tunnel_input_priority,
            set_tunnel_ducking,
            get_tunnel_sample_rate,
            get_tunnel_channel_count,
            load_tunnels,
            save_tunnels,
            load_settings,
            save_settings,
            load_window_state,
            save_window_state,
            set_launch_on_startup,
            get_launch_on_startup,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                audio::engine::terminate();
            }
        });
}
