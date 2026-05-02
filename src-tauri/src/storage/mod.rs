/// Storage layer for persistent configuration and state
///
/// Handles serialization/deserialization of:
/// - Tunnel configurations (tunnels.json)
/// - Application settings (settings.json)
/// - Window state (window.json)
///
/// Uses standardized location: ~/.config/virtual-cable/ (cross-platform)
/// Provides async I/O via tokio for non-blocking file operations

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ===== Configuration Types =====

/// Audio tunnel configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunnelConfig {
    pub id: String,
    pub name: String,
    pub inputs: Vec<TunnelInput>,
    pub output_device_id: i32,
    pub muted: bool,
    pub master_gain: f32,
    pub ducking: DuckingConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunnelInput {
    pub device_id: Option<i32>,
    pub app_pid: Option<u32>,
    pub gain: f32,
    pub priority: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuckingConfig {
    pub enabled: bool,
    pub amount: f32,
    pub release: f32,
}

/// Application settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub launch_on_startup: bool,
    pub auto_connect_tunnels: bool,
    pub frames_per_buffer: i32,
    pub log_level: String,
}

/// Window state for restoration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowState {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings {
            launch_on_startup: false,
            auto_connect_tunnels: false,
            frames_per_buffer: 4096,
            log_level: "info".to_string(),
        }
    }
}

impl Default for WindowState {
    fn default() -> Self {
        WindowState {
            x: 100,
            y: 100,
            width: 800,
            height: 600,
            maximized: false,
        }
    }
}

// ===== Storage Manager =====

/// Handles all persistent storage operations
pub struct StorageManager {
    config_dir: PathBuf,
}

impl StorageManager {
    /// Create a new storage manager with default config directory
    pub fn new() -> std::io::Result<Self> {
        let config_dir = Self::get_config_dir()?;
        std::fs::create_dir_all(&config_dir)?;
        Ok(StorageManager { config_dir })
    }

    /// Get or create config directory
    fn get_config_dir() -> std::io::Result<PathBuf> {
        #[cfg(target_os = "windows")]
        {
            let app_data = std::env::var("APPDATA")
                .map_err(|_| std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    "APPDATA not set",
                ))?;
            Ok(PathBuf::from(app_data).join("Virtual Cable"))
        }

        #[cfg(target_os = "macos")]
        {
            let home = std::env::var("HOME")
                .map_err(|_| std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    "HOME not set",
                ))?;
            Ok(PathBuf::from(home).join("Library/Application Support/Virtual Cable"))
        }

        #[cfg(target_os = "linux")]
        {
            let home = std::env::var("HOME")
                .map_err(|_| std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    "HOME not set",
                ))?;
            Ok(PathBuf::from(home).join(".config/virtual-cable"))
        }

        #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
        {
            Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "Unsupported platform",
            ))
        }
    }

    /// Get path to tunnels configuration file
    pub fn tunnels_path(&self) -> PathBuf {
        self.config_dir.join("tunnels.json")
    }

    /// Get path to settings file
    pub fn settings_path(&self) -> PathBuf {
        self.config_dir.join("settings.json")
    }

    /// Get path to window state file
    pub fn window_state_path(&self) -> PathBuf {
        self.config_dir.join("window.json")
    }

    /// Save tunnels configuration
    pub fn save_tunnels(&self, tunnels: &[TunnelConfig]) -> std::io::Result<()> {
        let json = serde_json::to_string_pretty(tunnels)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        std::fs::write(self.tunnels_path(), json)?;
        Ok(())
    }

    /// Load tunnels configuration
    pub fn load_tunnels(&self) -> std::io::Result<Vec<TunnelConfig>> {
        let path = self.tunnels_path();
        if !path.exists() {
            return Ok(Vec::new());
        }
        let json = std::fs::read_to_string(path)?;
        serde_json::from_str(&json)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
    }

    /// Save application settings
    pub fn save_settings(&self, settings: &AppSettings) -> std::io::Result<()> {
        let json = serde_json::to_string_pretty(settings)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        std::fs::write(self.settings_path(), json)?;
        Ok(())
    }

    /// Load application settings (returns defaults if not found)
    pub fn load_settings(&self) -> std::io::Result<AppSettings> {
        let path = self.settings_path();
        if !path.exists() {
            return Ok(AppSettings::default());
        }
        let json = std::fs::read_to_string(path)?;
        serde_json::from_str(&json)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
    }

    /// Save window state
    pub fn save_window_state(&self, state: &WindowState) -> std::io::Result<()> {
        let json = serde_json::to_string_pretty(state)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        std::fs::write(self.window_state_path(), json)?;
        Ok(())
    }

    /// Load window state (returns defaults if not found)
    pub fn load_window_state(&self) -> std::io::Result<WindowState> {
        let path = self.window_state_path();
        if !path.exists() {
            return Ok(WindowState::default());
        }
        let json = std::fs::read_to_string(path)?;
        serde_json::from_str(&json)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
    }

    /// Clear all configuration
    pub fn clear_all(&self) -> std::io::Result<()> {
        std::fs::remove_dir_all(&self.config_dir).ok(); // Ignore if not exists
        std::fs::create_dir_all(&self.config_dir)?;
        Ok(())
    }
}

impl Default for StorageManager {
    fn default() -> Self {
        Self::new().unwrap_or_else(|_| StorageManager {
            config_dir: PathBuf::from("."),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_app_settings() {
        let settings = AppSettings::default();
        assert!(!settings.launch_on_startup);
        assert_eq!(settings.frames_per_buffer, 4096);
    }

    #[test]
    fn test_tunnel_config_serialization() {
        let tunnel = TunnelConfig {
            id: "test".to_string(),
            name: "Test Tunnel".to_string(),
            inputs: vec![],
            output_device_id: 0,
            muted: false,
            master_gain: 1.0,
            ducking: DuckingConfig {
                enabled: true,
                amount: 0.5,
                release: 1.0,
            },
        };

        let json = serde_json::to_string(&tunnel).unwrap();
        let deserialized: TunnelConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, tunnel.id);
    }

    #[test]
    fn test_storage_manager_paths() {
        let manager = StorageManager::default();
        assert!(manager.tunnels_path().to_string_lossy().contains("tunnels.json"));
        assert!(manager.settings_path().to_string_lossy().contains("settings.json"));
        assert!(manager.window_state_path().to_string_lossy().contains("window.json"));
    }
}
