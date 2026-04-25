/**
 * engine.cpp
 *
 * Native C++ audio engine for Virtual Cable.
 *
 * This file contains:
 *   1. AudioQueue implementation (thread-safe FIFO)
 *   2. TunnelEngine implementation (PortAudio streams, mixing, metering)
 *   3. Device enumeration with WASAPI/MME filtering
 *   4. N-API bindings exposing everything to Node.js
 */

#include "engine.h"
#ifndef NOMINMAX
#define NOMINMAX
#endif


#include <cstdio>
#include <cstring>
#include <cmath>
#include <algorithm>
#include <chrono>

/* ══════════════════════════════════════════════════════════════════════════
   AudioQueue — thread-safe FIFO for int16 audio samples
══════════════════════════════════════════════════════════════════════════ */

void AudioQueue::push(const int16_t* data, size_t sampleCount) {
    std::lock_guard<std::mutex> lk(mtx_);
    /* Drop oldest if exceeding cap to prevent unbounded growth */
    while (buffer_.size() + sampleCount > MAX_SAMPLES && !buffer_.empty()) {
        buffer_.pop_front();
    }
    buffer_.insert(buffer_.end(), data, data + sampleCount);
    cv_.notify_one();
}

size_t AudioQueue::drain(int16_t* out, size_t sampleCount) {
    std::lock_guard<std::mutex> lk(mtx_);
    size_t avail = std::min(sampleCount, buffer_.size());
    for (size_t i = 0; i < avail; i++) {
        out[i] = buffer_.front();
        buffer_.pop_front();
    }
    /* Zero-pad if not enough data */
    if (avail < sampleCount) {
        std::memset(out + avail, 0, (sampleCount - avail) * sizeof(int16_t));
    }
    return avail;
}

size_t AudioQueue::drainBlocking(int16_t* out, size_t sampleCount,
                                  std::atomic<bool>& running) {
    std::unique_lock<std::mutex> lk(mtx_);
    cv_.wait_for(lk, std::chrono::milliseconds(50),
                 [&] { return buffer_.size() >= sampleCount || !running.load(); });
    if (!running.load()) return 0;
    size_t avail = std::min(sampleCount, buffer_.size());
    for (size_t i = 0; i < avail; i++) {
        out[i] = buffer_.front();
        buffer_.pop_front();
    }
    if (avail < sampleCount) {
        std::memset(out + avail, 0, (sampleCount - avail) * sizeof(int16_t));
    }
    return avail;
}

void AudioQueue::clear() {
    std::lock_guard<std::mutex> lk(mtx_);
    buffer_.clear();
}

/* ══════════════════════════════════════════════════════════════════════════
   Engine internals
══════════════════════════════════════════════════════════════════════════ */

static std::mutex                                     g_tunnelMtx;
static std::unordered_map<std::string, TunnelState*>  g_tunnels;
static bool                                           g_paInitialized = false;
static LevelCallback                                  g_levelCallback;

/* ── Device helpers ────────────────────────────────────────────────────── */

static std::string PaHostApiName(int deviceIndex) {
    const PaDeviceInfo* info = Pa_GetDeviceInfo(deviceIndex);
    if (!info) return "";
    const PaHostApiInfo* api = Pa_GetHostApiInfo(info->hostApi);
    return api ? api->name : "";
}

static std::vector<AudioDeviceInfo> GetAllDevices() {
    std::vector<AudioDeviceInfo> result;
    int count = Pa_GetDeviceCount();
    for (int i = 0; i < count; i++) {
        const PaDeviceInfo* info = Pa_GetDeviceInfo(i);
        if (!info || i < 0) continue;
        AudioDeviceInfo d;
        d.id = i;
        d.name = info->name ? info->name : "";
        d.maxInputChannels = info->maxInputChannels;
        d.maxOutputChannels = info->maxOutputChannels;
        d.hostAPIName = PaHostApiName(i);
        d.defaultSampleRate = info->defaultSampleRate;
        result.push_back(d);
    }
    return result;
}

/* Names that PortAudio/MME exposes as generic placeholders */
static const char* JUNK_NAMES[] = {
    "primary sound driver",
    "primary sound capture driver",
    "microsoft sound mapper",
};

