/**
 * appCapture.cc
 *
 * Per-process audio capture using the Windows 10 2004+ WASAPI
 * Process Loopback API.  Exposes two N-API symbols:
 *
 *   listAudioApps() → [{pid, name, exe}, ...]
 *   new AppCaptureStream(pid) → { start(cb, channels), stop() }
 *
 * The stream outputs 16-bit signed LE PCM at the system mix-format
 * sample rate (usually 48 kHz).  Channels are capped at 2 (stereo);
 * surround-sound apps are downmixed by taking the first two channels.
 */

#define UNICODE
#define _UNICODE
#define WIN32_LEAN_AND_MEAN

#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <audiopolicy.h>
#include <psapi.h>
#include <ole2.h>
#include <roapi.h>    /* RoInitialize / RoUninitialize */
#include <node_api.h>

#include <string>
#include <vector>
#include <thread>
#include <atomic>
#include <cmath>
#include <cstring>

/* ──────────────────────────────────────────────────────────────────────────
   Windows 10 2004+ process-loopback structs
   (from audioclientactivationparams.h, not always present in older SDKs)
─────────────────────────────────────────────────────────────────────────── */
#ifndef AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK
#define VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK L"VAD\\Process_Loopback"

typedef enum _AUDIOCLIENT_ACTIVATION_TYPE {
  AUDIOCLIENT_ACTIVATION_TYPE_DEFAULT = 0,
  AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK = 1,
} AUDIOCLIENT_ACTIVATION_TYPE;

typedef enum _PROCESS_LOOPBACK_MODE {
  PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE = 0,
  PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE = 1,
} PROCESS_LOOPBACK_MODE;

typedef struct _AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS {
  DWORD TargetProcessId;
  PROCESS_LOOPBACK_MODE ProcessLoopbackMode;
} AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS;

typedef struct _AUDIOCLIENT_ACTIVATION_PARAMS {
  AUDIOCLIENT_ACTIVATION_TYPE ActivationType;
  union {
    AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS ProcessLoopbackParams;
  };
} AUDIOCLIENT_ACTIVATION_PARAMS;
#endif


/* Diagnostic helper — prints to stderr so it shows up in the Electron terminal */
#include <cstdio>
#define LOGERR(msg, hr) \
  fprintf(stderr, "[app-capture] ERROR %s: hr=0x%08lX\n", (msg), (unsigned long)(hr))

/* KSDATAFORMAT_SUBTYPE_IEEE_FLOAT — avoid pulling in ksmedia.h */
static const GUID LOCAL_IEEE_FLOAT = {
  0x00000003, 0x0000, 0x0010,
  {0x80, 0x00, 0x00, 0xAA, 0x00, 0x38, 0x9B, 0x71}
};
static const GUID LOCAL_PCM = {
  0x00000001, 0x0000, 0x0010,
  {0x80, 0x00, 0x00, 0xAA, 0x00, 0x38, 0x9B, 0x71}
};

/* ──────────────────────────────────────────────────────────────────────────
   COM completion handler — activates and fully initialises the audio client
   on the MTA thread-pool callback thread (matching the Microsoft sample).
   The main thread simply waits on hDone and picks up the ready interfaces.
─────────────────────────────────────────────────────────────────────────── */
class CompletionHandler : public IActivateAudioInterfaceCompletionHandler {
public:
  HANDLE               hDone;
  IAudioClient*        pClient;
  IAudioCaptureClient* pCapture;
  WAVEFORMATEX*        pFmt;
  HRESULT              hrActivate;
  HRESULT              hrInit;
  LONG                 refs;

  CompletionHandler()
    : pClient(nullptr), pCapture(nullptr), pFmt(nullptr),
      hrActivate(E_PENDING), hrInit(E_PENDING), refs(1) {
    hDone = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  }
  ~CompletionHandler() {
    if (hDone)    CloseHandle(hDone);
    if (pCapture) { pCapture->Release(); pCapture = nullptr; }
    if (pClient)  { pClient->Release();  pClient  = nullptr; }
    if (pFmt)     { CoTaskMemFree(pFmt); pFmt     = nullptr; }
  }

