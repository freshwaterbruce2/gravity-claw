//! Gravity-Claw — Tauri Desktop Backend
//!
//! Replaces the Electron main process. Responsibilities:
//!   1. Spawn the Node.js backend server (Hono API).
//!   2. Wait for the backend to expose a healthy port.
//!   3. Provide IPC commands for auth session and key-value storage.
//!   4. Clean up the backend process on app exit.

mod commands;
mod credentials;

use commands::{
    auth_clear_session, auth_get_session, auth_set_gemini_key, auth_set_kimi_key, runtime_api_base,
    runtime_backend_status, storage_get_item, storage_remove_item, storage_set_item,
};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{Manager, RunEvent};
use tauri_plugin_updater::UpdaterExt;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration};

/// Shared application state.
pub struct BackendState {
    /// Handle to the spawned Node.js backend process (None if externally managed).
    pub process: Mutex<Option<Child>>,
    /// The active backend status.
    pub status: Mutex<BackendStatus>,
}

#[derive(Clone, serde::Serialize)]
pub enum BackendStatus {
    Starting,
    Ready(u16),
    Failed(String),
}

/// Default backend port used by the Gravity-Claw Hono server.
const DEFAULT_BACKEND_PORT: u16 = 5187;
/// How long to wait for the backend to become reachable (ms).
const BACKEND_START_TIMEOUT_MS: u64 = 30_000;
/// Poll interval when waiting for backend port (ms).
const BACKEND_POLL_INTERVAL_MS: u64 = 300;

/// Converts a path to a String, logging a warning if the conversion is lossy.
fn path_to_string(path: &std::path::Path) -> String {
    match path.to_str() {
        Some(s) => s.to_string(),
        None => {
            let lossy = path.to_string_lossy().to_string();
            eprintln!(
                "[Gravity-Claw] Warning: path contains invalid Unicode and was lossily converted: {}",
                lossy
            );
            lossy
        }
    }
}

/// Attempts to find the `node.exe` executable on Windows.
/// Falls back to "node" if no specific binary is found.
fn resolve_node_exe() -> PathBuf {
    // 1. Environment override
    if let Ok(path) = std::env::var("GRAVITY_CLAW_NODE_PATH") {
        let p = PathBuf::from(path.trim());
        if p.is_file() {
            return p;
        }
    }

    // 2. npm_node_execpath
    if let Ok(path) = std::env::var("npm_node_execpath") {
        let p = PathBuf::from(path.trim());
        if p.is_file() {
            return p;
        }
    }

    // 3. Try `where node.exe` on Windows
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = std::process::Command::new("where.exe")
            .arg("node.exe")
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if let Some(first) = stdout.lines().next() {
                    let p = PathBuf::from(first.trim());
                    if p.is_file() {
                        return p;
                    }
                }
            }
        }
    }

    // 4. Common Windows install locations
    #[cfg(target_os = "windows")]
    {
        let candidates = [
            r"C:\Program Files\nodejs\node.exe",
            r"C:\Program Files (x86)\nodejs\node.exe",
        ];
        for c in &candidates {
            let p = PathBuf::from(c);
            if p.is_file() {
                return p;
            }
        }
    }

    PathBuf::from("node")
}

/// Reads the `.server-port` file if it exists.
/// Resolves the project root directory, handling the case where the binary
/// is executed from `src-tauri` (as happens with `cargo run`).
fn resolve_app_root() -> PathBuf {
    let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    // When `cargo run` executes from src-tauri, cwd is src-tauri.
    if cwd.file_name().map(|n| n == "src-tauri").unwrap_or(false) {
        return cwd.parent().unwrap_or(&cwd).to_path_buf();
    }
    cwd
}

async fn read_port_file(app_root: &std::path::Path) -> Option<u16> {
    let path = app_root.join(".server-port");
    let contents = tokio::fs::read_to_string(path).await.ok()?;
    let trimmed = contents.trim();
    trimmed.parse::<u16>().ok()
}

/// Attempts a TCP connection to localhost:port.
async fn is_port_reachable(port: u16) -> bool {
    (tokio::net::TcpStream::connect(("127.0.0.1", port)).await).is_ok()
}

