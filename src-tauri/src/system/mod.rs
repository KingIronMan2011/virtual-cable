/// System integration module
/// Provides registry management, DLL handling, and startup initialization

pub mod registry;
pub mod init;

pub use registry::{set_launch_on_startup, is_launch_on_startup};
pub use init::{initialize_system, shutdown_system, verify_portaudio_dll};