  HRESULT STDMETHODCALLTYPE ActivateCompleted(
      IActivateAudioInterfaceAsyncOperation* pOp) override {
    IUnknown* pUnk = nullptr;
    pOp->GetActivateResult(&hrActivate, &pUnk);
    if (SUCCEEDED(hrActivate) && pUnk) {
      pUnk->QueryInterface(__uuidof(IAudioClient), (void**)&pClient);
      pUnk->Release();
    }

    /* Initialize on the MTA pool thread.
       AUDCLNT_E_ENGINE_FORMAT_LOCKED (0x88890021) means the loopback client
       only accepts the audio engine's current mix format — query it from the
       default render endpoint first, then fall back to hardcoded candidates. */
    if (SUCCEEDED(hrActivate) && pClient) {
      hrInit = E_FAIL;

      /* ── Step 1: try the default render device's exact mix format ─────── */
      {
        IMMDeviceEnumerator* pEnum = nullptr;
        IMMDevice*           pDev  = nullptr;
        IAudioClient*        pRC   = nullptr;
        WAVEFORMATEX*        pMix  = nullptr;

        HRESULT hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr,
                                      CLSCTX_ALL, __uuidof(IMMDeviceEnumerator),
                                      (void**)&pEnum);
        if (SUCCEEDED(hr)) hr = pEnum->GetDefaultAudioEndpoint(eRender, eConsole, &pDev);
        if (SUCCEEDED(hr)) hr = pDev->Activate(__uuidof(IAudioClient), CLSCTX_ALL,
                                                nullptr, (void**)&pRC);
        if (SUCCEEDED(hr)) hr = pRC->GetMixFormat(&pMix);

        if (SUCCEEDED(hr) && pMix) {
          fprintf(stderr,
                  "[app-capture] render mix fmt: ch=%u rate=%lu bits=%u tag=%u\n",
                  (unsigned)pMix->nChannels, (unsigned long)pMix->nSamplesPerSec,
                  (unsigned)pMix->wBitsPerSample, (unsigned)pMix->wFormatTag);

          hrInit = pClient->Initialize(AUDCLNT_SHAREMODE_SHARED,
                                       AUDCLNT_STREAMFLAGS_LOOPBACK,
                                       200 * 10000, 0, pMix, nullptr);
          if (SUCCEEDED(hrInit)) {
            size_t fmtBytes = sizeof(WAVEFORMATEX) + pMix->cbSize;
            pFmt = static_cast<WAVEFORMATEX*>(CoTaskMemAlloc(fmtBytes));
            if (pFmt) memcpy(pFmt, pMix, fmtBytes);
          } else {
            fprintf(stderr, "[app-capture] Initialize(render mix fmt) failed: hr=0x%08lX\n",
                    (unsigned long)hrInit);
          }
          CoTaskMemFree(pMix);
        }

        if (pRC)   pRC->Release();
        if (pDev)  pDev->Release();
        if (pEnum) pEnum->Release();
      }

      /* ── Step 2: fallback to stereo formats ─────────────────────────── */
      if (FAILED(hrInit)) {
        struct FmtCandidate { DWORD rate; WORD ch; WORD bits; bool isFloat; };
        static const FmtCandidate kFmts[] = {
          { 48000, 2, 32, true  },
          { 44100, 2, 32, true  },
          { 48000, 2, 16, false },
          { 44100, 2, 16, false },
        };
        for (const auto& f : kFmts) {
          WAVEFORMATEXTENSIBLE wfx = {};
          wfx.Format.wFormatTag      = WAVE_FORMAT_EXTENSIBLE;
          wfx.Format.nChannels       = f.ch;
          wfx.Format.nSamplesPerSec  = f.rate;
          wfx.Format.wBitsPerSample  = f.bits;
          wfx.Format.nBlockAlign     = (WORD)(f.ch * (f.bits / 8));
          wfx.Format.nAvgBytesPerSec = f.rate * wfx.Format.nBlockAlign;
          wfx.Format.cbSize = sizeof(WAVEFORMATEXTENSIBLE) - sizeof(WAVEFORMATEX);
          wfx.Samples.wValidBitsPerSample = f.bits;
          wfx.dwChannelMask = SPEAKER_FRONT_LEFT | SPEAKER_FRONT_RIGHT;
          wfx.SubFormat = f.isFloat ? LOCAL_IEEE_FLOAT : LOCAL_PCM;

          hrInit = pClient->Initialize(AUDCLNT_SHAREMODE_SHARED,
                                       AUDCLNT_STREAMFLAGS_LOOPBACK,
                                       200 * 10000, 0, (WAVEFORMATEX*)&wfx, nullptr);
          if (SUCCEEDED(hrInit)) {
            pFmt = static_cast<WAVEFORMATEX*>(CoTaskMemAlloc(sizeof(wfx)));
            if (pFmt) memcpy(pFmt, &wfx, sizeof(wfx));
            break;
          }
          fprintf(stderr, "[app-capture] Initialize %uch/%luHz/%ubit failed: hr=0x%08lX\n",
                  (unsigned)f.ch, (unsigned long)f.rate, (unsigned)f.bits,
                  (unsigned long)hrInit);
        }
      }

      if (SUCCEEDED(hrInit) && pFmt) {
        HRESULT hr = pClient->GetService(__uuidof(IAudioCaptureClient),
                                         (void**)&pCapture);
        if (FAILED(hr)) { LOGERR("GetService", hr); hrInit = hr; }
      }
    }

