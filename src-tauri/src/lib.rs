use serde::{Deserialize, Serialize};
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_int, c_void};
use tauri::{AppHandle, Manager, Emitter};
use std::sync::OnceLock;

// --- FFI Imports ---

extern "C" {
    fn engine_initialize();
    fn engine_terminate();

    fn engine_get_audio_devices(
        cb: extern "C" fn(c_int, *const c_char, c_int, c_int, *const c_char, c_int, *mut c_void),
        user_data: *mut c_void,
    );

    fn engine_get_audio_apps(
        cb: extern "C" fn(u32, *const c_char, *const c_char, *mut c_void),
        user_data: *mut c_void,
    );

    fn engine_create_tunnel(
        tunnel_id: *const c_char,
        num_inputs: c_int,
        input_device_ids: *const c_int,
        input_app_pids: *const u32,
        input_gains: *const f32,
        input_priorities: *const bool,
        output_device_id: c_int,
        frames_per_buffer: c_int,
        requested_channels: c_int,
        duck_enabled: bool,
        duck_amount: f32,
        duck_release: f32,
    );

    fn engine_destroy_tunnel(tunnel_id: *const c_char);
    fn engine_destroy_all_tunnels();
    // fn engine_reload_all_tunnels(frames_per_buffer: c_int);

    fn engine_set_tunnel_muted(tunnel_id: *const c_char, muted: bool);
    fn engine_set_tunnel_gain(tunnel_id: *const c_char, gain: f32);
    fn engine_set_tunnel_input_gain(tunnel_id: *const c_char, input_index: c_int, gain: f32);
    fn engine_set_tunnel_input_priority(tunnel_id: *const c_char, input_index: c_int, priority: bool);
    fn engine_set_tunnel_ducking(tunnel_id: *const c_char, enabled: bool, amount: f32, release: f32);

    fn engine_get_tunnel_sample_rate(tunnel_id: *const c_char) -> c_int;
    fn engine_get_tunnel_channel_count(tunnel_id: *const c_char) -> c_int;

    fn engine_set_level_callback(cb: extern "C" fn(*const c_char, f32, *mut c_void), user_data: *mut c_void);
}

// --- Data Models ---

#[derive(Serialize)]
#[allow(non_snake_case)]
struct AudioDevice {
    id: i32,
    name: String,
    maxInputChannels: i32,
    maxOutputChannels: i32,
    hostAPIName: String,
    defaultSampleRate: i32,
}

#[derive(Serialize)]
struct AudioApp {
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

extern "C" fn on_audio_level(tunnel_id: *const c_char, level: f32, _user_data: *mut c_void) {
    let tunnel_id = unsafe { CStr::from_ptr(tunnel_id).to_string_lossy().into_owned() };
    if let Some(handle) = APP_HANDLE.get() {
        let _ = handle.emit("audio-level", (tunnel_id, level));
    }
}

// --- Commands ---

#[tauri::command]
fn get_devices() -> Vec<AudioDevice> {
    let mut devices = Vec::new();

    extern "C" fn device_cb(
        id: c_int,
        name: *const c_char,
        max_input: c_int,
        max_output: c_int,
        host_api: *const c_char,
        default_sr: c_int,
        user_data: *mut c_void,
    ) {
        let devices = unsafe { &mut *(user_data as *mut Vec<AudioDevice>) };
        let name = unsafe { CStr::from_ptr(name).to_string_lossy().into_owned() };
        let host_api = unsafe { CStr::from_ptr(host_api).to_string_lossy().into_owned() };
        devices.push(AudioDevice {
            id,
            name,
            maxInputChannels: max_input,
            maxOutputChannels: max_output,
            hostAPIName: host_api,
            defaultSampleRate: default_sr,
        });
    }

    unsafe {
        engine_get_audio_devices(device_cb, &mut devices as *mut _ as *mut c_void);
    }
    devices
}

#[tauri::command]
fn get_audio_apps() -> Vec<AudioApp> {
    let mut apps = Vec::new();

    extern "C" fn app_cb(pid: u32, name: *const c_char, exe: *const c_char, user_data: *mut c_void) {
        let apps = unsafe { &mut *(user_data as *mut Vec<AudioApp>) };
        let name = unsafe { CStr::from_ptr(name).to_string_lossy().into_owned() };
        let exe = unsafe { CStr::from_ptr(exe).to_string_lossy().into_owned() };
        apps.push(AudioApp { pid, name, exe });
    }

    unsafe {
        engine_get_audio_apps(app_cb, &mut apps as *mut _ as *mut c_void);
    }
    apps
}

#[tauri::command]
fn create_tunnel(
    id: String,
    inputs: Vec<TunnelInput>,
    output_id: i32,
    channel_count: Option<i32>,
    ducking: DuckingConfig,
) {
    let c_id = CString::new(id).unwrap();
    let num_inputs = inputs.len() as c_int;
    let device_ids: Vec<c_int> = inputs.iter().map(|i| i.deviceId).collect();
    let app_pids: Vec<u32> = inputs.iter().map(|i| i.appPid.unwrap_or(0)).collect();
    let gains: Vec<f32> = inputs.iter().map(|i| i.gain).collect();
    let priorities: Vec<bool> = inputs.iter().map(|i| i.priority).collect();

    unsafe {
        engine_create_tunnel(
            c_id.as_ptr(),
            num_inputs,
            device_ids.as_ptr(),
            app_pids.as_ptr(),
            gains.as_ptr(),
            priorities.as_ptr(),
            output_id,
            0,
            channel_count.unwrap_or(0),
            ducking.enabled,
            ducking.amount,
            ducking.release,
        );
    }
}

#[tauri::command]
fn destroy_tunnel(id: String) {
    let c_id = CString::new(id).unwrap();
    unsafe {
        engine_destroy_tunnel(c_id.as_ptr());
    }
}

#[tauri::command]
fn set_tunnel_muted(id: String, muted: bool) {
    let c_id = CString::new(id).unwrap();
    unsafe {
        engine_set_tunnel_muted(c_id.as_ptr(), muted);
    }
}

#[tauri::command]
fn set_tunnel_gain(id: String, gain: f32) {
    let c_id = CString::new(id).unwrap();
    unsafe {
        engine_set_tunnel_gain(c_id.as_ptr(), gain);
    }
}

#[tauri::command]
fn set_tunnel_input_gain(id: String, input_index: i32, gain: f32) {
    let c_id = CString::new(id).unwrap();
    unsafe {
        engine_set_tunnel_input_gain(c_id.as_ptr(), input_index, gain);
    }
}

#[tauri::command]
fn set_tunnel_input_priority(id: String, input_index: i32, priority: bool) {
    let c_id = CString::new(id).unwrap();
    unsafe {
        engine_set_tunnel_input_priority(c_id.as_ptr(), input_index, priority);
    }
}

#[tauri::command]
fn set_tunnel_ducking(id: String, enabled: bool, amount: f32, release: f32) {
    let c_id = CString::new(id).unwrap();
    unsafe {
        engine_set_tunnel_ducking(c_id.as_ptr(), enabled, amount, release);
    }
}

#[tauri::command]
fn get_tunnel_sample_rate(id: String) -> i32 {
    let c_id = CString::new(id).unwrap();
    unsafe { engine_get_tunnel_sample_rate(c_id.as_ptr()) }
}

#[tauri::command]
fn get_tunnel_channel_count(id: String) -> i32 {
    let c_id = CString::new(id).unwrap();
    unsafe { engine_get_tunnel_channel_count(c_id.as_ptr()) }
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
            "experimentalFeatures": false,
            "expLatency": false,
            "bufferSize": 512,
            "expSampleRate": false
        })
    }
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: serde_json::Value) {
    let path = get_data_dir(&app).join("settings.json");
    let content = serde_json::to_string_pretty(&settings).unwrap();
    let _ = fs::write(path, content);
}

