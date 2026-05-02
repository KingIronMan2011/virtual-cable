/// Audio module - Core audio infrastructure utilities
/// Provides thread-safe queuing, PortAudio bindings, metering, and enumeration
/// 
/// Non-tunnel logic: device enumeration, app enumeration, metering callbacks, caching
/// Tunnel logic (mixing, ducking, reader threads) remains in C++ for now

pub mod queue;
pub mod metering;
pub mod device_enum;
pub mod app_enum;
pub mod cache;
pub mod app_capture;
pub mod tunnel;
pub mod engine;

pub use queue::AudioQueue;
pub use metering::{calculate_rms, MeteringCallback};
pub use device_enum::{get_audio_devices, get_input_devices, get_output_devices, AudioDevice};
pub use app_enum::{get_audio_apps, AudioApp};
pub use cache::{EnumerationCache, global_cache};