/// Confirms the backend is ready by checking TCP reachability followed by
/// a lightweight HTTP probe on `/api/health` via raw TcpStream.
async fn is_backend_healthy(port: u16) -> bool {
    if !is_port_reachable(port).await {
        return false;
    }

    // Send a minimal HTTP GET and check for a 200 OK response.
    match tokio::net::TcpStream::connect(("127.0.0.1", port)).await {
        Ok(mut stream) => {
            let request = format!(
                "GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nConnection: close\r\n\r\n",
                port
            );
            if tokio::io::AsyncWriteExt::write_all(&mut stream, request.as_bytes())
                .await
                .is_err()
            {
                return false;
            }

            let mut buf = [0u8; 4096];
            match tokio::io::AsyncReadExt::read(&mut stream, &mut buf).await {
                Ok(n) if n > 0 => {
                    let response = String::from_utf8_lossy(&buf[..n]);
                    response.contains("200 OK") || response.contains("HTTP/1.1 200")
                }
                _ => false,
            }
        }
        Err(_) => false,
    }
}

/// Looks for an already-running backend by checking the port file and
/// doing a quick health probe.
async fn find_healthy_backend_port(app_root: &std::path::Path) -> Option<u16> {
    let file_port = read_port_file(app_root).await;
    let candidates: Vec<u16> = file_port
        .into_iter()
        .chain(std::iter::once(DEFAULT_BACKEND_PORT))
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    for port in candidates {
        if is_backend_healthy(port).await {
            return Some(port);
        }
    }
    None
}

/// Spawns the Node.js backend server and waits for it to become healthy.
async fn ensure_backend_server(app_root: &std::path::Path) -> Result<(Option<Child>, u16), String> {
    // If a backend is already running, reuse it.
    if let Some(port) = find_healthy_backend_port(app_root).await {
        // No process to manage — we assume an external dev server is running.
        return Ok((None, port));
    }

    let node_exe = resolve_node_exe();

    // Determine server entry point.
    // In dev:  server/src/index.ts (requires tsx)
    // In prod: server/dist/bundle.mjs (pre-bundled)
    let server_src = app_root.join("server").join("src").join("index.ts");
    let server_bundle = app_root.join("server").join("dist").join("bundle.mjs");
    let (server_entry, use_tsx) = if cfg!(debug_assertions) && server_src.exists() {
        // Debug build: prefer TypeScript source with tsx
        (server_src, true)
    } else if server_bundle.exists() {
        // Release build: always prefer pre-bundled output
        (server_bundle, false)
    } else if server_src.exists() {
        // Fallback: try TypeScript source even in release
        (server_src, true)
    } else {
        return Err("No server entry point found. Run `pnpm run build:server` first.".to_string());
    };

    let spawn_args: Vec<String> = if use_tsx {
        let workspace_root = app_root.parent().and_then(|p| p.parent());
        let tsx_cli = workspace_root
            .map(|r| {
                r.join("node_modules")
                    .join("tsx")
                    .join("dist")
                    .join("cli.mjs")
            })
            .filter(|p| p.exists());

        if let Some(tsx) = tsx_cli {
            vec![path_to_string(&tsx), path_to_string(&server_entry)]
        } else if cfg!(debug_assertions) {
            return Err("tsx CLI not found. Install it with `pnpm install tsx`.".to_string());
        } else {
            vec![path_to_string(&server_entry)]
        }
    } else {
        vec![path_to_string(&server_entry)]
    };

    let mut child = Command::new(&node_exe)
        .args(&spawn_args)
        .current_dir(app_root)
        .env("GRAVITY_CLAW_PORT", DEFAULT_BACKEND_PORT.to_string())
        .env(
            "GRAVITY_CLAW_CONFIG_PATH",
            path_to_string(&app_root.join(".gravity-claw.config.json")),
        )
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn backend: {}", e))?;

    // Capture last lines of output for diagnostics.
    let output_buf = Arc::new(Mutex::new(String::new()));

    if let Some(stdout) = child.stdout.take() {
        let buf = output_buf.clone();
        tokio::spawn(async move {
            use tokio::io::AsyncBufReadExt;
            let reader = tokio::io::BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let mut b = buf.lock().await;
                b.push_str(&line);
                b.push('\n');
                if b.len() > 6_000 {
                    let keep_from = b.len() - 6_000;
                    *b = b.split_off(keep_from);
                }
            }
        });
    }

    if let Some(stderr) = child.stderr.take() {
        let buf = output_buf.clone();
        tokio::spawn(async move {
            use tokio::io::AsyncBufReadExt;
            let reader = tokio::io::BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let mut b = buf.lock().await;
                b.push_str(&line);
                b.push('\n');
                if b.len() > 6_000 {
                    let keep_from = b.len() - 6_000;
                    *b = b.split_off(keep_from);
                }
            }
        });
    }

    // Wait for the backend port to become reachable.
    let start = std::time::Instant::now();
    let mut active_port = DEFAULT_BACKEND_PORT;

    loop {
        let file_port = read_port_file(app_root).await;
        let candidates: Vec<u16> = file_port
            .into_iter()
            .chain(std::iter::once(DEFAULT_BACKEND_PORT))
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect();

        for port in candidates {
            if is_port_reachable(port).await {
                active_port = port;
                break;
            }
        }

        // Verify health endpoint before declaring success.
        if is_backend_healthy(active_port).await {
            break;
        }

        // Check if process exited early.
        if let Ok(Some(status)) = child.try_wait() {
            let details = if let Some(code) = status.code() {
                format!("exit code {}", code)
            } else {
                "killed by signal".to_string()
            };
            let mut err = format!("Backend exited before startup completed ({}).", details);
            let output = output_buf.lock().await;
            if !output.is_empty() {
                err.push_str("\n\nBackend output:\n");
                err.push_str(&output);
            }
            return Err(err);
        }

        if start.elapsed().as_millis() as u64 >= BACKEND_START_TIMEOUT_MS {
            return Err(format!(
                "Gravity-Claw backend did not become healthy on port {} within {}ms.",
                active_port, BACKEND_START_TIMEOUT_MS
            ));
        }

        sleep(Duration::from_millis(BACKEND_POLL_INTERVAL_MS)).await;
    }

    Ok((Some(child), active_port))
}

