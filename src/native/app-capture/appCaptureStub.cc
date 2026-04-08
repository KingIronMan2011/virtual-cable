/**
 * appCaptureStub.cc
 *
 * No-op stub for non-Windows platforms.  Exports the same N-API surface as
 * appCapture.cc so the module loads successfully, but listAudioApps() returns
 * an empty array and AppCaptureStream does nothing.  The TypeScript wrapper
 * (src/audio/appCapture.ts) already handles the empty/unavailable case.
 */

#include <node_api.h>

static napi_value ListAudioApps(napi_env env, napi_callback_info) {
  napi_value arr;
  napi_create_array_with_length(env, 0, &arr);
  return arr;
}

static napi_value StreamCtor(napi_env env, napi_callback_info info) {
  napi_value thisVal;
  napi_get_cb_info(env, info, nullptr, nullptr, &thisVal, nullptr);
  return thisVal;
}

static napi_value StreamStart(napi_env env, napi_callback_info) { return nullptr; }
static napi_value StreamStop(napi_env env, napi_callback_info)  { return nullptr; }

static napi_value ModuleInit(napi_env env, napi_value exports) {
  napi_value fnList;
  napi_create_function(env, "listAudioApps", NAPI_AUTO_LENGTH,
                       ListAudioApps, nullptr, &fnList);
  napi_set_named_property(env, exports, "listAudioApps", fnList);

  napi_property_descriptor props[] = {
    { "start", nullptr, StreamStart, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "stop",  nullptr, StreamStop,  nullptr, nullptr, nullptr, napi_default, nullptr },
  };
  napi_value ctor;
  napi_define_class(env, "AppCaptureStream", NAPI_AUTO_LENGTH,
                    StreamCtor, nullptr, 2, props, &ctor);
  napi_set_named_property(env, exports, "AppCaptureStream", ctor);

  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, ModuleInit)
