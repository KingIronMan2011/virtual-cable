/// Per-process audio capture using Windows 10 2004+ WASAPI Process Loopback API.
///
/// This is the native Rust replacement for the C++ `AppCaptureStream` class.
/// It captures audio from a specific Windows process via WASAPI process loopback,
/// converts to 16-bit signed LE PCM, and delivers frames via a callback.

#[cfg(target_os = "windows")]
mod platform {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::thread;

    extern crate windows_core;

    use windows::core::{implement, Interface, PCWSTR, GUID};
    use windows_core::AsImpl;
    use windows::Win32::Foundation::{HANDLE, WAIT_OBJECT_0, S_OK, E_FAIL, CloseHandle};
    use windows::Win32::Media::Audio::{
        ActivateAudioInterfaceAsync,
        IAudioCaptureClient, IAudioClient,
        IActivateAudioInterfaceAsyncOperation,
        IActivateAudioInterfaceCompletionHandler,
        IActivateAudioInterfaceCompletionHandler_Impl,
        AUDCLNT_BUFFERFLAGS_SILENT,
        AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK,
        AUDIOCLIENT_ACTIVATION_PARAMS,
        AUDIOCLIENT_ACTIVATION_PARAMS_0,
        AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK,
        AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS,
        PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE,
        WAVEFORMATEX, WAVEFORMATEXTENSIBLE,
    };
    use windows::Win32::System::Com::{
        CoInitializeEx, CoUninitialize,
        COINIT_MULTITHREADED,
    };
    use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
    use windows::Win32::System::Threading::{CreateEventW, SetEvent, WaitForSingleObject};
    use windows::Win32::System::Variant::VT_BLOB;

    // ===== Well-known audio format constants =====


    /// WAVE_FORMAT_EXTENSIBLE (0xFFFE)
    const WAVE_FORMAT_EXTENSIBLE_TAG: u16 = 0xFFFE;

    /// KSDATAFORMAT_SUBTYPE_IEEE_FLOAT
    const SUBTYPE_IEEE_FLOAT: GUID = GUID::from_u128(0x00000003_0000_0010_8000_00aa00389b71);
    /// KSDATAFORMAT_SUBTYPE_PCM
    const SUBTYPE_PCM: GUID = GUID::from_u128(0x00000001_0000_0010_8000_00aa00389b71);

    /// SPEAKER_FRONT_LEFT | SPEAKER_FRONT_RIGHT
    const SPEAKER_FRONT_STEREO: u32 = 0x1 | 0x2;

    /// The virtual audio device string for process loopback
    const VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK: PCWSTR = windows::core::w!("VAD\\Process_Loopback");

    /// Buffer duration in 100-nanosecond units (200 ms)
    const BUFFER_DURATION: i64 = 200 * 10000;

    // ===== Sample Conversion =====

    /// Convert a float sample to 16-bit signed integer with clamping
    #[inline]
    fn f32_to_i16(f: f32) -> i16 {
        let v = (f * 32767.0) as i32;
        v.clamp(-32768, 32767) as i16
    }

    // ===== Callback Type =====

    /// Callback signature for audio data delivery.
    /// Called from the capture thread — must be thread-safe.
    /// Parameters: (samples, frame_count, channel_count)
    pub type DataCallback = Box<dyn Fn(&[i16], usize, i32) + Send + 'static>;

    // ===== Completion Handler =====

    /// COM completion handler for ActivateAudioInterfaceAsync.
    /// Receives the IAudioClient, initializes it, and obtains IAudioCaptureClient.
    #[implement(IActivateAudioInterfaceCompletionHandler)]
    struct CompletionHandler {
        event: HANDLE,
        result: std::sync::Mutex<ActivationResult>,
    }

    struct ActivationResult {
        client: Option<IAudioClient>,
        capture: Option<IAudioCaptureClient>,
        format: Option<WaveFormat>,
        error: Option<String>,
    }

    /// Owned wave format info extracted from WAVEFORMATEX
    #[derive(Clone)]
    struct WaveFormat {
        format_tag: u16,
        channels: u16,
        sample_rate: u32,
        bits_per_sample: u16,
        is_float: bool,
        is_pcm: bool,
    }