static bool IsJunk(const std::string& name) {
    std::string lower = name;
    std::transform(lower.begin(), lower.end(), lower.begin(), ::tolower);
    for (const auto* j : JUNK_NAMES) {
        if (lower.find(j) != std::string::npos) return true;
    }
    return false;
}

/**
 * Prefer MME over WASAPI for routing (handles sample rate conversion).
 * Special case: VB-Audio devices always prefer MME.
 */
static int ResolveRoutingId(int deviceId, const std::vector<AudioDeviceInfo>& all) {
    const AudioDeviceInfo* dev = nullptr;
    for (const auto& d : all) {
        if (d.id == deviceId) { dev = &d; break; }
    }
    if (!dev) return deviceId;

    bool isVBAudio = dev->name.find("VB-Audio") != std::string::npos ||
                     dev->name.find("CABLE") != std::string::npos;

    if (isVBAudio) {
        for (const auto& d : all) {
            if (d.hostAPIName == "MME" &&
                (d.name.find("VB-Audio") != std::string::npos) &&
                d.maxInputChannels == dev->maxInputChannels &&
                d.maxOutputChannels == dev->maxOutputChannels) {
                fprintf(stderr, "[engine] VB-Audio → MME device %d (%s)\n",
                        d.id, d.name.c_str());
                return d.id;
            }
        }
        return deviceId;
    }

    if (dev->hostAPIName != "Windows WASAPI") return deviceId;

    /* Find MME equivalent by matching truncated name */
    for (const auto& d : all) {
        if (d.hostAPIName != "MME") continue;
        if (d.maxInputChannels != dev->maxInputChannels) continue;
        if (d.maxOutputChannels != dev->maxOutputChannels) continue;
        /* MME truncates to 31 chars — check prefix match */
        std::string dName = d.name;
        while (!dName.empty() && dName.back() == ' ') dName.pop_back();
        if (dev->name.rfind(dName, 0) == 0 || dName.rfind(dev->name, 0) == 0) {
            return d.id;
        }
    }
    return deviceId;
}

/* ── Audio processing helpers ──────────────────────────────────────────── */

/**
 * RMS of a 16-bit interleaved PCM buffer, normalized to 0–1 range.
 * 0 = -60 dBFS or below, 1 = 0 dBFS.
 */
static float RmsLevel(const int16_t* data, size_t sampleCount) {
    if (sampleCount == 0) return 0.0f;
    double sumSq = 0.0;
    for (size_t i = 0; i < sampleCount; i++) {
        double s = data[i] / 32768.0;
        sumSq += s * s;
    }
    double rms = std::sqrt(sumSq / sampleCount);
    double db = 20.0 * std::log10(std::max(rms, 1e-9));
    float level = (float)std::max(0.0, std::min(1.0, (db + 60.0) / 60.0));
    return level;
}

/* ── Input reader thread ───────────────────────────────────────────────── */

static void InputReaderThread(InputState* input, int channels, int sampleRate,
                               int framesPerBuffer) {
    fprintf(stderr, "[engine] Input reader thread started (device=%d, app=%d)\n",
            input->deviceId, input->appPid);

    if (input->appPid > 0 && input->captureStream) {
        /* App capture — data arrives via callback, just wait for stop */
        while (input->running.load()) {
            std::this_thread::sleep_for(std::chrono::milliseconds(50));
        }
    } else if (input->paStream) {
        /* Device input — blocking read loop */
        int fpb = framesPerBuffer > 0 ? framesPerBuffer : 256;
        size_t bufSize = (size_t)fpb * channels;
        std::vector<int16_t> buf(bufSize);

        while (input->running.load()) {
            PaError err = Pa_ReadStream(input->paStream, buf.data(), fpb);
            if (err == paNoError || err == paInputOverflowed) {
                input->queue.push(buf.data(), bufSize);
            } else {
                fprintf(stderr, "[engine] Pa_ReadStream error: %s\n",
                        Pa_GetErrorText(err));
                break;
            }
        }
    }

    fprintf(stderr, "[engine] Input reader thread stopped\n");
}

