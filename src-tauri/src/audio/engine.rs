use once_cell::sync::Lazy;
use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::Arc;

use crate::audio::tunnel::{
    build_tunnel, store_f32, DuckingConfig, TunnelInputConfig, TunnelState,
};

type LevelCallback = Box<dyn Fn(String, f32) + Send + Sync>;
type SharedLevelCallback = Arc<Mutex<Option<LevelCallback>>>;

static TUNNELS: Lazy<Mutex<HashMap<String, TunnelState>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static LEVEL_CALLBACK: Lazy<SharedLevelCallback> = Lazy::new(|| Arc::new(Mutex::new(None)));
static RUNNING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

pub fn initialize() {
    RUNNING.store(true, std::sync::atomic::Ordering::SeqCst);

    // Spawn a thread to monitor levels
    std::thread::spawn(|| {
        while RUNNING.load(std::sync::atomic::Ordering::Relaxed) {
            std::thread::sleep(std::time::Duration::from_millis(50)); // ~20fps

            {
                let cb_lock = LEVEL_CALLBACK.lock();
                if let Some(cb) = cb_lock.as_ref() {
                    let tunnels = TUNNELS.lock();
                    for (id, state) in tunnels.iter() {
                        let level = crate::audio::tunnel::load_f32(&state.current_level);
                        cb(id.clone(), level);
                    }
                }
            }
        }
    });
}

pub fn terminate() {
    RUNNING.store(false, std::sync::atomic::Ordering::SeqCst);
    destroy_all_tunnels();
}

pub fn set_level_callback(cb: impl Fn(String, f32) + Send + Sync + 'static) {
    let mut cb_lock = LEVEL_CALLBACK.lock();
    *cb_lock = Some(Box::new(cb));
}

pub fn create_tunnel(
    id: String,
    inputs: Vec<TunnelInputConfig>,
    output_device_id: i32,
    frames_per_buffer: u32,
    requested_channels: u32,
    ducking: DuckingConfig,
) {
    destroy_tunnel(&id);

    match build_tunnel(
        id.clone(),
        inputs,
        output_device_id,
        frames_per_buffer,
        requested_channels,
        ducking,
    ) {
        Ok(tunnel) => {
            let mut map = TUNNELS.lock();
            map.insert(id, tunnel);
        }
        Err(e) => {
            eprintln!("[engine] Failed to create tunnel: {}", e);
        }
    }
}

pub fn destroy_tunnel(id: &str) {
    let mut map = TUNNELS.lock();
    if let Some(mut tunnel) = map.remove(id) {
        for app in tunnel.app_captures.iter_mut() {
            app.stop();
        }
    }
}

pub fn destroy_all_tunnels() {
    let mut map = TUNNELS.lock();
    for (_, mut tunnel) in map.drain() {
        for app in tunnel.app_captures.iter_mut() {
            app.stop();
        }
    }
}

pub fn set_tunnel_muted(id: &str, muted: bool) {
    let map = TUNNELS.lock();
    if let Some(tunnel) = map.get(id) {
        tunnel
            .muted
            .store(muted, std::sync::atomic::Ordering::Relaxed);
    }
}

pub fn set_tunnel_gain(id: &str, gain: f32) {
    let map = TUNNELS.lock();
    if let Some(tunnel) = map.get(id) {
        store_f32(&tunnel.master_gain, gain);
    }
}

pub fn set_tunnel_input_gain(id: &str, input_index: i32, gain: f32) {
    let map = TUNNELS.lock();
    if let Some(tunnel) = map.get(id) {
        if let Some(g) = tunnel.input_gains.get(input_index as usize) {
            store_f32(g, gain);
        }
    }
}

pub fn set_tunnel_input_priority(id: &str, input_index: i32, priority: bool) {
    let map = TUNNELS.lock();
    if let Some(tunnel) = map.get(id) {
        if let Some(p) = tunnel.input_priorities.get(input_index as usize) {
            p.store(priority, std::sync::atomic::Ordering::Relaxed);
        }
    }
}

pub fn set_tunnel_ducking(id: &str, ducking: DuckingConfig) {
    let map = TUNNELS.lock();
    if let Some(tunnel) = map.get(id) {
        tunnel
            .ducking_enabled
            .store(ducking.enabled, std::sync::atomic::Ordering::Relaxed);
        store_f32(&tunnel.ducking_amount, ducking.amount);
        store_f32(&tunnel.ducking_release, ducking.release);
    }
}

pub fn get_tunnel_sample_rate(id: &str) -> i32 {
    TUNNELS
        .lock()
        .get(id)
        .map_or(0, |tunnel| tunnel.sample_rate)
}

pub fn get_tunnel_channel_count(id: &str) -> i32 {
    TUNNELS
        .lock()
        .get(id)
        .map_or(0, |tunnel| tunnel.channel_count)
}