pub fn run() {
    tauri::Builder::default()
        .manage(BackendState {
            process: Mutex::new(None),
            status: Mutex::new(BackendStatus::Starting),
        })
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let app_root = resolve_app_root();

            // Spawn backend in a non-blocking task so the window can open immediately.
            tauri::async_runtime::spawn(async move {
                match ensure_backend_server(&app_root).await {
                    Ok((child, port)) => {
                        let state = handle.state::<BackendState>();
                        *state.process.lock().await = child;
                        *state.status.lock().await = BackendStatus::Ready(port);
                        eprintln!("[Gravity-Claw] Backend ready on port {}", port);
                    }
                    Err(e) => {
                        eprintln!("[Gravity-Claw] Failed to start backend: {}", e);
                        let state = handle.state::<BackendState>();
                        *state.status.lock().await = BackendStatus::Failed(e);
                    }
                }
            });

            // Check for app updates in the background on startup.
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match app_handle.updater_builder().build() {
                    Ok(updater) => {
                        if let Ok(Some(update)) = updater.check().await {
                            eprintln!(
                                "[Gravity-Claw] Update available: {} -> {}",
                                update.current_version, update.version
                            );
                        }
                    }
                    Err(e) => {
                        eprintln!("[Gravity-Claw] Updater init failed: {}", e);
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            auth_get_session,
            auth_set_gemini_key,
            auth_set_kimi_key,
            auth_clear_session,
            storage_get_item,
            storage_set_item,
            storage_remove_item,
            runtime_api_base,
            runtime_backend_status,
        ])
        .build(tauri::generate_context!())
        .expect("error building Gravity-Claw Tauri application")
        .run(|_app_handle, event| {
            if let RunEvent::Exit = event {
                // Attempt to kill the backend child process on exit.
                let state = _app_handle.state::<BackendState>();
                tauri::async_runtime::block_on(async {
                    if let Some(mut child) = state.process.lock().await.take() {
                        let _ = child.kill().await;
                        let _ = child.wait().await;
                    }
                });
            }
        });
}
