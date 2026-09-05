//! Audio module - routing, enumeration, and capture.
//!
//! Audio tunnel mixing, ducking, and capture are implemented in Rust with CPAL and WASAPI.

pub mod app_capture;
pub mod app_enum;
pub mod device_enum;
pub mod engine;
pub mod tunnel;

pub use app_enum::{get_audio_apps, AudioApp};
pub use device_enum::{get_audio_devices, AudioDevice};
