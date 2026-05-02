/// Thread-safe audio queue for PCM samples
/// 
/// AudioQueue is a FIFO buffer for int16 PCM samples with both blocking and
/// non-blocking drain modes. Used by audio input readers to pass samples to
/// the mixer thread without requiring mutex locks during hot paths.

use std::collections::VecDeque;
use std::sync::Arc;
use parking_lot::Mutex;

/// Thread-safe FIFO queue for int16 PCM samples
#[derive(Clone)]
pub struct AudioQueue {
    inner: Arc<Mutex<VecDeque<i16>>>,
}

impl AudioQueue {
    /// Create a new empty audio queue
    pub fn new() -> Self {
        AudioQueue {
            inner: Arc::new(Mutex::new(VecDeque::new())),
        }
    }

    /// Create a queue with pre-allocated capacity
    pub fn with_capacity(capacity: usize) -> Self {
        AudioQueue {
            inner: Arc::new(Mutex::new(VecDeque::with_capacity(capacity))),
        }
    }

    /// Push a sample onto the queue
    pub fn push(&self, sample: i16) {
        self.inner.lock().push_back(sample);
    }

    /// Push multiple samples at once (more efficient than individual pushes)
    pub fn push_slice(&self, samples: &[i16]) {
        let mut queue = self.inner.lock();
        for &sample in samples {
            queue.push_back(sample);
        }
    }

    /// Blocking drain: wait up to `timeout_ms` for `count` samples
    /// Returns fewer samples if timeout occurs (up to what's available)
    pub fn drain_blocking(&self, count: usize, timeout_ms: u64) -> Vec<i16> {
        let start = std::time::Instant::now();
        let timeout = std::time::Duration::from_millis(timeout_ms);

        loop {
            let mut queue = self.inner.lock();
            if queue.len() >= count {
                let result: Vec<i16> = queue.drain(0..count).collect();
                return result;
            }

            if start.elapsed() >= timeout {
                // Timeout: return what we have
                let available = queue.len();
                let result: Vec<i16> = queue.drain(0..available).collect();
                return result;
            }

            drop(queue); // Release lock before sleeping
            std::thread::sleep(std::time::Duration::from_millis(1));
        }
    }

    /// Non-blocking drain: try to get `count` samples, zero-fill remainder
    /// Always returns exactly `count` samples (padding with zeros if needed)
    pub fn drain_non_blocking(&self, count: usize) -> Vec<i16> {
        let mut queue = self.inner.lock();
        let available = queue.len().min(count);

        let mut result: Vec<i16> = queue.drain(0..available).collect();
        // Pad with zeros if fewer samples than requested
        result.resize(count, 0);
        result
    }

    /// Get the current number of samples in the queue without removing them
    pub fn len(&self) -> usize {
        self.inner.lock().len()
    }

    /// Check if the queue is empty
    pub fn is_empty(&self) -> bool {
        self.inner.lock().is_empty()
    }

    /// Clear all samples from the queue
    pub fn clear(&self) {
        self.inner.lock().clear();
    }
}

impl Default for AudioQueue {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;
    use std::sync::Arc;

    #[test]
    fn test_push_and_drain_blocking() {
        let queue = AudioQueue::new();
        queue.push(100);
        queue.push(200);
        queue.push(300);

        let result = queue.drain_blocking(3, 100);
        assert_eq!(result, vec![100, 200, 300]);
        assert!(queue.is_empty());
    }

    #[test]
    fn test_drain_non_blocking_pads_with_zeros() {
        let queue = AudioQueue::new();
        queue.push(100);
        queue.push(200);

        let result = queue.drain_non_blocking(5);
        assert_eq!(result, vec![100, 200, 0, 0, 0]);
    }

    #[test]
    fn test_concurrent_pushes() {
        let queue = Arc::new(AudioQueue::new());
        let mut handles = vec![];

        for i in 0..4 {
            let q = Arc::clone(&queue);
            let handle = thread::spawn(move || {
                for j in 0..100 {
                    q.push((i * 100 + j) as i16);
                }
            });
            handles.push(handle);
        }

        for handle in handles {
            handle.join().unwrap();
        }

        assert_eq!(queue.len(), 400);
    }

    #[test]
    fn test_push_slice() {
        let queue = AudioQueue::new();
        queue.push_slice(&[100, 200, 300, 400]);
        
        assert_eq!(queue.len(), 4);
        let result = queue.drain_blocking(4, 100);
        assert_eq!(result, vec![100, 200, 300, 400]);
    }
}
