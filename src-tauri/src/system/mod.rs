//! System integration module.
//!
//! Provides Windows registry integration for startup configuration.
pub mod registry;

pub use registry::{is_launch_on_startup, set_launch_on_startup};
