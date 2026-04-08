{
  "targets": [
    {
      "target_name": "app-capture",
      "sources": ["appCapture.cc"],
      "msvs_configuration_platform": "x64",
      "conditions": [
        ["OS=='win'", {
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
        }]
      ]
    }
  ]
}