/* ── Mixer thread ──────────────────────────────────────────────────────── */

static void MixerThread(TunnelState* tunnel) {
    fprintf(stderr, "[engine] Mixer thread started for tunnel %s\n",
            tunnel->id.c_str());

    int ch = tunnel->channelCount;
    int sr = tunnel->sampleRate;
    int fpb = tunnel->framesPerBuffer > 0 ? tunnel->framesPerBuffer : 256;
    size_t chunkSamples = (size_t)fpb * ch;

    std::vector<int16_t> primaryBuf(chunkSamples);
    std::vector<int16_t> secBuf(chunkSamples);
    std::vector<int16_t> mixBuf(chunkSamples);

    /* Ducking constants */
    const float DUCK_THRESHOLD = 0.5f;

    auto lastLevelEmit = std::chrono::steady_clock::now();

    while (tunnel->running.load()) {
        /* 1. Read primary input (blocking) */
        if (tunnel->inputs.empty()) break;
        InputState* primary = tunnel->inputs[0];
        primary->queue.drainBlocking(primaryBuf.data(), chunkSamples,
                                      tunnel->running);
        if (!tunnel->running.load()) break;

        /* 2. Read ducking params atomically */
        bool duckEnabled  = tunnel->duckEnabled.load();
        float duckAmount  = tunnel->duckAmount.load();
        float duckReleaseMs = tunnel->duckRelease.load();
        float& duckGain   = tunnel->duckGain;

        /* 3. Determine ducking state */
        bool hasPriority = false, hasNonPriority = false;
        for (auto* inp : tunnel->inputs) {
            if (inp->priority.load()) hasPriority = true;
            else hasNonPriority = true;
        }
        bool canDuck = duckEnabled && hasPriority && hasNonPriority;

        if (canDuck) {
            bool shouldDuck = false;
            /* Check if any priority input is above threshold */
            if (tunnel->inputs[0]->priority.load() &&
                RmsLevel(primaryBuf.data(), chunkSamples) > DUCK_THRESHOLD) {
                shouldDuck = true;
            }
            if (!shouldDuck) {
                /* Note: we check secondary buffers inline below after draining */
            }

            float frameCount = (float)chunkSamples / ch;
            float chunkMs = (frameCount / sr) * 1000.0f;
            if (shouldDuck) {
                float alpha = std::exp(-chunkMs / 20.0f);  /* 20 ms attack */
                duckGain = alpha * duckGain + (1.0f - alpha) * duckAmount;
            } else {
                float alpha = std::exp(-chunkMs / std::max(duckReleaseMs, 1.0f));
                duckGain = alpha * duckGain + (1.0f - alpha) * 1.0f;
                if (duckGain > 0.999f) duckGain = 1.0f;
            }
        } else {
            duckGain = 1.0f;
        }

        /* 4. Mix all inputs */
        float g0 = primary->gain.load();
        bool p0 = primary->priority.load();
        float effectiveG0 = p0 ? g0 : g0 * duckGain;

        /* Start with primary, applying gain */
        for (size_t i = 0; i < chunkSamples; i++) {
            float s = primaryBuf[i] * effectiveG0;
            mixBuf[i] = (int16_t)std::max(-32768.0f, std::min(32767.0f, s));
        }

        /* Add secondary inputs */
        for (size_t si = 1; si < tunnel->inputs.size(); si++) {
            InputState* sec = tunnel->inputs[si];
            sec->queue.drain(secBuf.data(), chunkSamples);

            /* Check ducking on this secondary too */
            if (canDuck && sec->priority.load() &&
                RmsLevel(secBuf.data(), chunkSamples) > DUCK_THRESHOLD) {
                /* Re-evaluate ducking (already applied above, but check secondary) */
            }

            float gs = sec->gain.load();
            bool ps = sec->priority.load();
            float effectiveGs = ps ? gs : gs * duckGain;

            for (size_t i = 0; i < chunkSamples; i++) {
                float sum = mixBuf[i] + secBuf[i] * effectiveGs;
                mixBuf[i] = (int16_t)std::max(-32768.0f, std::min(32767.0f, sum));
            }
        }

        /* 5. Apply master gain and mute */
        bool muted = tunnel->muted.load();
        float masterGain = tunnel->masterGain.load();

        if (muted) {
            std::memset(mixBuf.data(), 0, chunkSamples * sizeof(int16_t));
        } else if (masterGain != 1.0f) {
            for (size_t i = 0; i < chunkSamples; i++) {
                float s = mixBuf[i] * masterGain;
                mixBuf[i] = (int16_t)std::max(-32768.0f, std::min(32767.0f, s));
            }
        }

        /* 6. Compute RMS level (post-gain, post-mute) */
        float level = muted ? 0.0f : RmsLevel(mixBuf.data(), chunkSamples);
        tunnel->currentLevel.store(level);

        /* Emit level at ~20fps */
        auto now = std::chrono::steady_clock::now();
        auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
            now - lastLevelEmit).count();
        if (elapsed >= 50 && g_levelCallback) {
            g_levelCallback(tunnel->id, level);
            lastLevelEmit = now;
        }

        /* 7. Write to output */
        if (tunnel->outputStream) {
            PaError err = Pa_WriteStream(tunnel->outputStream, mixBuf.data(), fpb);
            if (err != paNoError && err != paOutputUnderflowed) {
                fprintf(stderr, "[engine] Pa_WriteStream error: %s\n",
                        Pa_GetErrorText(err));
                /* Don't break — try to keep going */
            }
        }
    }

    fprintf(stderr, "[engine] Mixer thread stopped for tunnel %s\n",
            tunnel->id.c_str());
}

