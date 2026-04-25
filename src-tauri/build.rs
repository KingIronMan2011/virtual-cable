fn main() {
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap();

    let mut build = cc::Build::new();
    build.cpp(true);
    build.flag_if_supported("-std=c++17");

    build.file("../src/native/virtual-cable-engine/engine.cpp");
    build.file("../src/native/virtual-cable-engine/engine_c_api.cpp");

    if target_os == "windows" {
        build.file("../src/native/virtual-cable-engine/app_capture.cpp");
        // Windows specific libraries
        println!("cargo:rustc-link-lib=ole32");
        println!("cargo:rustc-link-lib=oleaut32");
        println!("cargo:rustc-link-lib=uuid");
        println!("cargo:rustc-link-lib=winmm");
        println!("cargo:rustc-link-lib=ksuser");
        println!("cargo:rustc-link-lib=psapi");
        println!("cargo:rustc-link-lib=runtimeobject");
        println!("cargo:rustc-link-lib=mmdevapi");
    } else {
        build.file("../src/native/virtual-cable-engine/app_capture_stub.cpp");
    }

    build.include("../src/native/virtual-cable-engine/portaudio/include");
    build.compile("virtual_cable_engine");

    // Link portaudio_x64.lib
    let portaudio_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../src/native/virtual-cable-engine/portaudio/bin")
        .canonicalize()
        .expect("Failed to canonicalize portaudio path");

    println!("cargo:rustc-link-search=native={}", portaudio_path.display());
    println!("cargo:rustc-link-lib=portaudio_x64");
    
    tauri_build::build()
}
