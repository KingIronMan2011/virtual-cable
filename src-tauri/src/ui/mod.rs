/// UI module
/// Provides user interface state management and tray integration
pub mod tray;

pub use tray::{get_default_menu_items, TrayAction, TrayContext, TrayMenuItem, TrayState};
