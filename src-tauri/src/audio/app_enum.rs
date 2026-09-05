/// Application audio enumeration.
///
/// Lists applications with active audio streams via WASAPI (Windows only).
/// Returns process ID, executable name, and display name for each audio-active app.

// ===== Data Models =====

/// Audio application information
#[derive(Debug, Clone)]
pub struct AudioApp {
    /// Process ID of the application
    pub pid: u32,
    /// Display name of the application
    pub name: String,
    /// Executable filename
    pub exe: String,
}

// ===== Public API =====

/// Get all applications with active audio streams (Windows only)
///
/// Returns a list of applications currently producing audio via WASAPI.
/// Note: On non-Windows platforms, this returns an empty list.
///
/// # Returns
/// Vector of AudioApp entries, each with PID, display name, and exe name
#[cfg(target_os = "windows")]
pub fn get_audio_apps() -> Vec<AudioApp> {
    use std::collections::HashSet;

    use windows::core::{Interface, PWSTR};
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::Media::Audio::{
        eConsole, eRender, IAudioSessionControl2, IAudioSessionManager2, IMMDeviceEnumerator,
        MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_NATIVE,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };

    let mut apps = Vec::new();
    let mut seen_pids = HashSet::new();
    let mut seen_exes = HashSet::new();

    let com_initialized = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok() };

    let result = (|| -> windows::core::Result<()> {
        let enumerator: IMMDeviceEnumerator =
            unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)? };
        let device = unsafe { enumerator.GetDefaultAudioEndpoint(eRender, eConsole)? };
        let session_manager: IAudioSessionManager2 = unsafe { device.Activate(CLSCTX_ALL, None)? };
        let session_enumerator = unsafe { session_manager.GetSessionEnumerator()? };
        let count = unsafe { session_enumerator.GetCount()? };

        for index in 0..count {
            let session = unsafe { session_enumerator.GetSession(index)? };
            let session2: IAudioSessionControl2 = match session.cast() {
                Ok(session2) => session2,
                Err(_) => continue,
            };

            let pid = unsafe { session2.GetProcessId()? };
            if pid == 0 || !seen_pids.insert(pid) {
                continue;
            }

            let process =
                match unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) } {
                    Ok(handle) => handle,
                    Err(_) => continue,
                };

            let mut path_buf = vec![0u16; 260];
            let mut path_len = path_buf.len() as u32;
            let path_result = unsafe {
                QueryFullProcessImageNameW(
                    process,
                    PROCESS_NAME_NATIVE,
                    PWSTR(path_buf.as_mut_ptr()),
                    &mut path_len,
                )
            };
            let _ = unsafe { CloseHandle(process) };

            if path_result.is_err() || path_len == 0 {
                continue;
            }

            let full_path = String::from_utf16_lossy(&path_buf[..path_len as usize]);
            let exe = full_path
                .rsplit(['\\', '/'])
                .next()
                .unwrap_or(&full_path)
                .to_string();

            // Deduplicate by executable name (case-insensitive)
            if !seen_exes.insert(exe.to_lowercase()) {
                continue;
            }

            let name = exe
                .strip_suffix(".exe")
                .or_else(|| exe.strip_suffix(".EXE"))
                .unwrap_or(&exe)
                .to_string();

            apps.push(AudioApp { pid, name, exe });
        }

        Ok(())
    })();

    if com_initialized {
        unsafe { CoUninitialize() };
    }

    if result.is_err() {
        return Vec::new();
    }

    // Sort by PID for consistent ordering
    apps.sort_by_key(|a: &AudioApp| a.pid);
    apps
}

/// Get all applications with active audio streams (non-Windows stub)
///
/// Returns empty list on non-Windows platforms since WASAPI is Windows-specific.
#[cfg(not(target_os = "windows"))]
pub fn get_audio_apps() -> Vec<AudioApp> {
    Vec::new()
}

/// Find an app by PID
pub fn find_app_by_pid(pid: u32) -> Option<AudioApp> {
    get_audio_apps().into_iter().find(|a| a.pid == pid)
}

/// Find an app by executable name (case-insensitive)
pub fn find_app_by_exe(exe_name: &str) -> Option<AudioApp> {
    let exe_lower = exe_name.to_lowercase();
    get_audio_apps()
        .into_iter()
        .find(|a| a.exe.to_lowercase().contains(&exe_lower))
}

/// Get all unique executable names currently with audio
pub fn get_audio_app_names() -> Vec<String> {
    let mut names: Vec<_> = get_audio_apps().into_iter().map(|a| a.exe).collect();
    names.sort();
    names.dedup();
    names
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_audio_apps() {
        let apps = get_audio_apps();
        // May be empty if no apps are playing audio
        for app in &apps {
            assert!(app.pid > 0);
            assert!(!app.name.is_empty());
            assert!(!app.exe.is_empty());
        }
    }

    #[test]
    fn test_get_audio_app_names() {
        let apps = get_audio_apps();
        let names = get_audio_app_names();

        // Names should be subset of apps (deduped)
        assert!(names.len() <= apps.len());

        // All names should be unique
        let mut names_sorted = names.clone();
        names_sorted.sort();
        names_sorted.dedup();
        assert_eq!(names_sorted.len(), names.len());
    }
}
