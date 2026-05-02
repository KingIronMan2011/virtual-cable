/// Windows Registry integration for startup management
///
/// Manages application registry entries for auto-startup configuration.
/// Location: HKCU\Software\Microsoft\Windows\CurrentVersion\Run
///
/// Only compiled on Windows target; other platforms provide no-op stubs.

#[cfg(target_os = "windows")]
mod windows_impl {
    use winreg::RegKey;

    const STARTUP_REG_PATH: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
    const APP_NAME: &str = "Virtual Cable";

    /// Set startup registry key
    pub fn set_launch_on_startup(enable: bool) -> Result<(), String> {
        let hkcu = RegKey::predef(winreg::enums::HKEY_CURRENT_USER);
        let (key, _) = hkcu
            .create_subkey(STARTUP_REG_PATH)
            .map_err(|e| format!("Failed to access registry: {}", e))?;

        if enable {
            // Get executable path
            let exe_path = std::env::current_exe()
                .map_err(|e| format!("Failed to get executable path: {}", e))?;

            key.set_value(APP_NAME, &exe_path.to_string_lossy().to_string())
                .map_err(|e| format!("Failed to set registry value: {}", e))?;
        } else {
            key.delete_value(APP_NAME).ok(); // Ignore if doesn't exist
        }

        Ok(())
    }

    /// Check if startup is enabled
    pub fn is_launch_on_startup() -> Result<bool, String> {
        let hkcu = RegKey::predef(winreg::enums::HKEY_CURRENT_USER);
        let key = hkcu
            .open_subkey(STARTUP_REG_PATH)
            .map_err(|e| format!("Failed to access registry: {}", e))?;

        match key.get_value::<String, _>(APP_NAME) {
            Ok(_) => Ok(true),
            Err(e) => {
                let err_str = e.to_string();
                if err_str.contains("not found") || err_str.contains("FileNotFound") {
                    Ok(false)
                } else {
                    Err(format!("Registry error: {}", e))
                }
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod noop_impl {
    /// No-op stub for non-Windows platforms
    pub fn set_launch_on_startup(_enable: bool) -> Result<(), String> {
        Ok(()) // Success: no-op on non-Windows
    }

    /// Always returns false on non-Windows platforms
    pub fn is_launch_on_startup() -> Result<bool, String> {
        Ok(false)
    }
}

// ===== Public API =====

#[cfg(target_os = "windows")]
pub use windows_impl::*;

#[cfg(not(target_os = "windows"))]
pub use noop_impl::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_launch_on_startup() {
        // This will return false on non-Windows or if registry key doesn't exist
        // We don't modify registry in tests
        let _ = is_launch_on_startup();
    }
}