    SetEvent(hDone);
    return S_OK;
  }

  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
    if (riid == __uuidof(IActivateAudioInterfaceCompletionHandler) ||
        riid == __uuidof(IAgileObject) || /* must be agile or returns RO_E_ILLEGAL_METHOD_CALL */
        riid == IID_IUnknown) {
      *ppv = this; AddRef(); return S_OK;
    }
    *ppv = nullptr; return E_NOINTERFACE;
  }
  ULONG STDMETHODCALLTYPE AddRef()  override { return InterlockedIncrement(&refs); }
  ULONG STDMETHODCALLTYPE Release() override {
    ULONG r = InterlockedDecrement(&refs);
    if (r == 0) delete this;
    return r;
  }
};

/* ──────────────────────────────────────────────────────────────────────────
   Sample conversion helpers
─────────────────────────────────────────────────────────────────────────── */
static inline int16_t f32ToI16(float f) {
  int32_t v = (int32_t)(f * 32767.0f);
  if (v >  32767) v =  32767;
  if (v < -32768) v = -32768;
  return (int16_t)v;
}

/* ──────────────────────────────────────────────────────────────────────────
   listAudioApps — enumerate processes with active render audio sessions
─────────────────────────────────────────────────────────────────────────── */
struct AudioAppInfo {
  DWORD        pid;
  std::wstring name;
  std::wstring exe;
};