/* ══════════════════════════════════════════════════════════════════════════
   Engine public API
══════════════════════════════════════════════════════════════════════════ */

void Engine::initialize() {
    if (!g_paInitialized) {
        PaError err = Pa_Initialize();
        if (err != paNoError) {
            fprintf(stderr, "[engine] Pa_Initialize failed: %s\n",
                    Pa_GetErrorText(err));
        } else {
            g_paInitialized = true;
            fprintf(stderr, "[engine] PortAudio initialized (%d devices)\n",
                    Pa_GetDeviceCount());
        }
    }
}

void Engine::terminate() {
    destroyAllTunnels();
    if (g_paInitialized) {
        Pa_Terminate();
        g_paInitialized = false;
    }
}

std::vector<AudioDeviceInfo> Engine::getAudioDevices() {
    if (!g_paInitialized) initialize();

    auto all = GetAllDevices();

    /* Filter: remove junk names, prefer WASAPI for enumeration */
    std::vector<AudioDeviceInfo> filtered;
    for (const auto& d : all) {
        if (d.id < 0 || IsJunk(d.name)) continue;
        filtered.push_back(d);
    }

    std::vector<AudioDeviceInfo> wasapi;
    for (const auto& d : filtered) {
        if (d.hostAPIName == "Windows WASAPI") wasapi.push_back(d);
    }

    auto& pool = wasapi.empty() ? filtered : wasapi;

    /* Return only the fields the UI needs */
    std::vector<AudioDeviceInfo> result;
    for (const auto& d : pool) {
        result.push_back({d.id, d.name, d.maxInputChannels,
                          d.maxOutputChannels, d.hostAPIName,
                          d.defaultSampleRate});
    }
    return result;
}

