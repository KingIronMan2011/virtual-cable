{
  "targets": [
    {
      "target_name": "app-capture",
      "msvs_configuration_platform": "x64",
      "conditions": [
        ["OS=='win'", {
          "sources": ["appCapture.cc"],
          "libraries": ["-lole32", "-loleaut32", "-lmmdevapi", "-lruntimeobject"],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "AdditionalOptions": ["/std:c++17"],
              "RuntimeTypeInfo": "true",
              "ExceptionHandling": 1
            },
            "VCLinkerTool": {},
            "VCProjectTool": {
              "PlatformToolset": "v143"
            }
          }
        }, {
          "sources": ["appCaptureStub.cc"]
        }]
      ]
    }
  ]
}
