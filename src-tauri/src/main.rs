//! crewkit: a menu-bar front end for crewkit and its crews.
//!
//! This file is the Tauri entry point and event-loop glue only: the tray, the
//! main window's lifecycle and the run loop. Logic that can be tested lives in
//! its own module.

// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::menu::{Menu, MenuEvent, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{
    App, AppHandle, Manager as _, RunEvent, Runtime, WebviewWindowBuilder, Window, WindowEvent,
};

/// The id of the menu-bar (tray) icon.
const TRAY_ID: &str = "main";
/// The label of the main window, as declared in `tauri.conf.json`.
const WINDOW_LABEL: &str = "main";
const MENU_OPEN: &str = "open";
const MENU_QUIT: &str = "quit";

fn main() -> tauri::Result<()> {
    let app = tauri::Builder::default()
        .setup(|app| Ok(setup(app)?))
        .on_window_event(on_window_event)
        .build(tauri::generate_context!())?;
    app.run(|_app, event| {
        // Closing the last window must not quit: the tray keeps running.
        // Quit from the tray menu exits with a code and is let through.
        if let RunEvent::ExitRequested {
            code: None, api, ..
        } = event
        {
            api.prevent_exit();
        }
    });
    Ok(())
}

/// Makes the app a menu-bar app and builds its tray icon.
fn setup<R: Runtime>(app: &mut App<R>) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Accessory);

    let open = MenuItem::with_id(app, MENU_OPEN, "Open crewkit", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, MENU_QUIT, "Quit crewkit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;

    let mut tray = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("crewkit")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| on_menu_event(app, &event))
        .on_tray_icon_event(|tray, event| on_tray_icon_event(tray, &event));
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

fn on_menu_event<R: Runtime>(app: &AppHandle<R>, event: &MenuEvent) {
    match event.id().as_ref() {
        MENU_OPEN => open_main_window(app),
        MENU_QUIT => app.exit(0),
        _ => {}
    }
}

fn on_tray_icon_event<R: Runtime>(tray: &TrayIcon<R>, event: &TrayIconEvent) {
    if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
    } = *event
    {
        open_main_window(tray.app_handle());
    }
}

/// Closing the main window destroys its webview; the tray stays.
fn on_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event
        && window.label() == WINDOW_LABEL
    {
        api.prevent_close();
        // A failed destroy leaves the window open, which the person can close again.
        let _ = window.destroy();
    }
}

/// Shows the main window, building it again if it was closed.
fn open_main_window<R: Runtime>(app: &AppHandle<R>) {
    // On failure there is nothing to recover: the tray stays and the next click retries.
    let _ = show_main_window(app);
}

fn show_main_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let window = if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        window
    } else {
        let config = app
            .config()
            .app
            .windows
            .iter()
            .find(|window| window.label == WINDOW_LABEL)
            .ok_or(tauri::Error::WindowNotFound)?;
        WebviewWindowBuilder::from_config(app, config)?.build()?
    };
    window.show()?;
    window.set_focus()
}

#[cfg(test)]
mod tests {
    use super::WINDOW_LABEL;

    fn config() -> serde_json::Value {
        serde_json::from_str(include_str!("../tauri.conf.json")).unwrap()
    }

    #[test]
    fn app_identifier_is_stable() {
        let conf = config();
        assert_eq!(conf["identifier"], "dev.explodedviews.crewkit");
        assert_eq!(conf["productName"], "crewkit");
    }

    #[test]
    fn main_window_is_not_shown_at_launch() {
        let conf = config();
        let windows = conf["app"]["windows"].as_array().unwrap();
        assert_eq!(windows.len(), 1);
        let main = &windows[0];
        assert_eq!(main["label"], WINDOW_LABEL);
        assert_eq!(main["visible"], false);
        assert_eq!(main["create"], false);
    }
}
