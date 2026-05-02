/**
 * app_capture.cpp
 *
 * Per-process audio capture using the Windows 10 2004+ WASAPI
 * Process Loopback API.
 */

#ifdef _WIN32

#define UNICODE
#define _UNICODE
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX

#include "app_capture.h"

#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <audiopolicy.h>
#include <psapi.h>
#include <ole2.h>
#include <roapi.h>

#include <cstdio>
#include <cstring>
#include <cmath>
#include <algorithm>
#include <mutex>

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

#define LOGERR(msg, hr) \
  fprintf(stderr, "[app-capture] ERROR %s: hr=0x%08lX\n", (msg), (unsigned long)(hr))

/* KSDATAFORMAT_SUBTYPE_IEEE_FLOAT / PCM */
static const GUID LOCAL_IEEE_FLOAT = {
  0x00000003, 0x0000, 0x0010,
  {0x80, 0x00, 0x00, 0xAA, 0x00, 0x38, 0x9B, 0x71}
};
static const GUID LOCAL_PCM = {
  0x00000001, 0x0000, 0x0010,
  {0x80, 0x00, 0x00, 0xAA, 0x00, 0x38, 0x9B, 0x71}
};

/* ──────────────────────────────────────────────────────────────────────────
   Helper: wstring → UTF-8 std::string
─────────────────────────────────────────────────────────────────────────── */
static std::string WideToUtf8(const std::wstring& ws) {
  if (ws.empty()) return {};
  int n = WideCharToMultiByte(CP_UTF8, 0, ws.c_str(), -1, nullptr, 0, nullptr, nullptr);
  std::string s(n > 0 ? n - 1 : 0, '\0');
  if (n > 0) WideCharToMultiByte(CP_UTF8, 0, ws.c_str(), -1, &s[0], n, nullptr, nullptr);
  return s;
}

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
   COM completion handler — activates the audio client on the MTA callback
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

    if (SUCCEEDED(hrActivate) && pClient) {
      hrInit = E_FAIL;

      /* Step 1: try the default render device's exact mix format */
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
          hrInit = pClient->Initialize(AUDCLNT_SHAREMODE_SHARED,
                                       AUDCLNT_STREAMFLAGS_LOOPBACK,
                                       200 * 10000, 0, pMix, nullptr);
          if (SUCCEEDED(hrInit)) {
            size_t fmtBytes = sizeof(WAVEFORMATEX) + pMix->cbSize;
            pFmt = static_cast<WAVEFORMATEX*>(CoTaskMemAlloc(fmtBytes));
            if (pFmt) memcpy(pFmt, pMix, fmtBytes);
          }
          CoTaskMemFree(pMix);
        }

        if (pRC)   pRC->Release();
        if (pDev)  pDev->Release();
        if (pEnum) pEnum->Release();
      }

      /* Step 2: fallback to stereo formats */
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
        riid == __uuidof(IAgileObject) ||
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
   AppCaptureStream — COM state
─────────────────────────────────────────────────────────────────────────── */
struct AppCaptureStream::ComState {
  IAudioClient*        pClient  = nullptr;
  IAudioCaptureClient* pCapture = nullptr;
  WAVEFORMATEX*        pFmt     = nullptr;

  ~ComState() {
    if (pCapture) pCapture->Release();
    if (pClient)  pClient->Release();
    if (pFmt)     CoTaskMemFree(pFmt);
  }
};