static std::vector<AudioAppInfo> EnumAudioSessions() {
  std::vector<AudioAppInfo> apps;
  CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);

  IMMDeviceEnumerator*    pEnum = nullptr;
  IMMDevice*              pDev  = nullptr;
  IAudioSessionManager2*  pSM   = nullptr;
  IAudioSessionEnumerator* pSE  = nullptr;

  if (FAILED(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr,
        CLSCTX_ALL, __uuidof(IMMDeviceEnumerator), (void**)&pEnum)))
    goto done;
  if (FAILED(pEnum->GetDefaultAudioEndpoint(eRender, eConsole, &pDev)))
    goto done;
  if (FAILED(pDev->Activate(__uuidof(IAudioSessionManager2), CLSCTX_ALL,
        nullptr, (void**)&pSM)))
    goto done;
  if (FAILED(pSM->GetSessionEnumerator(&pSE)))
    goto done;

  {
    int count = 0;
    pSE->GetCount(&count);
    for (int i = 0; i < count; i++) {
      IAudioSessionControl*  pCtl  = nullptr;
      IAudioSessionControl2* pCtl2 = nullptr;
      if (FAILED(pSE->GetSession(i, &pCtl))) continue;
      if (FAILED(pCtl->QueryInterface(__uuidof(IAudioSessionControl2),
            (void**)&pCtl2))) { pCtl->Release(); continue; }

      DWORD pid = 0;
      pCtl2->GetProcessId(&pid);
      pCtl2->Release();
      pCtl->Release();

      if (pid == 0) continue;  /* system/global session */

      /* de-duplicate by PID */
      bool found = false;
      for (const auto& a : apps) if (a.pid == pid) { found = true; break; }
      if (found) continue;

      HANDLE hProc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
      if (!hProc) continue;

      wchar_t exePath[MAX_PATH] = {};
      DWORD sz = MAX_PATH;
      QueryFullProcessImageNameW(hProc, 0, exePath, &sz);
      CloseHandle(hProc);

      std::wstring fullPath(exePath);
      std::wstring exeFile = fullPath.substr(fullPath.find_last_of(L"\\") + 1);
      std::wstring dispName = exeFile;
      if (dispName.size() > 4 &&
          _wcsicmp(dispName.c_str() + dispName.size() - 4, L".exe") == 0)
        dispName = dispName.substr(0, dispName.size() - 4);

      apps.push_back({pid, dispName, exeFile});
    }
  }

done:
  if (pSE)   pSE->Release();
  if (pSM)   pSM->Release();
  if (pDev)  pDev->Release();
  if (pEnum) pEnum->Release();
  CoUninitialize();
  return apps;
}

static napi_value WstrToNapi(napi_env env, const std::wstring& ws) {
  int n = WideCharToMultiByte(CP_UTF8, 0, ws.c_str(), -1, nullptr, 0, nullptr, nullptr);
  std::string s(n > 0 ? n - 1 : 0, '\0');
  if (n > 0) WideCharToMultiByte(CP_UTF8, 0, ws.c_str(), -1, &s[0], n, nullptr, nullptr);
  napi_value v;
  napi_create_string_utf8(env, s.c_str(), s.size(), &v);
  return v;
}

static napi_value ListAudioApps(napi_env env, napi_callback_info /*info*/) {
  auto apps = EnumAudioSessions();
  napi_value arr;
  napi_create_array_with_length(env, apps.size(), &arr);
  for (size_t i = 0; i < apps.size(); i++) {
    napi_value obj, pidVal;
    napi_create_object(env, &obj);
    napi_create_uint32(env, apps[i].pid, &pidVal);
    napi_set_named_property(env, obj, "pid",  pidVal);
    napi_set_named_property(env, obj, "name", WstrToNapi(env, apps[i].name));
    napi_set_named_property(env, obj, "exe",  WstrToNapi(env, apps[i].exe));
    napi_set_element(env, arr, (uint32_t)i, obj);
  }
  return arr;
}

/* ──────────────────────────────────────────────────────────────────────────
   AppCaptureStream
─────────────────────────────────────────────────────────────────────────── */
struct ChunkData { std::vector<int16_t> samples; };

struct CaptureCtx {
  DWORD                    pid;
  uint16_t                 outputChannels;  /* 1 or 2 — desired output ch count */
  std::atomic<bool>        running{false};
  napi_threadsafe_function tsfn{nullptr};
  std::thread              captureThread;

  /* Activated + initialised on the main (JS) thread by StreamStart.
     The capture polling thread only reads these; cleanup happens after
     the thread is joined. */
  IAudioClient*        pClient{nullptr};
  IAudioCaptureClient* pCapture{nullptr};
  WAVEFORMATEX*        pFmt{nullptr};
};

