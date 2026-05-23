# Changelog

All notable changes to Gravity Claw will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.2.0] - 2026-04-24

### Changed
- Migrated from Electron 40 to Tauri 2 (Rust-based desktop shell).
  - Replaced `electron` and `electron-builder` with `@tauri-apps/cli` and `@tauri-apps/api`.
  - Updated build scripts: `tauri:dev`, `tauri:build`, `build:desktop`.
  - Windows installer now produced via Tauri NSIS/MSI bundles in `src-tauri/target/release/bundle/`.

### Breaking
- Removed Electron-specific APIs and `main` entry point; app now bootstraps through Tauri.
- Config and runtime paths updated for Tauri resource resolution.

### Added
- Initial CHANGELOG
