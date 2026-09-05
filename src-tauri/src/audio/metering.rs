/// Audio metering infrastructure
///
/// Provides RMS (Root Mean Square) level calculation and a callback trait
/// for emitting level data to the UI at ~20 Hz polling rate.
///
/// RMS is a good audio loudness metric: it represents the average power of the signal.
/// For int16 PCM audio, RMS is normalized to 0.0-1.0 range where 1.0 = full scale (32767).
use std::sync::Arc;

// ===== Metering Types =====

/// Trait for receiving metering callbacks
/// Implement this to receive RMS level updates from the audio engine
pub trait MeteringCallback: Send + Sync {
    /// Called with tunnel ID and RMS level (0.0-1.0)
    fn on_level(&self, tunnel_id: &str, rms: f32);
}

/// Arc wrapper for trait object storage
pub type MeteringCallbackRef = Arc<dyn MeteringCallback>;

// ===== RMS Calculation =====

/// Calculate RMS (Root Mean Square) level for PCM samples
///
/// # Arguments
/// * `samples` - Slice of int16 PCM samples
///
/// # Returns
/// RMS level normalized to 0.0-1.0 where 1.0 = full scale (32767)
///
/// # Example
/// ```
/// use app_lib::audio::metering::calculate_rms;
///
/// let samples = vec![32767, -32767, 0, 16384];
/// let rms = calculate_rms(&samples);
/// assert!(rms > 0.0 && rms <= 1.0);
/// ```
pub fn calculate_rms(samples: &[i16]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }

    let sum_squares: f64 = samples
        .iter()
        .map(|&s| {
            let normalized = s as f64 / 32767.0;
            normalized * normalized
        })
        .sum();

    let mean_square = sum_squares / samples.len() as f64;
    mean_square.sqrt() as f32
}

/// Calculate RMS level for int16 samples with a sliding window average
///
/// Applies exponential smoothing to avoid sudden spikes/drops.
/// Useful for UI display where smooth meter movement is preferred.
///
/// # Arguments
/// * `samples` - Slice of int16 PCM samples
/// * `previous_rms` - Previous RMS value (for smoothing)
/// * `smoothing_factor` - Smoothing amount (0.0-1.0). Higher = more responsive
///
/// # Example
/// ```
/// use app_lib::audio::metering::calculate_rms_smoothed;
///
/// let samples1 = vec![0, 16_384];
/// let samples2 = vec![16_384, 32_767];
/// let rms1 = calculate_rms_smoothed(&samples1, 0.0, 0.3);
/// let rms2 = calculate_rms_smoothed(&samples2, rms1, 0.3);
/// // rms2 will be less jerky than pure RMS
/// ```
pub fn calculate_rms_smoothed(samples: &[i16], previous_rms: f32, smoothing_factor: f32) -> f32 {
    let raw_rms = calculate_rms(samples);
    previous_rms * (1.0 - smoothing_factor) + raw_rms * smoothing_factor
}

/// Peak level detection (max absolute value normalized)
/// Useful for headroom warnings
pub fn calculate_peak(samples: &[i16]) -> f32 {
    samples
        .iter()
        .map(|&s| (s.abs() as f32) / 32767.0)
        .fold(0.0, f32::max)
}

// ===== Metering Aggregation =====

/// Simple metering aggregator that tracks multiple tunnel levels
pub struct MeteringAggregator {
    callbacks: Arc<parking_lot::Mutex<Vec<MeteringCallbackRef>>>,
}

impl MeteringAggregator {
    /// Create a new aggregator
    pub fn new() -> Self {
        MeteringAggregator {
            callbacks: Arc::new(parking_lot::Mutex::new(Vec::new())),
        }
    }

    /// Register a callback for level updates
    pub fn register_callback(&self, callback: MeteringCallbackRef) {
        self.callbacks.lock().push(callback);
    }

    /// Emit level to all registered callbacks
    pub fn emit_level(&self, tunnel_id: &str, rms: f32) {
        for callback in self.callbacks.lock().iter() {
            callback.on_level(tunnel_id, rms);
        }
    }

    /// Clear all callbacks
    pub fn clear_callbacks(&self) {
        self.callbacks.lock().clear();
    }
}

impl Default for MeteringAggregator {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_rms_silence() {
        let samples = vec![0, 0, 0, 0];
        let rms = calculate_rms(&samples);
        assert_eq!(rms, 0.0);
    }

    #[test]
    fn test_calculate_rms_full_scale() {
        let samples = vec![32767]; // Max int16
        let rms = calculate_rms(&samples);
        assert!((rms - 1.0).abs() < 0.01); // Should be close to 1.0
    }

    #[test]
    fn test_calculate_rms_negative_full_scale() {
        let samples = vec![-32767];
        let rms = calculate_rms(&samples);
        assert!((rms - 1.0).abs() < 0.01);
    }

    #[test]
    fn test_calculate_rms_mixed() {
        let samples = vec![32767, -32767]; // Equal positive and negative
        let rms = calculate_rms(&samples);
        assert!((rms - 1.0).abs() < 0.01);
    }

    #[test]
    fn test_calculate_rms_half_scale() {
        let samples = vec![16384, 16384, 16384, 16384]; // ~50% of max
        let rms = calculate_rms(&samples);
        assert!(rms > 0.4 && rms < 0.6);
    }

    #[test]
    fn test_calculate_rms_smoothed() {
        let samples1 = vec![100; 100];
        let samples2 = vec![20000; 100];

        let rms1 = calculate_rms(&samples1);
        let rms2 = calculate_rms(&samples2);
        let smoothed = calculate_rms_smoothed(&samples2, rms1, 0.5);

        // Smoothed should be between previous and current
        assert!(smoothed > rms1 && smoothed < rms2);
    }

    #[test]
    fn test_calculate_peak() {
        let samples = vec![100, -32767, 1000, 5000];
        let peak = calculate_peak(&samples);
        assert!((peak - 1.0).abs() < 0.01); // -32767 is max
    }

    struct TestCallback {
        last_level: parking_lot::Mutex<f32>,
    }

    impl MeteringCallback for TestCallback {
        fn on_level(&self, _tunnel_id: &str, rms: f32) {
            *self.last_level.lock() = rms;
        }
    }

    #[test]
    fn test_metering_aggregator() {
        let agg = MeteringAggregator::new();
        let callback = Arc::new(TestCallback {
            last_level: parking_lot::Mutex::new(0.0),
        });

        agg.register_callback(Arc::clone(&callback) as Arc<dyn MeteringCallback>);
        agg.emit_level("tunnel1", 0.75);

        assert_eq!(*callback.last_level.lock(), 0.75);
    }
}
