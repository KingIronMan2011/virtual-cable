/// UI module
/// Provides user interface state management and tray integration

pub mod tray;

pub use tray::{TrayContext, TrayState, TrayAction, TrayMenuItem, get_default_menu_items};