/* Called on the Node.js main thread via the TSFN */
static void TsfnCallback(napi_env env, napi_value jsCb,
                         void* /*ctx*/, void* data) {
  auto* chunk = static_cast<ChunkData*>(data);
  if (!chunk) return;
  if (!env) { delete chunk; return; }  /* cleanup / abort path */

  napi_value buffer;
  void* ptr;
  size_t byteLen = chunk->samples.size() * sizeof(int16_t);
  napi_create_buffer_copy(env, byteLen, chunk->samples.data(), &ptr, &buffer);
  delete chunk;

  napi_value global, undef;
  napi_get_global(env, &global);
  napi_get_undefined(env, &undef);
  napi_call_function(env, global, jsCb, 1, &buffer, nullptr);
}

/* Runs on a dedicated background thread — only does capture polling.
   Activation and client init are done on the main thread in StreamStart,
   so no WinRT/COM apartment setup is needed here beyond MTA for the
   IAudioCaptureClient polling calls. */
static void CaptureLoop(CaptureCtx* ctx) {
  CoInitializeEx(nullptr, COINIT_MULTITHREADED);

  IAudioClient*        pClient  = ctx->pClient;
  IAudioCaptureClient* pCapture = ctx->pCapture;
  WAVEFORMATEX*        pFmt     = ctx->pFmt;

  HRESULT hr = pClient->Start();
  if (FAILED(hr)) { LOGERR("Start", hr); CoUninitialize(); return; }

  bool  isFloat = false;
  bool  isPCM   = false;
  WORD  sysCh   = pFmt->nChannels;
  WORD  sysBits = pFmt->wBitsPerSample;
  WORD  outCh   = ctx->outputChannels;

  if (pFmt->wFormatTag == WAVE_FORMAT_IEEE_FLOAT) {
    isFloat = true;
  } else if (pFmt->wFormatTag == WAVE_FORMAT_PCM) {
    isPCM = true;
  } else if (pFmt->wFormatTag == WAVE_FORMAT_EXTENSIBLE) {
    auto* ext = reinterpret_cast<WAVEFORMATEXTENSIBLE*>(pFmt);
    if (IsEqualGUID(ext->SubFormat, LOCAL_IEEE_FLOAT)) isFloat = true;
    else if (IsEqualGUID(ext->SubFormat, LOCAL_PCM))   isPCM   = true;
  }

  fprintf(stderr, "[app-capture] capture started pid=%lu fmt=%u ch=%u rate=%lu bits=%u\n",
          (unsigned long)ctx->pid, (unsigned)pFmt->wFormatTag,
          (unsigned)sysCh, (unsigned long)pFmt->nSamplesPerSec,
          (unsigned)sysBits);

  while (ctx->running.load()) {
    UINT32 packetFrames = 0;
    hr = pCapture->GetNextPacketSize(&packetFrames);
    if (FAILED(hr)) { LOGERR("GetNextPacketSize", hr); break; }

    while (packetFrames > 0 && ctx->running.load()) {
      BYTE*  pData     = nullptr;
      UINT32 numFrames = 0;
      DWORD  flags     = 0;

      hr = pCapture->GetBuffer(&pData, &numFrames, &flags, nullptr, nullptr);
      if (FAILED(hr)) { LOGERR("GetBuffer", hr); goto done; }

      auto* chunk = new ChunkData();
      chunk->samples.resize((size_t)numFrames * outCh);

      if (flags & AUDCLNT_BUFFERFLAGS_SILENT) {
        std::fill(chunk->samples.begin(), chunk->samples.end(), (int16_t)0);
      } else if (isFloat) {
        const float* src = reinterpret_cast<const float*>(pData);
        for (UINT32 f = 0; f < numFrames; f++) {
          for (WORD c = 0; c < outCh; c++) {
            WORD srcCh = (c < sysCh) ? c : (WORD)(sysCh - 1);
            chunk->samples[f * outCh + c] = f32ToI16(src[f * sysCh + srcCh]);
          }
        }
      } else if (isPCM && sysBits == 16) {
        const int16_t* src = reinterpret_cast<const int16_t*>(pData);
        for (UINT32 f = 0; f < numFrames; f++) {
          for (WORD c = 0; c < outCh; c++) {
            WORD srcCh = (c < sysCh) ? c : (WORD)(sysCh - 1);
            chunk->samples[f * outCh + c] = src[f * sysCh + srcCh];
          }
        }
      } else {
        std::fill(chunk->samples.begin(), chunk->samples.end(), (int16_t)0);
      }

      pCapture->ReleaseBuffer(numFrames);

      if (ctx->tsfn)
        napi_call_threadsafe_function(ctx->tsfn, chunk, napi_tsfn_nonblocking);
      else
        delete chunk;

      hr = pCapture->GetNextPacketSize(&packetFrames);
      if (FAILED(hr)) { LOGERR("GetNextPacketSize(inner)", hr); goto done; }
    }
    Sleep(10);
  }

done:
  pClient->Stop();
  CoUninitialize();
}

