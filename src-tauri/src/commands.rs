//! Tauri IPC Commands for Gravity-Claw
//!
//! Bridges frontend requests to tauri-plugin-store for persistent
//! auth session and generic key-value storage.

use serde_json::Value;
use tauri::{command, AppHandle, Manager};
use tauri_plugin_store::StoreExt;

const STORE_PATH: &str = "gravity-claw-state.json";

fn get_store(app: &AppHandle) -> Result<tauri_plugin_store::Store<tauri::Wry>, String> {
    app.store(STORE_PATH)
        .map_err(|e| format!("Failed to open store: {}", e))
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Default)]
pub struct AuthSession {
    pub gemini_key: Option<String>,
    pub kimi_key: Option<String>,
}

/// Returns the current auth session (keys may be empty).
#[command]
pub async fn auth_get_session(app: AppHandle) -> Result<AuthSession, String> {
    let store = get_store(&app)?;

    let gemini_key = store
        .get("auth.gemini_key")
        .and_then(|v| v.as_str().map(|s| s.to_string()));
    let kimi_key = store
        .get("auth.kimi_key")
        .and_then(|v| v.as_str().map(|s| s.to_string()));

    Ok(AuthSession {
        gemini_key,
        kimi_key,
    })
}

/// Stores the Gemini API key.
#[command]
pub async fn auth_set_gemini_key(app: AppHandle, api_key: String) -> Result<(), String> {
    let store = get_store(&app)?;
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        store.delete("auth.gemini_key");
    } else {
        store.set("auth.gemini_key", Value::String(trimmed.to_string()));
    }
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

/// Stores the Kimi API key.
#[command]
pub async fn auth_set_kimi_key(app: AppHandle, api_key: String) -> Result<(), String> {
    let store = get_store(&app)?;
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        store.delete("auth.kimi_key");
    } else {
        store.set("auth.kimi_key", Value::String(trimmed.to_string()));
    }
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

/// Clears both API keys.
#[command]
pub async fn auth_clear_session(app: AppHandle) -> Result<(), String> {
    let store = get_store(&app)?;
    store.delete("auth.gemini_key");
    store.delete("auth.kimi_key");
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

/// Retrieves a generic storage value by key.
#[command]
pub async fn storage_get_item(app: AppHandle, key: String) -> Result<Option<String>, String> {
    let store = get_store(&app)?;
    Ok(store
        .get(&format!("storage.{}", key))
        .and_then(|v| v.as_str().map(|s| s.to_string())))
}

/// Stores a generic key-value pair.
#[command]
pub async fn storage_set_item(app: AppHandle, key: String, value: String) -> Result<(), String> {
    let store = get_store(&app)?;
    store.set(
        &format!("storage.{}", key),
        Value::String(value),
    );
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

/// Removes a generic storage value by key.
#[command]
pub async fn storage_remove_item(app: AppHandle, key: String) -> Result<(), String> {
    let store = get_store(&app)?;
    store.delete(&format!("storage.{}", key));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

/// Returns the backend API base URL the frontend should use.
#[command]
pub async fn runtime_api_base(state: tauri::State<'_, crate::BackendState>) -> Result<String, String> {
    let port = state.port.lock().await;
    Ok(format!("http://127.0.0.1:{}", *port))
}
