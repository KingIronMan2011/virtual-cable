/// UI tray icon management and menu interactions
///
/// Manages system tray integration with menu actions:
/// - Show/hide main window
/// - Quick access to common functions
/// - Graceful shutdown
///
/// Tauri handles the underlying tray functionality;
/// this module provides state management and integration.

use std::sync::Arc;
use parking_lot::Mutex;

// ===== Tray State =====

/// Current tray state
#[derive(Debug, Clone)]
pub enum TrayState {
    /// Tray icon visible and window hidden
    Hidden,
    /// Window visible (tray icon still showing)
    Visible,
    /// Initializing or transitioning
    Busy,
}

/// Tray menu context
pub struct TrayContext {
    state: Arc<Mutex<TrayState>>,
}

impl TrayContext {
    /// Create new tray context
    pub fn new() -> Self {
        TrayContext {
            state: Arc::new(Mutex::new(TrayState::Hidden)),
        }
    }

    /// Get current tray state
    pub fn get_state(&self) -> TrayState {
        self.state.lock().clone()
    }

    /// Set tray state
    pub fn set_state(&self, state: TrayState) {
        *self.state.lock() = state;
    }

    /// Toggle window visibility via tray
    pub fn toggle_visibility(&self) -> TrayState {
        let mut current = self.state.lock();
        let new_state = match *current {
            TrayState::Hidden => TrayState::Visible,
            TrayState::Visible => TrayState::Hidden,
            TrayState::Busy => TrayState::Visible,
        };
        *current = new_state.clone();
        new_state
    }

    /// Mark tray as busy (during operations)
    pub fn set_busy(&self) {
        *self.state.lock() = TrayState::Busy;
    }
}

impl Default for TrayContext {
    fn default() -> Self {
        Self::new()
    }
}

// ===== Tray Menu Actions =====

/// Actions available from tray menu
#[derive(Debug, Clone)]
pub enum TrayAction {
    /// Show/restore main window
    Show,
    /// Hide to tray
    Hide,
    /// Quit application
    Quit,
    /// Open settings
    Settings,
    /// Open tunnel list
    Tunnels,
}

/// Menu item configuration
pub struct TrayMenuItem {
    pub label: String,
    pub action: TrayAction,
    pub enabled: bool,
}

/// Get default tray menu items
pub fn get_default_menu_items() -> Vec<TrayMenuItem> {
    vec![
        TrayMenuItem {
            label: "Show".to_string(),
            action: TrayAction::Show,
            enabled: true,
        },
        TrayMenuItem {
            label: "Settings".to_string(),
            action: TrayAction::Settings,
            enabled: true,
        },
        TrayMenuItem {
            label: "Tunnels".to_string(),
            action: TrayAction::Tunnels,
            enabled: true,
        },
        TrayMenuItem {
            label: "Quit".to_string(),
            action: TrayAction::Quit,
            enabled: true,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tray_context_initial_state() {
        let ctx = TrayContext::new();
        match ctx.get_state() {
            TrayState::Hidden => {} // Expected
            _ => panic!("Expected Hidden state"),
        }
    }

    #[test]
    fn test_tray_toggle_visibility() {
        let ctx = TrayContext::new();
        
        let new_state = ctx.toggle_visibility();
        match new_state {
            TrayState::Visible => {} // Expected
            _ => panic!("Expected Visible state"),
        }

        let new_state = ctx.toggle_visibility();
        match new_state {
            TrayState::Hidden => {} // Expected
            _ => panic!("Expected Hidden state"),
        }
    }

    #[test]
    fn test_tray_set_busy() {
        let ctx = TrayContext::new();
        ctx.set_busy();
        match ctx.get_state() {
            TrayState::Busy => {} // Expected
            _ => panic!("Expected Busy state"),
        }
    }

    #[test]
    fn test_default_menu_items() {
        let items = get_default_menu_items();
        assert!(items.len() >= 3); // At least Show, Settings, Quit
        assert!(items.iter().all(|item| item.enabled));
    }
}
