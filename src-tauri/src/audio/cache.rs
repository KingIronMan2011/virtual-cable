/// Caching layer for device and app enumeration
///
/// Reduces repeated FFI calls by caching results with TTL (time-to-live).
/// Device list changes infrequently; app list changes frequently (per-second).
///
/// Cache invalidation can be triggered by system events (device connect/disconnect)
/// or by explicit TTL expiry.

use std::sync::Arc;
use std::time::{Duration, Instant};
use parking_lot::Mutex;

use crate::audio::portaudio::AudioDevice;
use crate::audio::app_enum::AudioApp;
use crate::audio::{device_enum, app_enum};

// ===== Cache Entries =====

/// Cached device list with timestamp
struct DeviceCache {
    devices: Vec<AudioDevice>,
    timestamp: Instant,
    ttl: Duration,
}

impl DeviceCache {
    fn new(devices: Vec<AudioDevice>, ttl: Duration) -> Self {
        DeviceCache {
            devices,
            timestamp: Instant::now(),
            ttl,
        }
    }

    fn is_valid(&self) -> bool {
        self.timestamp.elapsed() < self.ttl
    }
}

/// Cached app list with timestamp
struct AppCache {
    apps: Vec<AudioApp>,
    timestamp: Instant,
    ttl: Duration,
}

impl AppCache {
    fn new(apps: Vec<AudioApp>, ttl: Duration) -> Self {
        AppCache {
            apps,
            timestamp: Instant::now(),
            ttl,
        }
    }

    fn is_valid(&self) -> bool {
        self.timestamp.elapsed() < self.ttl
    }
}

// ===== Public Cache Manager =====

/// Manages caching for device and app enumeration
pub struct EnumerationCache {
    device_cache: Arc<Mutex<Option<DeviceCache>>>,
    app_cache: Arc<Mutex<Option<AppCache>>>,
    device_ttl: Duration,
    app_ttl: Duration,
}

impl EnumerationCache {
    /// Create a new cache with default TTLs
    /// Default: 60s for devices, 10s for apps
    pub fn new() -> Self {
        EnumerationCache {
            device_cache: Arc::new(Mutex::new(None)),
            app_cache: Arc::new(Mutex::new(None)),
            device_ttl: Duration::from_secs(60),
            app_ttl: Duration::from_secs(10),
        }
    }

    /// Create cache with custom TTLs
    pub fn with_ttl(device_ttl: Duration, app_ttl: Duration) -> Self {
        EnumerationCache {
            device_cache: Arc::new(Mutex::new(None)),
            app_cache: Arc::new(Mutex::new(None)),
            device_ttl,
            app_ttl,
        }
    }

    /// Get devices, using cache if valid
    pub fn get_devices(&self) -> Vec<AudioDevice> {
        let mut cache = self.device_cache.lock();

        if let Some(ref c) = *cache {
            if c.is_valid() {
                return c.devices.clone();
            }
        }

        // Cache miss or expired: fetch fresh
        let devices = device_enum::get_audio_devices();
        *cache = Some(DeviceCache::new(devices.clone(), self.device_ttl));
        devices
    }

    /// Get input devices, using cache if valid
    pub fn get_input_devices(&self) -> Vec<AudioDevice> {
        self.get_devices()
            .into_iter()
            .filter(|d| d.max_input_channels > 0)
            .collect()
    }

    /// Get output devices, using cache if valid
    pub fn get_output_devices(&self) -> Vec<AudioDevice> {
        self.get_devices()
            .into_iter()
            .filter(|d| d.max_output_channels > 0)
            .collect()
    }

    /// Get apps, using cache if valid
    pub fn get_apps(&self) -> Vec<AudioApp> {
        let mut cache = self.app_cache.lock();

        if let Some(ref c) = *cache {
            if c.is_valid() {
                return c.apps.clone();
            }
        }

        // Cache miss or expired: fetch fresh
        let apps = app_enum::get_audio_apps();
        *cache = Some(AppCache::new(apps.clone(), self.app_ttl));
        apps
    }

    /// Invalidate device cache (e.g., when device is plugged in)
    pub fn invalidate_devices(&self) {
        *self.device_cache.lock() = None;
    }

    /// Invalidate app cache (e.g., when app enumeration changes)
    pub fn invalidate_apps(&self) {
        *self.app_cache.lock() = None;
    }

    /// Invalidate all caches
    pub fn clear(&self) {
        *self.device_cache.lock() = None;
        *self.app_cache.lock() = None;
    }

    /// Check if device cache is still valid
    pub fn is_device_cache_valid(&self) -> bool {
        self.device_cache
            .lock()
            .as_ref()
            .map(|c| c.is_valid())
            .unwrap_or(false)
    }

    /// Check if app cache is still valid
    pub fn is_app_cache_valid(&self) -> bool {
        self.app_cache
            .lock()
            .as_ref()
            .map(|c| c.is_valid())
            .unwrap_or(false)
    }
}

impl Default for EnumerationCache {
    fn default() -> Self {
        Self::new()
    }
}

// ===== Global Instance =====

/// Global cache instance for use throughout the application
pub static ENUM_CACHE: std::sync::OnceLock<EnumerationCache> =
    std::sync::OnceLock::new();

/// Get or initialize the global enumeration cache
pub fn global_cache() -> &'static EnumerationCache {
    ENUM_CACHE.get_or_init(EnumerationCache::new)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_hit() {
        let cache = EnumerationCache::with_ttl(Duration::from_secs(60), Duration::from_secs(10));
        
        let devices1 = cache.get_devices();
        let devices2 = cache.get_devices();
        
        // Both should return same object (cache hit)
        assert_eq!(devices1.len(), devices2.len());
    }

    #[test]
    fn test_cache_invalidation() {
        let cache = EnumerationCache::with_ttl(Duration::from_secs(60), Duration::from_secs(10));
        
        let _ = cache.get_devices();
        assert!(cache.is_device_cache_valid());
        
        cache.invalidate_devices();
        assert!(!cache.is_device_cache_valid());
    }

    #[test]
    fn test_cache_expiry() {
        let cache = EnumerationCache::with_ttl(Duration::from_millis(100), Duration::from_secs(10));
        
        let _ = cache.get_devices();
        assert!(cache.is_device_cache_valid());
        
        std::thread::sleep(Duration::from_millis(150));
        assert!(!cache.is_device_cache_valid());
    }

    #[test]
    fn test_get_input_output_devices() {
        let cache = EnumerationCache::new();
        
        let inputs = cache.get_input_devices();
        let outputs = cache.get_output_devices();
        
        for input in &inputs {
            assert!(input.max_input_channels > 0);
        }
        
        for output in &outputs {
            assert!(output.max_output_channels > 0);
        }
    }

    #[test]
    fn test_global_cache() {
        // Just verify it initializes without panicking
        let _cache = global_cache();
    }
}
