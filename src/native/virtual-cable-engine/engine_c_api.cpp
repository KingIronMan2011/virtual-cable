#include "engine_c_api.h"
#include "engine.h"
#include <vector>
#include <string>

extern "C" {

void engine_initialize() {
    Engine::initialize();
}

void engine_terminate() {
    Engine::terminate();
}

void engine_get_audio_devices(engine_device_cb cb, void* user_data) {
    if (!cb) return;
    auto devices = Engine::getAudioDevices();
    for (const auto& dev : devices) {
        cb(dev.id, dev.name.c_str(), dev.maxInputChannels, dev.maxOutputChannels, dev.hostAPIName.c_str(), dev.defaultSampleRate, user_data);
    }
}

void engine_get_audio_apps(engine_app_cb cb, void* user_data) {
    if (!cb) return;
    auto apps = listAudioApps();
    for (const auto& app : apps) {
        cb(app.pid, app.name.c_str(), app.exe.c_str(), user_data);
    }
}

void engine_create_tunnel(
    const char* tunnel_id,
    int num_inputs,
    const int* input_device_ids,
    const uint32_t* input_app_pids,
    const float* input_gains,
    const bool* input_priorities,
    int output_device_id,
    int frames_per_buffer,
    int requested_channels,
    bool duck_enabled,
    float duck_amount,
    float duck_release
) {
    std::string t_id = tunnel_id ? tunnel_id : "";
    std::vector<InputConfig> inputs;
    for (int i = 0; i < num_inputs; i++) {
        InputConfig cfg;
        cfg.deviceId = input_device_ids[i];
        cfg.appPid = (int)input_app_pids[i];
        cfg.gain = input_gains[i];
        cfg.priority = input_priorities[i];
        inputs.push_back(cfg);
    }

    DuckingConfig ducking = { duck_enabled, duck_amount, duck_release };

    Engine::createTunnel(t_id, inputs, output_device_id, frames_per_buffer, requested_channels, ducking);
}

void engine_destroy_tunnel(const char* tunnel_id) {
    Engine::destroyTunnel(tunnel_id ? tunnel_id : "");
}

void engine_destroy_all_tunnels() {
    Engine::destroyAllTunnels();
}

void engine_reload_all_tunnels(int frames_per_buffer) {
    Engine::reloadAllTunnels(frames_per_buffer);
}

void engine_set_tunnel_muted(const char* tunnel_id, bool muted) {
    Engine::setTunnelMuted(tunnel_id ? tunnel_id : "", muted);
}

void engine_set_tunnel_gain(const char* tunnel_id, float gain) {
    Engine::setTunnelGain(tunnel_id ? tunnel_id : "", gain);
}

void engine_set_tunnel_input_gain(const char* tunnel_id, int input_index, float gain) {
    Engine::setTunnelInputGain(tunnel_id ? tunnel_id : "", input_index, gain);
}

void engine_set_tunnel_input_priority(const char* tunnel_id, int input_index, bool priority) {
    Engine::setTunnelInputPriority(tunnel_id ? tunnel_id : "", input_index, priority);
}

void engine_set_tunnel_ducking(const char* tunnel_id, bool enabled, float amount, float release) {
    DuckingConfig ducking = { enabled, amount, release };
    Engine::setTunnelDucking(tunnel_id ? tunnel_id : "", ducking);
}

int engine_get_tunnel_sample_rate(const char* tunnel_id) {
    return Engine::getTunnelSampleRate(tunnel_id ? tunnel_id : "");
}

int engine_get_tunnel_channel_count(const char* tunnel_id) {
    return Engine::getTunnelChannelCount(tunnel_id ? tunnel_id : "");
}

static engine_level_cb g_c_level_cb = nullptr;

void engine_set_level_callback(engine_level_cb cb) {
    g_c_level_cb = cb;
    if (cb) {
        Engine::setLevelCallback([](const std::string& tunnel_id, float level) {
            if (g_c_level_cb) {
                g_c_level_cb(tunnel_id.c_str(), level);
            }
        });
    } else {
        Engine::setLevelCallback(nullptr);
    }
}

} // extern "C"