    impl CompletionHandler {
        fn new(event: HANDLE) -> Self {
            Self {
                event,
                result: std::sync::Mutex::new(ActivationResult {
                    client: None,
                    capture: None,
                    format: None,
                    error: None,
                }),
            }
        }
    }

    impl IActivateAudioInterfaceCompletionHandler_Impl for CompletionHandler_Impl {
        fn ActivateCompleted(
            &self,
            activate_operation: windows::core::Ref<'_, IActivateAudioInterfaceAsyncOperation>,
        ) -> windows::core::Result<()> {
            let result = if let Some(op) = &*activate_operation {
                self.do_activate_completed(op)
            } else {
                Err(E_FAIL.into())
            };
            if let Err(ref e) = result {
                if let Ok(mut r) = self.result.lock() {
                    r.error = Some(format!("ActivateCompleted failed: {}", e));
                }
            }
            unsafe { let _ = SetEvent(self.event); }
            // Always return S_OK from the completion handler itself
            Ok(())
        }
    }

    impl CompletionHandler_Impl {
        fn do_activate_completed(
            &self,
            op: &IActivateAudioInterfaceAsyncOperation,
        ) -> windows::core::Result<()> {
            // Get the activation result
            let mut hr_activate = S_OK;
            let mut punk = None;
            unsafe { op.GetActivateResult(&mut hr_activate, &mut punk)? };
            hr_activate.ok()?;

            let punk = punk.ok_or(windows::core::Error::from(E_FAIL))?;
            let client: IAudioClient = punk.cast()?;

            // We bypass try_init_with_mix_format because the mix format might be e.g. 192000 Hz 8 ch.
            // We want to force the capture to 48000 Hz 2 ch (or similar) to match the engine.
            // AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM allows Windows to automatically resample for us!
            let format = match self.try_init_with_fallback_formats(&client) {
                Some(fmt) => fmt,
                None => {
                    let mut r = self.result.lock().unwrap();
                    r.error = Some("Failed to initialize audio client with any format".into());
                    return Err(E_FAIL.into());
                }
            };

            // Get capture client
            let capture: IAudioCaptureClient = unsafe { client.GetService()? };

            let mut r = self.result.lock().unwrap();
            r.client = Some(client);
            r.capture = Some(capture);
            r.format = Some(format);

            Ok(())
        }


        fn try_init_with_fallback_formats(
            &self,
            client: &IAudioClient,
        ) -> Option<WaveFormat> {
            struct FmtCandidate {
                rate: u32,
                channels: u16,
                bits: u16,
                is_float: bool,
            }

            let candidates = [
                FmtCandidate { rate: 48000, channels: 2, bits: 32, is_float: true },
                FmtCandidate { rate: 44100, channels: 2, bits: 32, is_float: true },
                FmtCandidate { rate: 48000, channels: 2, bits: 16, is_float: false },
                FmtCandidate { rate: 44100, channels: 2, bits: 16, is_float: false },
            ];

            for c in &candidates {
                let block_align = c.channels * (c.bits / 8);
                let wfx = WAVEFORMATEXTENSIBLE {
                    Format: WAVEFORMATEX {
                        wFormatTag: WAVE_FORMAT_EXTENSIBLE_TAG,
                        nChannels: c.channels,
                        nSamplesPerSec: c.rate,
                        wBitsPerSample: c.bits,
                        nBlockAlign: block_align,
                        nAvgBytesPerSec: c.rate * block_align as u32,
                        cbSize: (std::mem::size_of::<WAVEFORMATEXTENSIBLE>()
                            - std::mem::size_of::<WAVEFORMATEX>()) as u16,
                    },
                    Samples: windows::Win32::Media::Audio::WAVEFORMATEXTENSIBLE_0 {
                        wValidBitsPerSample: c.bits,
                    },
                    dwChannelMask: SPEAKER_FRONT_STEREO,
                    SubFormat: if c.is_float {
                        SUBTYPE_IEEE_FLOAT
                    } else {
                        SUBTYPE_PCM
                    },
                };

                let result = unsafe {
                    client.Initialize(
                        AUDCLNT_SHAREMODE_SHARED,
                        AUDCLNT_STREAMFLAGS_LOOPBACK 
                            | windows::Win32::Media::Audio::AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM 
                            | windows::Win32::Media::Audio::AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY,
                        BUFFER_DURATION,
                        0,
                        &wfx.Format as *const WAVEFORMATEX,
                        None,
                    )
                };

                if result.is_ok() {
                    return Some(WaveFormat {
                        format_tag: WAVE_FORMAT_EXTENSIBLE_TAG,
                        channels: c.channels,
                        sample_rate: c.rate,
                        bits_per_sample: c.bits,
                        is_float: c.is_float,
                        is_pcm: !c.is_float,
                    });
                }
            }

            None
        }
    }

