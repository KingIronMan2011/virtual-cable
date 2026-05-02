/// PortAudio FFI wrapper and high-level bindings
///
/// This module provides Rust-friendly wrappers around the PortAudio C API.
/// It handles device enumeration and provides high-level audio device information.
///
/// Note: PortAudio itself is kept as a C library for now, linked via build.rs.
/// We wrap only the essential enumeration functions needed for the UI and configuration.

use std::ffi::CStr;
use std::os::raw::{c_char, c_int};

// ===== FFI Bindings =====
// These are declarations for PortAudio C functions compiled by build.rs

extern "C" {
    /// Get the number of available devices
    fn Pa_GetDeviceCount() -> c_int;

    /// Get info about a specific device
    /// Safety: device_index must be valid (0 <= index < Pa_GetDeviceCount())
    fn Pa_GetDeviceInfo(device_index: c_int) -> *const PaDeviceInfo;

    /// Get info about a specific host API
    /// Safety: host_api_index must be valid for the current PortAudio runtime
    fn Pa_GetHostApiInfo(host_api_index: c_int) -> *const PaHostApiInfo;
}

/// PortAudio device information structure (mirrors the C struct)
#[repr(C)]
pub struct PaDeviceInfo {
    pub struct_version: c_int,
    pub name: *const c_char,
    pub host_api: c_int,
    pub max_input_channels: c_int,
    pub max_output_channels: c_int,
    pub default_low_input_latency: f64,
    pub default_low_output_latency: f64,
    pub default_high_input_latency: f64,
    pub default_high_output_latency: f64,
    pub default_sample_rate: f64,
}

/// PortAudio host API information structure (mirrors the C struct)
#[repr(C)]
pub struct PaHostApiInfo {
    pub struct_version: c_int,
    pub type_id: c_int,
    pub name: *const c_char,
    pub device_count: c_int,
    pub default_input_device: c_int,
    pub default_output_device: c_int,
}

// ===== High-Level Rust Types =====

/// Audio device information in Rust-friendly format
#[derive(Debug, Clone)]
pub struct AudioDevice {
    pub id: i32,
    pub name: String,
    pub max_input_channels: i32,
    pub max_output_channels: i32,
    pub default_sample_rate: i32,
    pub host_api_name: String,
}

// ===== Public API =====

/// Get all available audio devices from PortAudio
/// 
/// Returns a vector of AudioDevice structs with normalized names and host API info.
/// Filters out invalid device pointers.
pub fn get_portaudio_devices() -> Vec<AudioDevice> {
    let mut devices = Vec::new();
    let device_count = unsafe { Pa_GetDeviceCount() };

    for i in 0..device_count {
        if let Some(device) = get_device_info(i) {
            devices.push(device);
        }
    }

    devices
}

/// Get information about a specific device by ID
fn get_device_info(device_id: i32) -> Option<AudioDevice> {
    let info_ptr = unsafe { Pa_GetDeviceInfo(device_id) };

    if info_ptr.is_null() {
        return None;
    }

    let info = unsafe { &*info_ptr };
    let name = unsafe { CStr::from_ptr(info.name) }
        .to_string_lossy()
        .into_owned();

    let host_api_name = get_host_api_name(info.host_api);

    Some(AudioDevice {
        id: device_id,
        name,
        max_input_channels: info.max_input_channels,
        max_output_channels: info.max_output_channels,
        default_sample_rate: info.default_sample_rate as i32,
        host_api_name,
    })
}

/// Map PortAudio host API index to name
fn get_host_api_name(host_api_id: c_int) -> String {
    let info_ptr = unsafe { Pa_GetHostApiInfo(host_api_id) };

    if info_ptr.is_null() {
        return "Unknown".to_string();
    }

    let info = unsafe { &*info_ptr };
    if info.name.is_null() {
        return "Unknown".to_string();
    }

    unsafe { CStr::from_ptr(info.name) }
        .to_string_lossy()
        .into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_portaudio_devices() {
        let devices = get_portaudio_devices();
        // Should have at least some devices (or none on some CI environments)
        // Just verify it returns a vec without error
        let _count = devices.len();
        
        for device in &devices {
            assert!(!device.name.is_empty());
            assert!(device.id >= 0);
        }
    }

    #[test]
    fn test_host_api_name_mapping() {
        assert_eq!(get_host_api_name(99), "Unknown");
    }
}
