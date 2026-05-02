/**
 * app_capture_stub.cpp
 *
 * No-op stub for non-Windows platforms.  The engine compiles and loads
 * successfully, but AppCaptureStream does nothing.
 */

#include "app_capture.h"

AppCaptureStream::AppCaptureStream(uint32_t pid) : pid_(pid) {}
AppCaptureStream::~AppCaptureStream() { stop(); }
void AppCaptureStream::start(DataCallback, int) {}
void AppCaptureStream::stop() {}
