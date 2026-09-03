#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(debug_assertions)]
    if std::env::args().any(|argument| argument == "--export-bindings") {
        basis_lib::export_typescript_bindings().expect("could not export TypeScript bindings");
        return;
    }
    basis_lib::run();
}
