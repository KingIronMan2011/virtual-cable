pub mod init;
/// System integration module
/// Provides registry management, DLL handling, and startup initialization
pub mod registry;

pub use init::{initialize_system, shutdown_system, verify_portaudio_dll};
pub use registry::{is_launch_on_startup, set_launch_on_startup};
