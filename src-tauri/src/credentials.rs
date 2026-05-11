//! OS-backed secure credential store for API keys.
//!
//! Uses the `keyring` crate to store secrets in the platform-native
//! credential manager (Windows Credential Manager, macOS Keychain,
//! Linux Secret Service).

const SERVICE_NAME: &str = "gravity-claw";

pub mod keys {
    pub const GEMINI_API_KEY: &str = "gemini_api_key";
    pub const KIMI_API_KEY: &str = "kimi_api_key";
}

fn create_entry(key_name: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE_NAME, key_name)
        .map_err(|e| format!("Failed to create keyring entry for {}: {}", key_name, e))
}

/// Store a credential in the OS keyring.
pub fn set(key_name: &str, value: &str) -> Result<(), String> {
    let entry = create_entry(key_name)?;
    entry
        .set_password(value)
        .map_err(|e| format!("Failed to store credential {}: {}", key_name, e))
}

/// Retrieve a credential from the OS keyring.
pub fn get(key_name: &str) -> Result<Option<String>, String> {
    let entry = create_entry(key_name)?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Error accessing credential {}: {}", key_name, e)),
    }
}

/// Delete a credential from the OS keyring (idempotent).
pub fn delete(key_name: &str) -> Result<(), String> {
    let entry = create_entry(key_name)?;
    match entry.delete_password() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Error deleting credential {}: {}", key_name, e)),
    }
}
