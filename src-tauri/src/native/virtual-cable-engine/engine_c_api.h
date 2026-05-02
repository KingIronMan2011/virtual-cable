#pragma once

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

// Initialization and cleanup
void engine_initialize();
void engine_terminate();

// Tunnel creation/management
// For simplicity in C-ABI, we pass inputs as parallel arrays.
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
);

void engine_destroy_tunnel(const char* tunnel_id);
void engine_destroy_all_tunnels();

// Tunnel properties
void engine_set_tunnel_muted(const char* tunnel_id, bool muted);
void engine_set_tunnel_gain(const char* tunnel_id, float gain);
void engine_set_tunnel_input_gain(const char* tunnel_id, int input_index, float gain);
void engine_set_tunnel_input_priority(const char* tunnel_id, int input_index, bool priority);
void engine_set_tunnel_ducking(const char* tunnel_id, bool enabled, float amount, float release);

int engine_get_tunnel_sample_rate(const char* tunnel_id);
int engine_get_tunnel_channel_count(const char* tunnel_id);

// Metering callback
typedef void (*engine_level_cb)(const char* tunnel_id, float level, void* user_data);
void engine_set_level_callback(engine_level_cb cb, void* user_data);

#ifdef __cplusplus
}
#endif