    /// Parse a WAVEFORMATEX pointer into our owned WaveFormat struct

    // ===== AppCaptureStream =====

    /// Per-process loopback capture stream.
    ///
    /// Captures audio from a specific Windows process via WASAPI process loopback.
    /// Output format: 16-bit signed LE PCM at the system mix-format sample rate
    /// (typically 48 kHz), capped at 2 channels (surround is downmixed).
    pub struct AppCaptureStream {
        pid: u32,
        running: Arc<AtomicBool>,
        capture_thread: Option<thread::JoinHandle<()>>,
    }

    impl AppCaptureStream {
        /// Create a new capture stream for the given process ID.
        pub fn new(pid: u32) -> Self {
            Self {
                pid,
                running: Arc::new(AtomicBool::new(false)),
                capture_thread: None,
            }
        }

        /// Start capturing audio from the target process.
        ///
        /// Activation (COM setup) happens on the calling thread.
        /// The capture polling loop runs on a dedicated background thread.
        pub fn start(&mut self, callback: DataCallback, output_channels: i32) {
            if self.running.load(Ordering::SeqCst) {
                return;
            }

            let output_channels = output_channels.clamp(1, 2);

            // Activate the process loopback audio client on the calling thread
            let activation = match Self::activate(self.pid) {
                Ok(a) => a,
                Err(e) => {
                    eprintln!("[app-capture] Activation failed for pid {}: {}", self.pid, e);
                    return;
                }
            };

            self.running.store(true, Ordering::SeqCst);
            let running = Arc::clone(&self.running);

            self.capture_thread = Some(thread::spawn(move || {
                capture_loop(activation, callback, output_channels, running);
            }));
        }

        /// Stop capture and join the background thread.
        pub fn stop(&mut self) {
            if !self.running.load(Ordering::SeqCst) {
                return;
            }
            self.running.store(false, Ordering::SeqCst);
            if let Some(handle) = self.capture_thread.take() {
                let _ = handle.join();
            }
        }

        /// Check if the capture is currently running.
        pub fn is_running(&self) -> bool {
            self.running.load(Ordering::SeqCst)
        }

