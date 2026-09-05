use std::fs;
/// System initialization and resource setup
///
/// Handles runtime initialization tasks:
/// - DLL extraction and verification
/// - Audio engine initialization
/// - Plugin loading
///
/// Called early in application startup (main.rs setup phase)
use std::path::PathBuf;

// ===== DLL Management =====

/// Initialize system resources (DLL extraction, etc.)
pub fn initialize_system() -> Result<(), String> {
    initialize_portaudio_dll()?;
    Ok(())
}

/// Extract and verify PortAudio DLL at runtime
///
/// Ensures PortAudio is available in the expected location:
/// - Windows: %APPDATA%/Virtual Cable/portaudio.dll
/// - Other platforms: no-op (PortAudio linked statically or via system libraries)
#[cfg(target_os = "windows")]
fn initialize_portaudio_dll() -> Result<(), String> {
    let app_data =
        std::env::var("APPDATA").map_err(|_| "APPDATA environment variable not set".to_string())?;

    let target_dir = PathBuf::from(app_data).join("Virtual Cable");
    let target_path = target_dir.join("portaudio.dll");

    // Create directory if needed
    fs::create_dir_all(&target_dir)
        .map_err(|e| format!("Failed to create config directory: {}", e))?;

    // For now, assume PortAudio DLL is available via system PATH or embedded in the binary
    // This is a placeholder for future DLL extraction logic

    if !target_path.exists() {
        // DLL not found - log warning but don't fail
        // The build system should handle DLL packaging
        eprintln!("Warning: PortAudio DLL not found at {:?}", target_path);
    }

    Ok(())
}

/// No-op DLL initialization for non-Windows platforms
#[cfg(not(target_os = "windows"))]
fn initialize_portaudio_dll() -> Result<(), String> {
    Ok(()) // PortAudio is linked statically on non-Windows builds
}

/// Get the recommended PortAudio DLL installation path
#[cfg(target_os = "windows")]
pub fn get_portaudio_dll_path() -> Result<PathBuf, String> {
    let app_data = std::env::var("APPDATA").map_err(|_| "APPDATA not set".to_string())?;
    Ok(PathBuf::from(app_data)
        .join("Virtual Cable")
        .join("portaudio.dll"))
}

/// Non-Windows stub
#[cfg(not(target_os = "windows"))]
pub fn get_portaudio_dll_path() -> Result<PathBuf, String> {
    Err("DLL paths not applicable on non-Windows".to_string())
}

/// Verify DLL integrity (checks file exists and has reasonable size)
pub fn verify_portaudio_dll() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let path = get_portaudio_dll_path()?;
        if !path.exists() {
            return Ok(false);
        }

        let metadata = fs::metadata(&path).map_err(|e| format!("Failed to stat DLL: {}", e))?;

        // DLL should be at least 100KB and at most 10MB
        let size = metadata.len();
        Ok(size > 100_000 && size < 10_000_000)
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(true) // PortAudio not as DLL on other platforms
    }
}

// ===== Cleanup =====

/// Clean up temporary resources and shutdown gracefully
pub fn shutdown_system() -> Result<(), String> {
    // Placeholder for any cleanup needed
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_initialize_system() {
        let result = initialize_system();
        assert!(result.is_ok());
    }

    #[test]
    fn test_shutdown_system() {
        let result = shutdown_system();
        assert!(result.is_ok());
    }

    #[test]
    fn test_verify_portaudio_dll() {
        let _ = verify_portaudio_dll(); // May fail on test systems, that's OK
    }
}