// --- Updater ---

#[tauri::command]
async fn check_for_updates(app: AppHandle) -> Result<(), String> {
    tauri::updater(app)
        .check()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn install_update(app: AppHandle) -> Result<(), String> {
    let updater = tauri::updater(app);
    updater
        .download_and_install()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::CloseRequested { api: _api, .. } = event {
                // If minimizeToTray is enabled, we hide the window instead of closing it
                // We'll check the setting here. For now, let's just always stop tunnels.
                unsafe {
                    engine_destroy_all_tunnels();
                }
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
                            unsafe { engine_terminate(); }
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
            
            // On Windows, ensure portaudio_x64.dll exists
            #[cfg(target_os = "windows")]
            {
                use std::io::Write;
                use std::os::windows::ffi::OsStrExt;
                
                extern "system" {
                    fn SetDllDirectoryW(lpPathName: *const u16) -> i32;
                }

                let dll_bytes = include_bytes!("./native/virtual-cable-engine/portaudio/bin/portaudio_x64.dll");
                let dll_name = "portaudio_x64.dll";
                
                // Try several locations to unpack the DLL
                let mut success = false;
                let mut search_paths = Vec::new();

                // 1. Next to the EXE (best for portable)
                if let Ok(exe_path) = std::env::current_exe() {
                    if let Some(parent) = exe_path.parent() {
                        let target = parent.join(dll_name);
                        search_paths.push(parent.to_path_buf());
                        if !target.exists() {
                            if let Ok(mut f) = std::fs::File::create(&target) {
                                let _ = f.write_all(dll_bytes);
                            }
                        }
                        if target.exists() { success = true; }
                    }
                }

                // 2. App Data (fallback for installed version)
                if !success {
                    if let Ok(data_dir) = app.path().app_data_dir() {
                        let _ = std::fs::create_dir_all(&data_dir);
                        let target = data_dir.join(dll_name);
                        search_paths.push(data_dir.clone());
                        if !target.exists() {
                            if let Ok(mut f) = std::fs::File::create(&target) {
                                let _ = f.write_all(dll_bytes);
                            }
                        }
                    }
                }

                // Add all potential paths to the search path
                for path in search_paths {
                    let mut path_wide: Vec<u16> = path.as_os_str().encode_wide().collect();
                    path_wide.push(0);
                    unsafe { SetDllDirectoryW(path_wide.as_ptr()); }
                }
            }

            unsafe {
                engine_initialize();
                engine_set_level_callback(on_audio_level, std::ptr::null_mut());
            }
            Ok(())
        })
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
            check_for_updates,
            install_update,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                unsafe {
                    engine_terminate();
                }
            }
        });
}