        /// Activate the process loopback audio client.
        /// This sets up the WASAPI process loopback via ActivateAudioInterfaceAsync.
        fn activate(pid: u32) -> Result<ActivatedCapture, String> {
            unsafe {
                // Build activation params
                let loopback_params = AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS {
                    TargetProcessId: pid,
                    ProcessLoopbackMode: PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE,
                };

                let activation_params = AUDIOCLIENT_ACTIVATION_PARAMS {
                    ActivationType: AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK,
                    Anonymous: AUDIOCLIENT_ACTIVATION_PARAMS_0 {
                        ProcessLoopbackParams: loopback_params,
                    },
                };

                // Pack into PROPVARIANT as VT_BLOB
                let params_ptr = &activation_params as *const _ as *const u8;
                let params_size = std::mem::size_of::<AUDIOCLIENT_ACTIVATION_PARAMS>();

                // We use ManuallyDrop because PROPVARIANT's Drop impl will call PropVariantClear,
                // which would attempt to CoTaskMemFree our stack-allocated params_ptr!
                let mut pv = std::mem::ManuallyDrop::new(std::mem::zeroed::<PROPVARIANT>());
                let pv_ptr = &mut *pv as *mut PROPVARIANT as *mut u8;
                // Set vt = VT_BLOB (0x41 = 65)
                *(pv_ptr as *mut u16) = VT_BLOB.0;
                // The blob is at offset 8 in the PROPVARIANT union
                *(pv_ptr.add(8) as *mut u32) = params_size as u32;
                *(pv_ptr.add(8 + std::mem::size_of::<usize>()) as *mut *const u8) = params_ptr;

                // Create completion event
                let event = CreateEventW(None, false, false, None)
                    .map_err(|e| format!("CreateEvent failed: {}", e))?;

                // Create handler
                let handler_impl = CompletionHandler::new(event);
                let handler: IActivateAudioInterfaceCompletionHandler = handler_impl.into();

                // Call ActivateAudioInterfaceAsync
                let op = ActivateAudioInterfaceAsync(
                    VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
                    &IAudioClient::IID,
                    Some(&*pv),
                    &handler,
                )
                .map_err(|e| format!("ActivateAudioInterfaceAsync failed: {}", e))?;

                // Wait for completion (5 second timeout)
                let wait_result = WaitForSingleObject(event, 5000);
                let _ = CloseHandle(event);

                if wait_result != WAIT_OBJECT_0 {
                    return Err("Activation timed out".into());
                }

                // Extract results from the handler
                // We need to get at the inner CompletionHandler data.
                // Since the handler is now an IActivateAudioInterfaceCompletionHandler,
                // we cast it back to our implementation.
                let handler_ref: &CompletionHandler = handler.as_impl();
                let result = handler_ref.result.lock().map_err(|e| format!("Lock poisoned: {}", e))?;

                if let Some(ref err) = result.error {
                    return Err(err.clone());
                }

                let client = result.client.clone()
                    .ok_or_else(|| "No audio client obtained".to_string())?;
                let capture = result.capture.clone()
                    .ok_or_else(|| "No capture client obtained".to_string())?;
                let format = result.format.clone()
                    .ok_or_else(|| "No format obtained".to_string())?;

                // Drop the operation reference
                drop(op);

                Ok(ActivatedCapture { client, capture, format })
            }
        }
    }

    impl Drop for AppCaptureStream {
        fn drop(&mut self) {
            self.stop();
        }
    }

    /// Holds the activated COM objects needed for the capture loop
    struct ActivatedCapture {
        client: IAudioClient,
        capture: IAudioCaptureClient,
        format: WaveFormat,
    }

    // Safety: COM interfaces are thread-safe when properly initialized
    unsafe impl Send for ActivatedCapture {}

    /// The capture loop that runs on a dedicated background thread
    fn capture_loop(
        activated: ActivatedCapture,
        callback: DataCallback,
        out_ch: i32,
        running: Arc<AtomicBool>,
    ) {
        // Initialize COM on this thread
        let _com = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };

        let client = &activated.client;
        let capture = &activated.capture;
        let fmt = &activated.format;

        // Start the audio client
        if let Err(e) = unsafe { client.Start() } {
            eprintln!("[app-capture] IAudioClient::Start failed: {}", e);
            unsafe { CoUninitialize() };
            return;
        }

        let sys_ch = fmt.channels as i32;
        let is_float = fmt.is_float;
        let is_pcm = fmt.is_pcm;
        let sys_bits = fmt.bits_per_sample;

        eprintln!(
            "[app-capture] capture started fmt={} ch={} rate={} bits={}",
            fmt.format_tag, sys_ch, fmt.sample_rate, sys_bits
        );

        let mut chunk_buf: Vec<i16> = Vec::new();