/* ──────────────────────────────────────────────────────────────────────────
   Capture loop — runs on a dedicated background thread
─────────────────────────────────────────────────────────────────────────── */
static void CaptureLoop(AppCaptureStream::ComState* com,
                         AppCaptureStream::DataCallback callback,
                         int outCh,
                         std::atomic<bool>& running) {
  CoInitializeEx(nullptr, COINIT_MULTITHREADED);

  IAudioClient*        pClient  = com->pClient;
  IAudioCaptureClient* pCapture = com->pCapture;
  WAVEFORMATEX*        pFmt     = com->pFmt;

  HRESULT hr = pClient->Start();
  if (FAILED(hr)) { LOGERR("Start", hr); CoUninitialize(); return; }

  bool  isFloat = false;
  bool  isPCM   = false;
  WORD  sysCh   = pFmt->nChannels;
  WORD  sysBits = pFmt->wBitsPerSample;

  if (pFmt->wFormatTag == WAVE_FORMAT_IEEE_FLOAT) {
    isFloat = true;
  } else if (pFmt->wFormatTag == WAVE_FORMAT_PCM) {
    isPCM = true;
  } else if (pFmt->wFormatTag == WAVE_FORMAT_EXTENSIBLE) {
    auto* ext = reinterpret_cast<WAVEFORMATEXTENSIBLE*>(pFmt);
    if (IsEqualGUID(ext->SubFormat, LOCAL_IEEE_FLOAT)) isFloat = true;
    else if (IsEqualGUID(ext->SubFormat, LOCAL_PCM))   isPCM   = true;
  }

  fprintf(stderr, "[app-capture] capture started pid fmt=%u ch=%u rate=%lu bits=%u\n",
          (unsigned)pFmt->wFormatTag, (unsigned)sysCh,
          (unsigned long)pFmt->nSamplesPerSec, (unsigned)sysBits);

  std::vector<int16_t> chunkBuf;

  while (running.load()) {
    UINT32 packetFrames = 0;
    hr = pCapture->GetNextPacketSize(&packetFrames);
    if (FAILED(hr)) { LOGERR("GetNextPacketSize", hr); break; }

    while (packetFrames > 0 && running.load()) {
      BYTE*  pData     = nullptr;
      UINT32 numFrames = 0;
      DWORD  flags     = 0;

      hr = pCapture->GetBuffer(&pData, &numFrames, &flags, nullptr, nullptr);
      if (FAILED(hr)) { LOGERR("GetBuffer", hr); goto done; }

      chunkBuf.resize((size_t)numFrames * outCh);

      if (flags & AUDCLNT_BUFFERFLAGS_SILENT) {
        std::fill(chunkBuf.begin(), chunkBuf.end(), (int16_t)0);
      } else if (isFloat) {
        const float* src = reinterpret_cast<const float*>(pData);
        for (UINT32 f = 0; f < numFrames; f++) {
          if (outCh == 1 && sysCh >= 2) {
            float mixed = (src[f * sysCh + 0] + src[f * sysCh + 1]) * 0.5f;
            chunkBuf[f] = f32ToI16(mixed);
          } else {
            for (int c = 0; c < outCh; c++) {
              WORD srcCh = (c < sysCh) ? c : (WORD)(sysCh - 1);
              chunkBuf[f * outCh + c] = f32ToI16(src[f * sysCh + srcCh]);
            }
          }
        }
      } else if (isPCM && sysBits == 16) {
        const int16_t* src = reinterpret_cast<const int16_t*>(pData);
        for (UINT32 f = 0; f < numFrames; f++) {
          if (outCh == 1 && sysCh >= 2) {
            int32_t mixed = ((int32_t)src[f * sysCh + 0] + (int32_t)src[f * sysCh + 1]) >> 1;
            chunkBuf[f] = (int16_t)mixed;
          } else {
            for (int c = 0; c < outCh; c++) {
              WORD srcCh = (c < sysCh) ? c : (WORD)(sysCh - 1);
              chunkBuf[f * outCh + c] = src[f * sysCh + srcCh];
            }
          }
        }
      } else {
        std::fill(chunkBuf.begin(), chunkBuf.end(), (int16_t)0);
      }

      pCapture->ReleaseBuffer(numFrames);

      if (callback) {
        callback(chunkBuf.data(), numFrames, outCh);
      }

      hr = pCapture->GetNextPacketSize(&packetFrames);
      if (FAILED(hr)) { LOGERR("GetNextPacketSize(inner)", hr); goto done; }
    }
    Sleep(10);
  }

done:
  pClient->Stop();
  CoUninitialize();
}

/* ──────────────────────────────────────────────────────────────────────────
   AppCaptureStream implementation
─────────────────────────────────────────────────────────────────────────── */
AppCaptureStream::AppCaptureStream(uint32_t pid)
    : pid_(pid) {}

AppCaptureStream::~AppCaptureStream() {
  stop();
}

void AppCaptureStream::start(DataCallback callback, int outputChannels) {
  if (running_.load()) return;

  outputChannels_ = std::max(1, std::min(2, outputChannels));
  callback_ = std::move(callback);

  /* Activate process-loopback audio client on the caller thread. */
  AUDIOCLIENT_ACTIVATION_PARAMS params = {};
  params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
  params.ProcessLoopbackParams.TargetProcessId   = (DWORD)pid_;
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
    return;
  }

  DWORD idx = 0;
  CoWaitForMultipleObjects(CWMO_DISPATCH_CALLS | CWMO_DISPATCH_WINDOW_MESSAGES,
                           5000, 1, &handler->hDone, &idx);

  if (FAILED(handler->hrActivate) || !handler->pClient ||
      FAILED(handler->hrInit) || !handler->pCapture || !handler->pFmt) {
    LOGERR("ActivateCompleted", handler->hrActivate);
    handler->Release();
    if (pOp) pOp->Release();
    return;
  }

  /* Transfer ownership of COM interfaces */
  com_ = new ComState();
  com_->pClient  = handler->pClient;  handler->pClient  = nullptr;
  com_->pCapture = handler->pCapture; handler->pCapture = nullptr;
  com_->pFmt     = handler->pFmt;     handler->pFmt     = nullptr;
  handler->Release();
  if (pOp) pOp->Release();

  /* Launch capture thread */
  running_.store(true);
  captureThread_ = std::thread(CaptureLoop, com_, callback_,
                                outputChannels_, std::ref(running_));
}

void AppCaptureStream::stop() {
  if (!running_.load()) return;
  running_.store(false);
  if (captureThread_.joinable()) captureThread_.join();
  delete com_;
  com_ = nullptr;
}

#endif /* _WIN32 */
