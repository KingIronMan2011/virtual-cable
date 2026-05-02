/// C-callable bridge for AppCaptureStream.
///
/// Exposes the Rust `AppCaptureStream` as `extern "C"` functions so that
/// the existing C++ engine (`engine.cpp`) can call into Rust instead of
/// the old C++ `AppCaptureStream` class.

use super::app_capture::AppCaptureStream;
use std::os::raw::c_int;

/// Opaque handle wrapping a boxed AppCaptureStream.
/// The C++ side stores this as `void*`.
pub struct AppCaptureHandle {
    stream: AppCaptureStream,
}

/// C function pointer type matching the C++ callback signature:
///   void (*)(const int16_t* samples, size_t frame_count, int channel_count, void* context)
pub type AppCaptureCallbackFn =
    unsafe extern "C" fn(samples: *const i16, frame_count: usize, channel_count: c_int, ctx: *mut std::ffi::c_void);

/// Create a new AppCaptureStream for the given process ID.
/// Returns an opaque handle (never null on success).
#[no_mangle]
pub extern "C" fn app_capture_create(pid: u32) -> *mut AppCaptureHandle {
    let handle = Box::new(AppCaptureHandle {
        stream: AppCaptureStream::new(pid),
    });
    Box::into_raw(handle)
}

/// Start capturing audio.
///
/// `callback_fn`: C function pointer called from the capture thread.
/// `callback_ctx`: opaque pointer forwarded to every callback invocation.
/// `output_channels`: 1 for mono, 2 for stereo.
#[no_mangle]
pub unsafe extern "C" fn app_capture_start(
    handle: *mut AppCaptureHandle,
    callback_fn: AppCaptureCallbackFn,
    callback_ctx: *mut std::ffi::c_void,
    output_channels: c_int,
) {
    if handle.is_null() {
        return;
    }
    let handle = &mut *handle;

    // Wrap the raw context pointer so we can send it across threads.
    // The C++ side guarantees the context (InputState*) outlives the capture.
    let ctx = callback_ctx as usize; // usize is Send
    let cb = callback_fn;

    let closure: super::app_capture::DataCallback =
        Box::new(move |samples: &[i16], frame_count: usize, channel_count: i32| {
            let ctx_ptr = ctx as *mut std::ffi::c_void;
            unsafe {
                cb(samples.as_ptr(), frame_count, channel_count as c_int, ctx_ptr);
            }
        });

    handle.stream.start(closure, output_channels);
}

/// Stop capturing audio and join the capture thread.
#[no_mangle]
pub unsafe extern "C" fn app_capture_stop(handle: *mut AppCaptureHandle) {
    if handle.is_null() {
        return;
    }
    let handle = &mut *handle;
    handle.stream.stop();
}

/// Destroy the capture handle and free its memory.
/// Must be called after `app_capture_stop`.
#[no_mangle]
pub unsafe extern "C" fn app_capture_destroy(handle: *mut AppCaptureHandle) {
    if handle.is_null() {
        return;
    }
    let _ = Box::from_raw(handle);
}

/// Check if capture is currently running.
#[no_mangle]
pub unsafe extern "C" fn app_capture_is_running(handle: *const AppCaptureHandle) -> bool {
    if handle.is_null() {
        return false;
    }
    let handle = &*handle;
    handle.stream.is_running()
}