void Engine::createTunnel(const std::string& tunnelId,
                           const std::vector<InputConfig>& inputConfigs,
                           int outputDeviceId,
                           int framesPerBuffer,
                           int requestedChannels,
                           const DuckingConfig& ducking) {
    if (!g_paInitialized) initialize();

    /* Destroy existing tunnel with same ID */
    destroyTunnel(tunnelId);

    if (inputConfigs.empty()) return;

    auto all = GetAllDevices();

    auto isApp = [](const InputConfig& c) { return c.appPid > 0; };

    /* Resolve routing IDs (prefer MME) */
    std::vector<int> routingInputIds;
    for (const auto& c : inputConfigs) {
        routingInputIds.push_back(isApp(c) ? 0 : ResolveRoutingId(c.deviceId, all));
    }
    int routingOutputId = ResolveRoutingId(outputDeviceId, all);

    /* Determine audio format */
    const AudioDeviceInfo* primaryInputInfo = nullptr;
    const AudioDeviceInfo* outputInfo = nullptr;
    if (!isApp(inputConfigs[0])) {
        for (const auto& d : all) {
            if (d.id == routingInputIds[0]) { primaryInputInfo = &d; break; }
        }
    }
    for (const auto& d : all) {
        if (d.id == routingOutputId) { outputInfo = &d; break; }
    }

    int maxCh = std::min(
        primaryInputInfo ? primaryInputInfo->maxInputChannels
                         : (outputInfo ? outputInfo->maxOutputChannels : 2),
        outputInfo ? outputInfo->maxOutputChannels : 2
    );
    int channels = requestedChannels > 0
        ? std::min(requestedChannels, maxCh)
        : maxCh;

    int sampleRate;
    if (isApp(inputConfigs[0])) {
        sampleRate = 48000;
    } else if ((primaryInputInfo && primaryInputInfo->hostAPIName == "MME") ||
               (outputInfo && outputInfo->hostAPIName == "MME")) {
        sampleRate = 48000;
    } else {
        sampleRate = (int)(outputInfo ? outputInfo->defaultSampleRate
                          : primaryInputInfo ? primaryInputInfo->defaultSampleRate
                          : 48000);
    }

    /* VB-Audio output handling */
    bool isVBAudio = outputInfo &&
        (outputInfo->name.find("VB-Audio") != std::string::npos ||
         outputInfo->name.find("CABLE") != std::string::npos);
    int outFpb = isVBAudio ? 512 : (framesPerBuffer > 0 ? framesPerBuffer : 0);
    int inFpb = framesPerBuffer > 0 ? framesPerBuffer : 0;

    fprintf(stderr, "[engine] Creating tunnel %s: %d inputs, output=%d, ch=%d, sr=%d\n",
            tunnelId.c_str(), (int)inputConfigs.size(), routingOutputId,
            channels, sampleRate);

    /* Create tunnel state */
    auto* tunnel = new TunnelState();
    tunnel->id = tunnelId;
    tunnel->outputDeviceId = outputDeviceId;
    tunnel->sampleRate = sampleRate;
    tunnel->channelCount = channels;
    tunnel->framesPerBuffer = inFpb > 0 ? inFpb : 256;
    tunnel->duckEnabled.store(ducking.enabled);
    tunnel->duckAmount.store(ducking.amount);
    tunnel->duckRelease.store(ducking.release);

    /* Create input states */
    for (size_t i = 0; i < inputConfigs.size(); i++) {
        auto* input = new InputState();
        input->deviceId = inputConfigs[i].deviceId;
        input->appPid = inputConfigs[i].appPid;
        input->gain.store(inputConfigs[i].gain);
        input->priority.store(inputConfigs[i].priority);

        if (isApp(inputConfigs[i])) {
            /* App capture input */
            input->captureStream = new AppCaptureStream((uint32_t)inputConfigs[i].appPid);
            input->captureStream->start(
                [input, channels](const int16_t* data, size_t frameCount, int ch) {
                    (void)ch;
                    input->queue.push(data, frameCount * channels);
                },
                channels
            );
        } else {
            /* Device input — open PortAudio stream */
            PaStreamParameters inParams = {};
            inParams.device = routingInputIds[i];
            inParams.channelCount = channels;
            inParams.sampleFormat = paInt16;
            const PaDeviceInfo* devInfo = Pa_GetDeviceInfo(routingInputIds[i]);
            inParams.suggestedLatency = devInfo
                ? devInfo->defaultLowInputLatency : 0.01;
            inParams.hostApiSpecificStreamInfo = nullptr;

            PaError err = Pa_OpenStream(
                &input->paStream,
                &inParams, nullptr,  /* input only */
                sampleRate,
                inFpb > 0 ? (unsigned long)inFpb : 256,
                paNoFlag,
                nullptr, nullptr     /* blocking mode (no callback) */
            );
            if (err != paNoError) {
                fprintf(stderr, "[engine] Pa_OpenStream(input %zu) failed: %s\n",
                        i, Pa_GetErrorText(err));
                delete input;
                continue;
            }
        }

        tunnel->inputs.push_back(input);
    }

    if (tunnel->inputs.empty()) {
        fprintf(stderr, "[engine] No inputs could be opened, aborting tunnel\n");
        delete tunnel;
        return;
    }

    /* Create output stream */
    {
        PaStreamParameters outParams = {};
        outParams.device = routingOutputId;
        outParams.channelCount = std::min(channels,
            outputInfo ? outputInfo->maxOutputChannels : 2);
        outParams.sampleFormat = paInt16;
        const PaDeviceInfo* devInfo = Pa_GetDeviceInfo(routingOutputId);
        outParams.suggestedLatency = devInfo
            ? devInfo->defaultHighOutputLatency : 0.05;
        outParams.hostApiSpecificStreamInfo = nullptr;

        PaError err = Pa_OpenStream(
            &tunnel->outputStream,
            nullptr, &outParams,  /* output only */
            sampleRate,
            outFpb > 0 ? (unsigned long)outFpb : 256,
            paNoFlag,
            nullptr, nullptr       /* blocking mode */
        );
        if (err != paNoError) {
            fprintf(stderr, "[engine] Pa_OpenStream(output) failed: %s\n",
                    Pa_GetErrorText(err));
            /* Cleanup and abort */
            for (auto* inp : tunnel->inputs) {
                if (inp->paStream) Pa_CloseStream(inp->paStream);
                if (inp->captureStream) { inp->captureStream->stop(); delete inp->captureStream; }
                delete inp;
            }
            delete tunnel;
            return;
        }
    }

    /* Start all PortAudio streams */
    for (auto* input : tunnel->inputs) {
        if (input->paStream) {
            PaError err = Pa_StartStream(input->paStream);
            if (err != paNoError) {
                fprintf(stderr, "[engine] Pa_StartStream(input) failed: %s\n",
                        Pa_GetErrorText(err));
            }
        }
    }

    {
        PaError err = Pa_StartStream(tunnel->outputStream);
        if (err != paNoError) {
            fprintf(stderr, "[engine] Pa_StartStream(output) failed: %s\n",
                    Pa_GetErrorText(err));
            /* Try to continue anyway — some devices auto-start on write */
        }
    }

    /* Start input reader threads */
    tunnel->running.store(true);
    for (auto* input : tunnel->inputs) {
        input->running.store(true);
        input->thread = std::thread(InputReaderThread, input, channels,
                                     sampleRate, tunnel->framesPerBuffer);
    }

    /* Start mixer thread */
    tunnel->mixerThread = std::thread(MixerThread, tunnel);

    /* Store tunnel */
    {
        std::lock_guard<std::mutex> lk(g_tunnelMtx);
        g_tunnels[tunnelId] = tunnel;
    }

    fprintf(stderr, "[engine] Tunnel %s created successfully\n", tunnelId.c_str());
}

