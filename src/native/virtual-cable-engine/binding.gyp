{
  "targets": [
    {
      "target_name": "virtual_cable_engine",
      "sources": [
        "engine.cpp",
        "app_capture.cpp"
      ],
      "include_dirs": [
        "portaudio/include"
      ],
      "conditions": [
        ["OS=='win'", {
          "configurations": {
            "Release": {
              "msvs_settings": {
                "VCCLCompilerTool": {
                  "AdditionalOptions": ["/std:c++17"],
                  "RuntimeTypeInfo": "true",
                  "ExceptionHandling": 1
                }
              },
              "msbuild_settings": {
                "ClCompile": {
                  "LanguageStandard": "stdcpp17"
                }
              }
            }
          },
          "libraries": [
            "-l../portaudio/bin/portaudio_x64.lib",
            "-lole32", "-loleaut32", "-luuid",
            "-lwinmm", "-lksuser", "-lpsapi",
            "-lruntimeobject", "-lmmdevapi"
          ],
          "copies": [
            {
              "destination": "build/Release",
              "files": [
                "portaudio/bin/portaudio_x64.dll"
              ]
            }
          ],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "AdditionalOptions": ["/std:c++17"],
              "RuntimeTypeInfo": "true",
              "ExceptionHandling": 1
            }
          }
        }, {
          "sources!": ["app_capture.cpp"],
          "sources": ["app_capture_stub.cpp"]
        }]
      ]
    }
  ]
}
