use cpal::traits::{DeviceTrait, StreamTrait};
use ringbuf::traits::{Producer, Consumer, Split};
use ringbuf::HeapRb;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;

pub struct DuckingConfig {
    pub enabled: bool,
    pub amount: f32,
    pub release: f32,
}

pub struct TunnelInputConfig {
    pub device_id: i32,
    pub app_pid: u32,
    pub gain: f32,
    pub priority: bool,
}

pub struct TunnelState {
    pub id: String,
    pub output_stream: cpal::Stream,
    pub input_streams: Vec<cpal::Stream>,
    pub app_captures: Vec<crate::audio::app_capture::AppCaptureStream>,
    
    // Shared state for mixer
    pub muted: Arc<AtomicBool>,
    pub master_gain: Arc<AtomicU32>, // f32 from_bits
    pub current_level: Arc<AtomicU32>, // f32 from_bits

    // Runtime adjustable input states
    pub input_gains: Vec<Arc<AtomicU32>>,
    pub input_priorities: Vec<Arc<AtomicBool>>,

    // Ducking state
    pub ducking_enabled: Arc<AtomicBool>,
    pub ducking_amount: Arc<AtomicU32>,
    pub ducking_release: Arc<AtomicU32>,
}

unsafe impl Send for TunnelState {}
unsafe impl Sync for TunnelState {}

// Atomic f32 helpers
pub fn store_f32(atomic: &AtomicU32, val: f32) {
    atomic.store(val.to_bits(), Ordering::Relaxed);
}

pub fn load_f32(atomic: &AtomicU32) -> f32 {
    f32::from_bits(atomic.load(Ordering::Relaxed))
}

pub struct MixerInput {
    pub pop_slice: Box<dyn FnMut(&mut [f32]) -> usize + Send>,
    pub gain: Arc<AtomicU32>,
    pub priority: Arc<AtomicBool>,
}

pub struct DuckingState {
    pub enabled: Arc<AtomicBool>,
    pub amount: Arc<AtomicU32>,
    pub release: Arc<AtomicU32>,
    pub current_gain: f32,
}