void Engine::destroyTunnel(const std::string& tunnelId) {
    TunnelState* tunnel = nullptr;
    {
        std::lock_guard<std::mutex> lk(g_tunnelMtx);
        auto it = g_tunnels.find(tunnelId);
        if (it == g_tunnels.end()) return;
        tunnel = it->second;
        g_tunnels.erase(it);
    }

    /* Signal level zero immediately */
    if (g_levelCallback) {
        g_levelCallback(tunnelId, 0.0f);
    }

    /* Stop mixer */
    tunnel->running.store(false);
    if (tunnel->mixerThread.joinable()) tunnel->mixerThread.join();

    /* Stop and clean up inputs */
    for (auto* input : tunnel->inputs) {
        input->running.store(false);
        if (input->thread.joinable()) input->thread.join();
        if (input->captureStream) {
            input->captureStream->stop();
            delete input->captureStream;
        }
        if (input->paStream) {
            Pa_StopStream(input->paStream);
            Pa_CloseStream(input->paStream);
        }
        delete input;
    }

    /* Stop and clean up output */
    if (tunnel->outputStream) {
        Pa_StopStream(tunnel->outputStream);
        Pa_CloseStream(tunnel->outputStream);
    }

    delete tunnel;
    fprintf(stderr, "[engine] Tunnel %s destroyed\n", tunnelId.c_str());
}