/* ── AppCaptureStream N-API class ─────────────────────────────────────── */
struct StreamWrapper {
  napi_ref    ref;
  CaptureCtx* ctx;
};

/* Release COM interfaces stored in ctx (called after the capture thread exits). */
static void ReleaseCtxInterfaces(CaptureCtx* ctx) {
  if (ctx->pClient)  { ctx->pClient->Release();        ctx->pClient  = nullptr; }
  if (ctx->pCapture) { ctx->pCapture->Release();       ctx->pCapture = nullptr; }
  if (ctx->pFmt)     { CoTaskMemFree(ctx->pFmt);       ctx->pFmt     = nullptr; }
}

static void StreamFinalize(napi_env /*env*/, void* data, void* /*hint*/) {
  auto* w = static_cast<StreamWrapper*>(data);
  if (w->ctx) {
    w->ctx->running.store(false);
    if (w->ctx->captureThread.joinable()) w->ctx->captureThread.join();
    if (w->ctx->tsfn) {
      napi_release_threadsafe_function(w->ctx->tsfn, napi_tsfn_abort);
      w->ctx->tsfn = nullptr;
    }
    ReleaseCtxInterfaces(w->ctx);
    delete w->ctx;
  }
  delete w;
}

/* start(dataCallback, outputChannels)
 *
 * Runs on the Node.js main thread, which is the only thread with a fully
 * initialised WinRT apartment (set up by Electron/Chromium).
 * ActivateAudioInterfaceAsync returns RO_E_ILLEGAL_METHOD_CALL from
 * background threads that lack this context, so we do the entire
 * activation + client init here and only hand off the polling loop to
 * the background thread. */
