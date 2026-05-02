use cpal::traits::{DeviceTrait, HostTrait};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct AudioDevice {
    pub id: i32,
    pub name: String,
    pub max_input_channels: i32,
    pub max_output_channels: i32,
    pub default_sample_rate: i32,
    pub host_api_name: String,
}

pub fn is_valid_device_name(name: &str) -> bool {
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
    !name.is_empty() && name.len() > 2
}

pub fn get_audio_devices() -> Vec<AudioDevice> {
    let mut devices = Vec::new();
    let host = cpal::default_host();
    let host_name = host.id().name().to_string();

    let mut id_counter = 0;
    if let Ok(device_iter) = host.devices() {
        for device in device_iter {
            if let Ok(name) = device.name() {
                if !is_valid_device_name(&name) {
                    continue;
                }

                let mut max_input = 0;
                if let Ok(configs) = device.supported_input_configs() {
                    for cfg in configs {
                        max_input = max_input.max(cfg.channels() as i32);
                    }
                }

                let mut max_output = 0;
                let mut default_sr = 48000;
                if let Ok(configs) = device.supported_output_configs() {
                    for cfg in configs {
                        max_output = max_output.max(cfg.channels() as i32);
                        default_sr = cfg.max_sample_rate().0 as i32;
                    }
                }

                // If a device has both 0 input and 0 output, skip it
                if max_input == 0 && max_output == 0 {
                    continue;
                }

                devices.push(AudioDevice {
                    id: id_counter,
                    name,
                    max_input_channels: max_input,
                    max_output_channels: max_output,
                    default_sample_rate: default_sr,
                    host_api_name: host_name.clone(),
                });
                id_counter += 1;
            }
        }
    }
    devices
}

pub fn get_input_devices() -> Vec<AudioDevice> {
    get_audio_devices().into_iter().filter(|d| d.max_input_channels > 0).collect()
}

pub fn get_output_devices() -> Vec<AudioDevice> {
    get_audio_devices().into_iter().filter(|d| d.max_output_channels > 0).collect()
}

pub fn find_device_by_name(name: &str) -> Option<AudioDevice> {
    let name_lower = name.to_lowercase();
    get_audio_devices().into_iter().find(|d| d.name.to_lowercase().contains(&name_lower))
}
