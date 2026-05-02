/// Device enumeration with filtering and normalization.
///
/// This stays in Rust by reading PortAudio device metadata directly.

use crate::audio::portaudio::{get_portaudio_devices, AudioDevice};

// ===== Device Filtering =====

/// Check if a device name is a valid user-facing device
/// Filters out Windows internal/stub device names
fn is_valid_device_name(name: &str) -> bool {
    // Filter out common junk names
    let junk_names = [
        "Primary Sound Driver",
        "Microsoft Sound Mapper",
        "Wave mapper",
        "Stereo Mixer",
        "Mono Mixer",
        "Microphone Boost",
    ];

    for junk in &junk_names {
        if name.contains(junk) {
            return false;
        }
    }

    // Must have at least some meaningful name
    !name.is_empty() && name.len() > 2
}

// ===== Public API =====

/// Get all available audio devices with filtering and normalization
///
/// Filters out invalid/junk device names and returns a clean list
/// suitable for UI display.
pub fn get_audio_devices() -> Vec<AudioDevice> {
    let devices: Vec<_> = get_portaudio_devices()
        .into_iter()
        .filter(|device| is_valid_device_name(&device.name))
        .collect();

    let wasapi_devices: Vec<_> = devices
        .iter()
        .filter(|device| device.host_api_name.contains("WASAPI"))
        .cloned()
        .collect();

    let mut result = if wasapi_devices.is_empty() {
        devices
    } else {
        wasapi_devices
    };

    result.sort_by_key(|device| device.id);
    result
}

/// Get input devices only (devices with max_input_channels > 0)
pub fn get_input_devices() -> Vec<AudioDevice> {
    get_audio_devices()
        .into_iter()
        .filter(|d| d.max_input_channels > 0)
        .collect()
}

/// Get output devices only (devices with max_output_channels > 0)
pub fn get_output_devices() -> Vec<AudioDevice> {
    get_audio_devices()
        .into_iter()
        .filter(|d| d.max_output_channels > 0)
        .collect()
}

/// Find a device by name (case-insensitive substring match)
pub fn find_device_by_name(name: &str) -> Option<AudioDevice> {
    let name_lower = name.to_lowercase();
    get_audio_devices()
        .into_iter()
        .find(|d| d.name.to_lowercase().contains(&name_lower))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_valid_device_name() {
        assert!(is_valid_device_name("Speakers"));
        assert!(is_valid_device_name("Line In"));
        assert!(is_valid_device_name("Microphone (Realtek)"));
        
        assert!(!is_valid_device_name("Primary Sound Driver"));
        assert!(!is_valid_device_name("Microsoft Sound Mapper"));
        assert!(!is_valid_device_name("Stereo Mixer"));
        assert!(!is_valid_device_name(""));
        assert!(!is_valid_device_name("ab")); // Too short
    }

    #[test]
    fn test_get_audio_devices() {
        let devices = get_audio_devices();
        // May be empty in CI environments
        for device in &devices {
            assert!(!device.name.is_empty());
            assert!(device.id >= 0);
        }
    }

    #[test]
    fn test_get_input_devices() {
        let devices = get_input_devices();
        for device in &devices {
            assert!(device.max_input_channels > 0);
        }
    }

    #[test]
    fn test_get_output_devices() {
        let devices = get_output_devices();
        for device in &devices {
            assert!(device.max_output_channels > 0);
        }
    }
}
