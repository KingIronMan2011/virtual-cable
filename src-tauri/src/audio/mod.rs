//! Audio module - routing, enumeration, capture, metering, and caching.
//!
//! Audio tunnel mixing, ducking, and capture are implemented in Rust with CPAL and WASAPI.

pub mod app_capture;
pub mod app_enum;
pub mod cache;
pub mod device_enum;
pub mod engine;
pub mod metering;
pub mod tunnel;

pub use app_enum::{get_audio_apps, AudioApp};
pub use cache::{global_cache, EnumerationCache};
pub use device_enum::{get_audio_devices, get_input_devices, get_output_devices, AudioDevice};
pub use metering::{calculate_rms, MeteringCallback};
