/**
 * engine.h
 *
 * Native C++ audio engine for Virtual Cable.
 * Manages audio tunnels using PortAudio for device I/O and the
 * Rust AppCaptureStream (via C bridge) for per-process WASAPI loopback capture.
 */

#pragma once

#include <string>
#include <vector>
#include <unordered_map>
#include <mutex>
#include <condition_variable>
#include <deque>
#include <atomic>
#include <thread>
#include <functional>
#include <cstdint>

#include <portaudio.h>

/* ── Rust app capture bridge (extern "C" from Rust) ────────────────────── */

typedef void (*app_capture_callback_fn)(const int16_t* samples, size_t frame_count,
                                         int channel_count, void* context);

extern "C" {
    void* app_capture_create(uint32_t pid);
    void  app_capture_start(void* handle, app_capture_callback_fn cb, void* ctx, int output_channels);
    void  app_capture_stop(void* handle);
    void  app_capture_destroy(void* handle);
    bool  app_capture_is_running(const void* handle);
}

/* ── Public types used by the Rust FFI layer ───────────────────────────── */

struct InputConfig {
    int  deviceId;      /* PortAudio device ID, or -1 if using app capture */
    int  appPid;        /* Process ID for app loopback; 0 = device input */
    float gain;
    bool  priority;
};

struct DuckingConfig {
    bool  enabled;
    float amount;       /* Target gain for ducked inputs (0–1) */
    float release;      /* Release time in ms */
};

/* ── Thread-safe FIFO for audio chunks ─────────────────────────────────── */

class AudioQueue {
public:
    void push(const int16_t* data, size_t sampleCount);
    size_t drain(int16_t* out, size_t sampleCount);  /* non-blocking, zero-pads if empty */
    size_t drainBlocking(int16_t* out, size_t sampleCount, std::atomic<bool>& running);
    void clear();

private:
    std::mutex              mtx_;
    std::condition_variable cv_;
    std::deque<int16_t>     buffer_;
    static constexpr size_t MAX_SAMPLES = 48000 * 2 * 2; /* ~1s stereo cap */
};

/* ── Per-input state ───────────────────────────────────────────────────── */

struct InputState {
    int  deviceId;
    int  appPid;

    /* Live-adjustable parameters (read from mixer thread, written from Rust) */
    std::atomic<float> gain{1.0f};
    std::atomic<bool>  priority{false};

    /* PortAudio stream for device inputs */
    PaStream*          paStream = nullptr;

    /* Opaque handle to Rust AppCaptureStream (via C bridge) */
    void*              captureHandle = nullptr;

    /* Queue where the input thread pushes data for the mixer to consume */
    AudioQueue         queue;

    /* Input reader thread */
    std::thread        thread;
    std::atomic<bool>  running{false};
};

/* ── Per-tunnel state ──────────────────────────────────────────────────── */

struct TunnelState {
    std::string id;

    /* Inputs (index 0 = primary) */
    std::vector<InputState*> inputs;

    /* Output */
    PaStream*   outputStream = nullptr;
    int         outputDeviceId;

    /* Audio format */
    int         sampleRate;
    int         channelCount;
    int         framesPerBuffer;

    /* Live-adjustable master controls */
    std::atomic<bool>  muted{false};
    std::atomic<float> masterGain{1.0f};

    /* Ducking (read from mixer, written from JS) */
    std::atomic<bool>  duckEnabled{false};
    std::atomic<float> duckAmount{0.15f};
    std::atomic<float> duckRelease{1000.0f};
    float              duckGain = 1.0f;  /* smoothed — only touched by mixer thread */

    /* Level metering — written by mixer thread, read by level poll timer */
    std::atomic<float> currentLevel{0.0f};

    /* Mixer thread */
    std::thread        mixerThread;
    std::atomic<bool>  running{false};
};

/* ── Level callback type ───────────────────────────────────────────────── */

using LevelCallback = std::function<void(const std::string& tunnelId, float level)>;

/* ── Engine API ────────────────────────────────────────────────────────── */

namespace Engine {
    void initialize();
    void terminate();

    /* Tunnel lifecycle */
    void createTunnel(const std::string& tunnelId,
                      const std::vector<InputConfig>& inputs,
                      int outputDeviceId,
                      int framesPerBuffer,
                      int requestedChannels,    /* 0 = auto */
                      const DuckingConfig& ducking);
    void destroyTunnel(const std::string& tunnelId);
    void destroyAllTunnels();

    /* Live parameter updates */
    void setTunnelMuted(const std::string& tunnelId, bool muted);
    void setTunnelGain(const std::string& tunnelId, float gain);
    void setTunnelInputGain(const std::string& tunnelId, int inputIndex, float gain);
    void setTunnelInputPriority(const std::string& tunnelId, int inputIndex, bool priority);
    void setTunnelDucking(const std::string& tunnelId, const DuckingConfig& cfg);

    /* Queries */
    int getTunnelSampleRate(const std::string& tunnelId);   /* 0 if not found */
    int getTunnelChannelCount(const std::string& tunnelId); /* 0 if not found */

    /* Level callback registration */
    void setLevelCallback(LevelCallback cb);
}