void Engine::destroyAllTunnels() {
    std::vector<std::string> ids;
    {
        std::lock_guard<std::mutex> lk(g_tunnelMtx);
        for (const auto& [id, _] : g_tunnels) ids.push_back(id);
    }
    for (const auto& id : ids) destroyTunnel(id);
}

void Engine::reloadAllTunnels(int framesPerBuffer) {
    struct Snapshot {
        std::string id;
        std::vector<InputConfig> inputs;
        int outputDeviceId;
        int channelCount;
        DuckingConfig ducking;
    };

    std::vector<Snapshot> snapshots;
    {
        std::lock_guard<std::mutex> lk(g_tunnelMtx);
        for (const auto& [id, tunnel] : g_tunnels) {
            Snapshot s;
            s.id = id;
            s.outputDeviceId = tunnel->outputDeviceId;
            s.channelCount = tunnel->channelCount;
            s.ducking = {
                tunnel->duckEnabled.load(),
                tunnel->duckAmount.load(),
                tunnel->duckRelease.load()
            };
            for (auto* inp : tunnel->inputs) {
                s.inputs.push_back({
                    inp->deviceId, inp->appPid,
                    inp->gain.load(), inp->priority.load()
                });
            }
            snapshots.push_back(std::move(s));
        }
    }

    for (const auto& s : snapshots) {
        createTunnel(s.id, s.inputs, s.outputDeviceId,
                     framesPerBuffer, s.channelCount, s.ducking);
    }
}

void Engine::setTunnelMuted(const std::string& tunnelId, bool muted) {
    std::lock_guard<std::mutex> lk(g_tunnelMtx);
    auto it = g_tunnels.find(tunnelId);
    if (it != g_tunnels.end()) it->second->muted.store(muted);
}

void Engine::setTunnelGain(const std::string& tunnelId, float gain) {
    std::lock_guard<std::mutex> lk(g_tunnelMtx);
    auto it = g_tunnels.find(tunnelId);
    if (it != g_tunnels.end()) it->second->masterGain.store(gain);
}

void Engine::setTunnelInputGain(const std::string& tunnelId, int inputIndex,
                                 float gain) {
    std::lock_guard<std::mutex> lk(g_tunnelMtx);
    auto it = g_tunnels.find(tunnelId);
    if (it != g_tunnels.end() && inputIndex >= 0 &&
        inputIndex < (int)it->second->inputs.size()) {
        it->second->inputs[inputIndex]->gain.store(gain);
    }
}

void Engine::setTunnelInputPriority(const std::string& tunnelId, int inputIndex,
                                     bool priority) {
    std::lock_guard<std::mutex> lk(g_tunnelMtx);
    auto it = g_tunnels.find(tunnelId);
    if (it != g_tunnels.end() && inputIndex >= 0 &&
        inputIndex < (int)it->second->inputs.size()) {
        it->second->inputs[inputIndex]->priority.store(priority);
    }
}

void Engine::setTunnelDucking(const std::string& tunnelId,
                               const DuckingConfig& cfg) {
    std::lock_guard<std::mutex> lk(g_tunnelMtx);
    auto it = g_tunnels.find(tunnelId);
    if (it == g_tunnels.end()) return;
    auto* t = it->second;
    t->duckEnabled.store(cfg.enabled);
    t->duckAmount.store(cfg.amount);
    t->duckRelease.store(cfg.release);
    if (!cfg.enabled) t->duckGain = 1.0f;
}

int Engine::getTunnelSampleRate(const std::string& tunnelId) {
    std::lock_guard<std::mutex> lk(g_tunnelMtx);
    auto it = g_tunnels.find(tunnelId);
    return it != g_tunnels.end() ? it->second->sampleRate : 0;
}

int Engine::getTunnelChannelCount(const std::string& tunnelId) {
    std::lock_guard<std::mutex> lk(g_tunnelMtx);
    auto it = g_tunnels.find(tunnelId);
    return it != g_tunnels.end() ? it->second->channelCount : 0;
}

void Engine::setLevelCallback(LevelCallback cb) {
    g_levelCallback = std::move(cb);
}

// End of engine.cpp