        while running.load(Ordering::SeqCst) {
            let packet_frames = match unsafe { capture.GetNextPacketSize() } {
                Ok(n) => n,
                Err(e) => {
                    eprintln!("[app-capture] GetNextPacketSize failed: {}", e);
                    break;
                }
            };

            if packet_frames == 0 {
                std::thread::sleep(std::time::Duration::from_millis(10));
                continue;
            }

            // Process all available packets
            let mut current_packet = packet_frames;
            while current_packet > 0 && running.load(Ordering::SeqCst) {
                let mut data_ptr = std::ptr::null_mut();
                let mut num_frames = 0u32;
                let mut flags = 0u32;

                let get_result = unsafe {
                    capture.GetBuffer(
                        &mut data_ptr,
                        &mut num_frames,
                        &mut flags,
                        None,
                        None,
                    )
                };

                if let Err(e) = get_result {
                    eprintln!("[app-capture] GetBuffer failed: {}", e);
                    running.store(false, Ordering::SeqCst);
                    break;
                }

                let out_samples = num_frames as usize * out_ch as usize;
                chunk_buf.resize(out_samples, 0i16);

                if flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 != 0 {
                    // Silent buffer — fill with zeros
                    chunk_buf.fill(0);
                } else if is_float {
                    // Float → i16 conversion with channel mapping
                    let src = unsafe {
                        std::slice::from_raw_parts(
                            data_ptr as *const f32,
                            num_frames as usize * sys_ch as usize,
                        )
                    };
                    for f in 0..num_frames as usize {
                        if out_ch == 1 && sys_ch >= 2 {
                            let mixed = (src[f * sys_ch as usize] + src[f * sys_ch as usize + 1]) * 0.5;
                            chunk_buf[f] = f32_to_i16(mixed);
                        } else {
                            for c in 0..out_ch as usize {
                                let src_ch = if (c as i32) < sys_ch { c } else { (sys_ch - 1) as usize };
                                chunk_buf[f * out_ch as usize + c] =
                                    f32_to_i16(src[f * sys_ch as usize + src_ch]);
                            }
                        }
                    }
                } else if is_pcm && sys_bits == 16 {
                    // 16-bit PCM passthrough with channel mapping
                    let src = unsafe {
                        std::slice::from_raw_parts(
                            data_ptr as *const i16,
                            num_frames as usize * sys_ch as usize,
                        )
                    };
                    for f in 0..num_frames as usize {
                        if out_ch == 1 && sys_ch >= 2 {
                            let mixed = ((src[f * sys_ch as usize] as i32)
                                + (src[f * sys_ch as usize + 1] as i32))
                                >> 1;
                            chunk_buf[f] = mixed as i16;
                        } else {
                            for c in 0..out_ch as usize {
                                let src_ch = if (c as i32) < sys_ch { c } else { (sys_ch - 1) as usize };
                                chunk_buf[f * out_ch as usize + c] =
                                    src[f * sys_ch as usize + src_ch];
                            }
                        }
                    }
                } else {
                    // Unsupported format — output silence
                    chunk_buf.fill(0);
                }

                let _ = unsafe { capture.ReleaseBuffer(num_frames) };

                callback(&chunk_buf, num_frames as usize, out_ch);

                // Check for more packets
                current_packet = match unsafe { capture.GetNextPacketSize() } {
                    Ok(n) => n,
                    Err(e) => {
                        eprintln!("[app-capture] GetNextPacketSize(inner) failed: {}", e);
                        running.store(false, Ordering::SeqCst);
                        break;
                    }
                };
            }
        }

        let _ = unsafe { client.Stop() };
        unsafe { CoUninitialize() };
        log::info!("[app-capture] capture loop stopped");
    }
}

// Re-export platform-specific types
#[cfg(target_os = "windows")]
pub use platform::{AppCaptureStream, DataCallback};

// Stub for non-Windows platforms
#[cfg(not(target_os = "windows"))]
pub mod platform {
    pub type DataCallback = Box<dyn Fn(&[i16], usize, i32) + Send + 'static>;

    pub struct AppCaptureStream;

    impl AppCaptureStream {
        pub fn new(_pid: u32) -> Self { Self }
        pub fn start(&mut self, _callback: DataCallback, _output_channels: i32) {}
        pub fn stop(&mut self) {}
        pub fn is_running(&self) -> bool { false }
    }
}

#[cfg(not(target_os = "windows"))]
pub use platform::{AppCaptureStream, DataCallback};
