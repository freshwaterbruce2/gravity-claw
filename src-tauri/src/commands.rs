//! Tauri IPC Commands for Gravity-Claw
//!
//! Auth commands use the OS keyring (via `credentials` module) for secure
//! API key storage. Generic storage commands continue to use
//! tauri-plugin-store for non-sensitive key-value data.

use crate::credentials;
use serde_json::Value;
use tauri::{command, AppHandle};
use tauri_plugin_store::StoreExt;

const STORE_PATH: &str = "gravity-claw-state.json";
const MAX_KEY_LENGTH: usize = 8 * 1024; // 8KB
const MAX_VALUE_LENGTH: usize = 1024 * 1024; // 1MB

fn get_store(app: &AppHandle) -> Result<std::sync::Arc<tauri_plugin_store::Store<tauri::Wry>>, String> {
    app.store(STORE_PATH)
        .map_err(|e| format!("Failed to open store: {}", e))
}

fn validate_storage_key(key: &str) -> Result<(), String> {
    if key.len() > MAX_KEY_LENGTH {
        return Err(format!(
            "Storage key exceeds maximum length of {} bytes",
            MAX_KEY_LENGTH
        ));
    }
    Ok(())
}

fn validate_storage_value(value: &str) -> Result<(), String> {
    if value.len() > MAX_VALUE_LENGTH {
        return Err(format!(
            "Storage value exceeds maximum length of {} bytes",
            MAX_VALUE_LENGTH
        ));
    }
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Default)]
pub struct AuthSession {
    pub gemini_key: Option<String>,
    pub kimi_key: Option<String>,
}

/// Returns the current auth session (keys may be empty).
/// SECURITY NOTE: This returns plaintext API keys to the frontend. This is an
/// intentional architectural choice to allow the frontend to make direct API
/// calls. Keys are stored securely in the OS keyring at rest. Consider the
/// security implications of exposing keys to the renderer process.
#[command]
pub async fn auth_get_session(_app: AppHandle) -> Result<AuthSession, String> {
    let gemini_key = credentials::get(credentials::keys::GEMINI_API_KEY)?;
    let kimi_key = credentials::get(credentials::keys::KIMI_API_KEY)?;

    Ok(AuthSession {
        gemini_key,
        kimi_key,
    })
}

/// Stores the Gemini API key in the OS keyring.
#[command]
pub async fn auth_set_gemini_key(_app: AppHandle, api_key: String) -> Result<(), String> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        credentials::delete(credentials::keys::GEMINI_API_KEY)?;
    } else {
        credentials::set(credentials::keys::GEMINI_API_KEY, trimmed)?;
    }
    Ok(())
}

/// Stores the Kimi API key in the OS keyring.
#[command]
pub async fn auth_set_kimi_key(_app: AppHandle, api_key: String) -> Result<(), String> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        credentials::delete(credentials::keys::KIMI_API_KEY)?;
    } else {
        credentials::set(credentials::keys::KIMI_API_KEY, trimmed)?;
    }
    Ok(())
}

/// Clears both API keys from the OS keyring.
#[command]
pub async fn auth_clear_session(_app: AppHandle) -> Result<(), String> {
    credentials::delete(credentials::keys::GEMINI_API_KEY)?;
    credentials::delete(credentials::keys::KIMI_API_KEY)?;
    Ok(())
}

/// Retrieves a generic storage value by key.
#[command]
pub async fn storage_get_item(app: AppHandle, key: String) -> Result<Option<String>, String> {
    validate_storage_key(&key)?;
    let store = get_store(&app)?;
    Ok(store
        .get(&format!("storage.{}", key))
        .and_then(|v| v.as_str().map(|s| s.to_string())))
}

/// Stores a generic key-value pair.
#[command]
pub async fn storage_set_item(
    app: AppHandle,
    key: String,
    value: String,
) -> Result<(), String> {
    validate_storage_key(&key)?;
    validate_storage_value(&value)?;
    let store = get_store(&app)?;
    store.set(&format!("storage.{}", key), Value::String(value));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

/// Removes a generic storage value by key.
#[command]
pub async fn storage_remove_item(app: AppHandle, key: String) -> Result<(), String> {
    validate_storage_key(&key)?;
    let store = get_store(&app)?;
    store.delete(&format!("storage.{}", key));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

/// Returns the backend API base URL the frontend should use.
#[command]
pub async fn runtime_api_base(
    state: tauri::State<'_, crate::BackendState>,
) -> Result<String, String> {
    let status = state.status.lock().await;
    match *status {
        crate::BackendStatus::Ready(port) => Ok(format!("http://127.0.0.1:{}", port)),
        crate::BackendStatus::Starting => Err("Backend is still starting".to_string()),
        crate::BackendStatus::Failed(ref e) => Err(format!("Backend failed to start: {}", e)),
    }
}

/// Returns the current backend status for the frontend.
#[command]
pub async fn runtime_backend_status(
    state: tauri::State<'_, crate::BackendState>,
) -> Result<crate::BackendStatus, String> {
    Ok(state.status.lock().await.clone())
}
