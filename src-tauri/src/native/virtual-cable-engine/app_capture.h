/**
 * app_capture.h
 *
 * Internal C++ interface for per-process audio capture using the Windows 10
 * 2004+ WASAPI Process Loopback API.
 */

#pragma once

#include <functional>
#include <atomic>
#include <thread>
#include <cstdint>

/* ── Per-process loopback capture stream ────────────────────────────────── */

/**
 * Captures audio from a specific Windows process via WASAPI process loopback.
 * Output format: 16-bit signed LE PCM at the system mix-format sample rate
 * (typically 48 kHz), capped at 2 channels (surround is downmixed).
 *
 * Usage:
 *   AppCaptureStream cap(pid);
 *   cap.start([](const int16_t* data, size_t frames, int channels) {
 *       // process audio data (called from capture thread)
 *   }, 2);
 *   // ... later ...
 *   cap.stop();
 */
class AppCaptureStream {
public:
    /**
     * Callback signature: (samples, frameCount, channelCount).
     * Called from the capture thread — must be thread-safe.
     * `samples` points to frameCount * channelCount interleaved int16 values.
     */
    using DataCallback = std::function<void(const int16_t* samples,
                                            size_t frameCount,
                                            int channelCount)>;

    explicit AppCaptureStream(uint32_t pid);
    ~AppCaptureStream();

    /**
     * Start capture. Activation happens on the calling thread while the
     * polling loop runs on a dedicated background thread.
     */
    void start(DataCallback callback, int outputChannels = 2);

    /** Stop capture and join the background thread. */
    void stop();

    bool isRunning() const { return running_.load(); }

private:
    uint32_t            pid_;
    int                 outputChannels_ = 2;
    std::atomic<bool>   running_{false};
    DataCallback        callback_;
    std::thread         captureThread_;

    /* Opaque COM interfaces — defined in the .cpp */
    struct ComState;
    ComState* com_ = nullptr;

    /* CaptureLoop needs access to ComState */
    friend void CaptureLoop(AppCaptureStream::ComState*,
                            AppCaptureStream::DataCallback,
                            int, std::atomic<bool>&);
};