pub fn build_tunnel(
    id: String,
    inputs: Vec<TunnelInputConfig>,
    output_device_id: i32,
    _frames_per_buffer: u32,
    requested_channels: u32,
    ducking: DuckingConfig,
) -> Result<TunnelState, String> {
    let out_device = crate::audio::device_enum::get_cpal_device_by_id(output_device_id)
        .ok_or("Output device not found")?;
        
    let out_config = out_device.default_output_config().map_err(|e| e.to_string())?;
    let channels = requested_channels.min(out_config.channels() as u32).max(1) as u16;
    let sample_rate = out_config.sample_rate();
    
    let mut config = cpal::StreamConfig {
        channels,
        sample_rate,
        buffer_size: cpal::BufferSize::Default,
    };

    // Check if device actually supports this config, if not fallback to default
    if let Ok(supported_configs) = out_device.supported_output_configs() {
        let mut found = false;
        for supported in supported_configs {
            if supported.channels() >= channels && supported.min_sample_rate() <= sample_rate && supported.max_sample_rate() >= sample_rate {
                found = true;
                break;
            }
        }
        if !found {
            config.channels = out_config.channels();
            config.sample_rate = out_config.sample_rate();
        }
    }

    let channels = config.channels;
    let sample_rate = config.sample_rate;

    let mut mixer_inputs = Vec::new();
    let mut input_streams = Vec::new();
    let mut app_captures = Vec::new();

    // Setup inputs
    for input_cfg in inputs {
        let rb = HeapRb::<f32>::new(sample_rate.0 as usize * channels as usize * 2); // 2x buffer for safety
        let (mut prod, cons) = rb.split();
        
        let gain_atomic = Arc::new(AtomicU32::new(input_cfg.gain.to_bits()));
        let prio_atomic = Arc::new(AtomicBool::new(input_cfg.priority));
        
        let mut cons = cons;
        mixer_inputs.push(MixerInput {
            pop_slice: Box::new(move |buf| cons.pop_slice(buf)),
            gain: gain_atomic,
            priority: prio_atomic,
        });

        if input_cfg.app_pid > 0 {
            // App Capture
            let mut capture = crate::audio::app_capture::AppCaptureStream::new(input_cfg.app_pid);
            
            // App Capture expects f32 data callback
            let callback = Box::new(move |samples: &[f32], _frames: usize, _ch: i32| {
                let _ = prod.push_slice(samples);
            });
            
            capture.start(callback, channels as i32, sample_rate.0);
            app_captures.push(capture);
            
        } else if let Some(in_device) = crate::audio::device_enum::get_cpal_device_by_id(input_cfg.device_id) {
            let mut in_cfg = config.clone();
            if let Ok(supported_configs) = in_device.supported_input_configs() {
                let mut found_supported = false;
                for supported in supported_configs {
                    if supported.channels() >= channels && supported.min_sample_rate() <= sample_rate && supported.max_sample_rate() >= sample_rate {
                        found_supported = true;
                        break;
                    }
                }
                if !found_supported {
                    if let Ok(def_in_cfg) = in_device.default_input_config() {
                        in_cfg.channels = def_in_cfg.channels();
                        in_cfg.sample_rate = def_in_cfg.sample_rate();
                    }
                }
            }
            
            let in_channels = in_cfg.channels as usize;
            let out_channels = channels as usize;
            let in_rate = in_cfg.sample_rate.0 as f32;
            let out_rate = sample_rate.0 as f32;
            
            let mut last_frame = vec![0.0; in_channels.max(1)];
            let mut current_frame = vec![0.0; in_channels.max(1)];
            let mut fraction = 0.0;
            let step = in_rate / out_rate;
            
            let stream_res = in_device.build_input_stream(
                &in_cfg,
                move |data: &[f32], _| {
                    if (in_rate - out_rate).abs() < 1.0 && in_channels == out_channels {
                        let _ = prod.push_slice(data);
                    } else {
                        if in_channels == 0 || out_channels == 0 { return; }
                        for frame in data.chunks_exact(in_channels) {
                            current_frame.copy_from_slice(frame);
                            while fraction < 1.0 {
                                for i in 0..out_channels {
                                    let src_idx = i.min(in_channels - 1);
                                    let s1 = last_frame[src_idx];
                                    let s2 = current_frame[src_idx];
                                    let interpolated = s1 + fraction * (s2 - s1);
                                    if prod.try_push(interpolated).is_err() { break; }
                                }
                                fraction += step;
                            }
                            fraction -= 1.0;
                            last_frame.copy_from_slice(&current_frame);
                        }
                    }
                },
                |err| eprintln!("Input stream error: {}", err),
                None
            );

            if let Ok(stream) = stream_res {
                let _ = stream.play();
                input_streams.push(stream);
            }
        }
    }

    // Mixer state
    let muted = Arc::new(AtomicBool::new(false));
    let master_gain = Arc::new(AtomicU32::new(1.0f32.to_bits()));
    let current_level = Arc::new(AtomicU32::new(0));
    
    let ducking_enabled = Arc::new(AtomicBool::new(ducking.enabled));
    let ducking_amount = Arc::new(AtomicU32::new(ducking.amount.to_bits()));
    let ducking_release = Arc::new(AtomicU32::new(ducking.release.to_bits()));

    let mut mixer_state = DuckingState {
        enabled: ducking_enabled.clone(),
        amount: ducking_amount.clone(),
        release: ducking_release.clone(),
        current_gain: 1.0,
    };
    
    let muted_clone = muted.clone();
    let master_gain_clone = master_gain.clone();
    let current_level_clone = current_level.clone();

    let input_gains: Vec<_> = mixer_inputs.iter().map(|i| i.gain.clone()).collect();
    let input_priorities: Vec<_> = mixer_inputs.iter().map(|i| i.priority.clone()).collect();

    // Pre-allocate mixing buffers. Max 4096 frames is usually plenty for consumer audio.
    let mut scratch_buffers: Vec<Vec<f32>> = (0..mixer_inputs.len()).map(|_| vec![0.0; 4096]).collect();

    let output_stream = out_device.build_output_stream(
        &config,
        move |data: &mut [f32], _| {
            let frames = data.len() / channels as usize;
            
            if !scratch_buffers.is_empty() && scratch_buffers[0].len() < data.len() {
                for buf in scratch_buffers.iter_mut() {
                    buf.resize(data.len(), 0.0);
                }
            }

            data.fill(0.0);

            let duck_enabled = mixer_state.enabled.load(Ordering::Relaxed);
            let mut priority_signal_active = false;

            // 1. Pop all inputs and check for priority activity
            for (idx, inp) in mixer_inputs.iter_mut().enumerate() {
                let popped = (inp.pop_slice)(&mut scratch_buffers[idx][..data.len()]);
                if popped < data.len() {
                    scratch_buffers[idx][popped..data.len()].fill(0.0);
                }

                if duck_enabled && inp.priority.load(Ordering::Relaxed) {
                    let sum_sq: f32 = scratch_buffers[idx][..data.len()].iter().map(|&s| s * s).sum();
                    let rms = (sum_sq / data.len() as f32).sqrt();
                    if rms > 0.02 { // Threshold for ducking trigger
                        priority_signal_active = true;
                    }
                }
            }

            // 2. Calculate ducking gain
            let current_duck_gain = if duck_enabled {
                let duck_amount = load_f32(&mixer_state.amount);
                let duck_release = load_f32(&mixer_state.release);
                let chunk_ms = (frames as f32 / sample_rate.0 as f32) * 1000.0;
                
                if priority_signal_active { 
                    // Fast attack (fixed 20ms)
                    let alpha = (-chunk_ms / 20.0).exp();
                    mixer_state.current_gain = alpha * mixer_state.current_gain + (1.0 - alpha) * duck_amount;
                } else {
                    // Configurable release
                    let alpha = (-chunk_ms / duck_release.max(1.0)).exp();
                    mixer_state.current_gain = alpha * mixer_state.current_gain + (1.0 - alpha) * 1.0;
                }
                mixer_state.current_gain
            } else {
                1.0
            };

            // 3. Mix inputs
            for (idx, inp) in mixer_inputs.iter_mut().enumerate() {
                let mut g = load_f32(&inp.gain);
                if !inp.priority.load(Ordering::Relaxed) {
                    g *= current_duck_gain;
                }
                
                for i in 0..data.len() {
                    data[i] += scratch_buffers[idx][i] * g;
                }
            }
            
            // 4. Master & Mute & Level
            let is_muted = muted_clone.load(Ordering::Relaxed);
            let m_gain = load_f32(&master_gain_clone);
            let mut sum_sq = 0.0;

            if is_muted {
                data.fill(0.0);
            } else {
                for i in 0..data.len() {
                    let s = (data[i] * m_gain).clamp(-1.0, 1.0);
                    data[i] = s;
                    sum_sq += s * s;
                }
            }
            
            let rms = if data.is_empty() { 0.0 } else { (sum_sq / data.len() as f32).sqrt() };
            let db = 20.0 * rms.max(1e-9).log10();
            let level = ((db + 60.0) / 60.0).clamp(0.0, 1.0);
            store_f32(&current_level_clone, level);
        },
        |err| eprintln!("Output stream error: {}", err),
        None
    ).map_err(|e| e.to_string())?;
    
    output_stream.play().map_err(|e| e.to_string())?;
    
    Ok(TunnelState {
        id,
        output_stream,
        input_streams,
        app_captures,
        muted,
        master_gain,
        current_level,
        input_gains,
        input_priorities,
        ducking_enabled,
        ducking_amount,
        ducking_release,
    })
}
