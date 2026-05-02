fn main() {
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap();

    let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let engine_dir = manifest_dir.join("src/native/virtual-cable-engine");

    println!("cargo:rerun-if-changed={}", engine_dir.join("engine.cpp").display());
    println!("cargo:rerun-if-changed={}", engine_dir.join("engine.h").display());
    println!("cargo:rerun-if-changed={}", engine_dir.join("engine_c_api.cpp").display());
    println!("cargo:rerun-if-changed={}", engine_dir.join("engine_c_api.h").display());

    let mut build = cc::Build::new();
    build.cpp(true);
    
    if target_os == "windows" {
        build.flag("/std:c++17");
    } else {
        build.flag("-std=c++17");
    }

    build.file(engine_dir.join("engine.cpp"));
    build.file(engine_dir.join("engine_c_api.cpp"));

    if target_os == "windows" {
        // Windows specific libraries
        println!("cargo:rustc-link-lib=ole32");
        println!("cargo:rustc-link-lib=oleaut32");
        println!("cargo:rustc-link-lib=uuid");
        println!("cargo:rustc-link-lib=winmm");
        println!("cargo:rustc-link-lib=ksuser");
        println!("cargo:rustc-link-lib=mmdevapi");
    }

    build.include(engine_dir.join("portaudio/include"));
    build.compile("virtual_cable_engine");

    // Link portaudio_x64.lib
    let portaudio_path = engine_dir.join("portaudio/bin");
    let portaudio_path = portaudio_path.canonicalize()
        .expect("Failed to canonicalize portaudio path");

    println!("cargo:rustc-link-search=native={}", portaudio_path.display());
    println!("cargo:rustc-link-lib=portaudio_x64");
    
    if target_os == "windows" {
        // Use delay loading so the app can start even if the DLL is not next to the EXE.
        // We will set the DLL search path at runtime to point to the resources folder.
        println!("cargo:rustc-link-arg=/DELAYLOAD:portaudio_x64.dll");
        println!("cargo:rustc-link-lib=delayimp");
    }

    // Copy DLL to target directory for development
    let dll_path = portaudio_path.join("portaudio_x64.dll");
    if dll_path.exists() {
        let out_dir = std::env::var("OUT_DIR").unwrap();
        let dest_path = std::path::Path::new(&out_dir)
            .parent().unwrap()
            .parent().unwrap()
            .parent().unwrap()
            .join("portaudio_x64.dll");
        std::fs::copy(&dll_path, &dest_path).ok();
    }
    
    tauri_build::build()
}