static napi_value StreamStart(napi_env env, napi_callback_info info) {
  napi_value thisVal;
  size_t     argc = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &argc, args, &thisVal, nullptr);

  StreamWrapper* w;
  napi_unwrap(env, thisVal, (void**)&w);
  if (!w || !w->ctx || w->ctx->running.load()) return nullptr;

  uint32_t outCh = 2;
  if (argc >= 2) napi_get_value_uint32(env, args[1], &outCh);
  if (outCh < 1) outCh = 1;
  if (outCh > 2) outCh = 2;
  w->ctx->outputChannels = (uint16_t)outCh;

  /* ── Activate process-loopback audio client ───────────────────────── */
  AUDIOCLIENT_ACTIVATION_PARAMS params = {};
  params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
  params.ProcessLoopbackParams.TargetProcessId   = w->ctx->pid;
  params.ProcessLoopbackParams.ProcessLoopbackMode =
      PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE;

  PROPVARIANT pv;
  PropVariantInit(&pv);
  pv.vt             = VT_BLOB;
  pv.blob.cbSize    = sizeof(params);
  pv.blob.pBlobData = reinterpret_cast<BYTE*>(&params);

  IActivateAudioInterfaceAsyncOperation* pOp = nullptr;
  auto* handler = new CompletionHandler();

  HRESULT hr = ActivateAudioInterfaceAsync(
      VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
      __uuidof(IAudioClient), &pv, handler, &pOp);
  if (FAILED(hr)) {
    LOGERR("ActivateAudioInterfaceAsync", hr);
    handler->Release();
    napi_throw_error(env, nullptr, "ActivateAudioInterfaceAsync failed");
    return nullptr;
  }

  /* CoWaitForMultipleObjects pumps COM/window messages so the completion
     callback can be dispatched back to this STA thread. */
  DWORD idx = 0;
  CoWaitForMultipleObjects(CWMO_DISPATCH_CALLS | CWMO_DISPATCH_WINDOW_MESSAGES,
                           5000, 1, &handler->hDone, &idx);
  /* ActivateCompleted already called Initialize and GetService on the MTA
     pool thread.  Check that everything succeeded before continuing. */
  if (FAILED(handler->hrActivate) || !handler->pClient) {
    LOGERR("ActivateCompleted (activation)", handler->hrActivate);
    handler->Release();
    if (pOp) pOp->Release();
    napi_throw_error(env, nullptr, "Audio activation failed");
    return nullptr;
  }
  if (FAILED(handler->hrInit) || !handler->pCapture || !handler->pFmt) {
    LOGERR("ActivateCompleted (init)", handler->hrInit);
    handler->Release();
    if (pOp) pOp->Release();
    napi_throw_error(env, nullptr, "IAudioClient::Initialize failed");
    return nullptr;
  }

  /* Transfer ownership of the COM interfaces from the handler to ctx. */
  w->ctx->pClient  = handler->pClient;  handler->pClient  = nullptr;
  w->ctx->pCapture = handler->pCapture; handler->pCapture = nullptr;
  w->ctx->pFmt     = handler->pFmt;     handler->pFmt     = nullptr;
  handler->Release();
  if (pOp) pOp->Release();

  /* ── Hand off polling to the background thread ────────────────────── */
  w->ctx->running.store(true);

  napi_value name;
  napi_create_string_utf8(env, "app-capture-data", NAPI_AUTO_LENGTH, &name);
  napi_create_threadsafe_function(
      env, args[0], nullptr, name, 0, 1,
      nullptr, nullptr, nullptr, TsfnCallback, &w->ctx->tsfn);

  w->ctx->captureThread = std::thread(CaptureLoop, w->ctx);
  return nullptr;
}

/* stop() */
static napi_value StreamStop(napi_env env, napi_callback_info info) {
  napi_value thisVal;
  napi_get_cb_info(env, info, nullptr, nullptr, &thisVal, nullptr);

  StreamWrapper* w;
  napi_unwrap(env, thisVal, (void**)&w);
  if (!w || !w->ctx || !w->ctx->running.load()) return nullptr;

  w->ctx->running.store(false);
  if (w->ctx->captureThread.joinable()) w->ctx->captureThread.join();

  if (w->ctx->tsfn) {
    napi_release_threadsafe_function(w->ctx->tsfn, napi_tsfn_release);
    w->ctx->tsfn = nullptr;
  }
  ReleaseCtxInterfaces(w->ctx);
  return nullptr;
}

/* constructor(pid) */
static napi_value StreamCtor(napi_env env, napi_callback_info info) {
  napi_value thisVal;
  size_t     argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, &thisVal, nullptr);

  uint32_t pid = 0;
  if (argc >= 1) napi_get_value_uint32(env, args[0], &pid);

  auto* ctx = new CaptureCtx();
  ctx->pid            = (DWORD)pid;
  ctx->outputChannels = 2;

  auto* w = new StreamWrapper{nullptr, ctx};
  napi_wrap(env, thisVal, w, StreamFinalize, nullptr, &w->ref);
  return thisVal;
}

/* ── Module init ───────────────────────────────────────────────────────── */
static napi_value ModuleInit(napi_env env, napi_value exports) {
  /* listAudioApps */
  napi_value fnList;
  napi_create_function(env, "listAudioApps", NAPI_AUTO_LENGTH,
                       ListAudioApps, nullptr, &fnList);
  napi_set_named_property(env, exports, "listAudioApps", fnList);

  /* AppCaptureStream class */
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
