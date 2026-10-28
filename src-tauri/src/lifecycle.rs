//! The main window's and the tray's lifecycle decisions, apart from the Tauri wiring in
//! `main.rs` so that they are measured and mutation-tested.

use tauri::tray::{MouseButton, MouseButtonState};

/// The id of the menu-bar (tray) icon.
pub const TRAY_ID: &str = "main";
/// The label of the main window, as declared in `tauri.conf.json`.
pub const WINDOW_LABEL: &str = "main";
/// The tray menu item that opens the main window.
pub const MENU_OPEN: &str = "open";
/// The tray menu item that quits the app.
pub const MENU_QUIT: &str = "quit";
/// The exit code Quit passes to `AppHandle::exit`; an exit with a code is let through.
pub const QUIT_EXIT_CODE: i32 = 0;

/// What closing a window does.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CloseAction {
    /// Prevent the default close and destroy the webview; the tray keeps running.
    Destroy,
    /// Let the window close as usual.
    Default,
}

/// Closing the main window destroys its webview; other windows close as usual.
#[must_use]
pub fn close_action(label: &str) -> CloseAction {
    if label == WINDOW_LABEL {
        CloseAction::Destroy
    } else {
        CloseAction::Default
    }
}

/// An exit request without a code (the last window closed) is prevented, so the tray stays.
/// An exit with a code (Quit from the tray) is let through.
#[must_use]
pub const fn should_prevent_exit(code: Option<i32>) -> bool {
    code.is_none()
}

/// What a tray menu item does.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MenuAction {
    /// Show the main window, building it again if it was closed.
    OpenWindow,
    /// Exit the app with `QUIT_EXIT_CODE`.
    Quit,
}

/// The action for a tray menu item id, if it is one of ours.
#[must_use]
pub fn menu_action(id: &str) -> Option<MenuAction> {
    match id {
        MENU_OPEN => Some(MenuAction::OpenWindow),
        MENU_QUIT => Some(MenuAction::Quit),
        _ => None,
    }
}

/// A left-button release on the tray icon opens the main window.
#[must_use]
pub fn tray_click_opens(button: MouseButton, state: MouseButtonState) -> bool {
    matches!((button, state), (MouseButton::Left, MouseButtonState::Up))
}

#[cfg(test)]
mod tests {
    use super::{
        CloseAction, MENU_OPEN, MENU_QUIT, MenuAction, QUIT_EXIT_CODE, WINDOW_LABEL, close_action,
        menu_action, should_prevent_exit, tray_click_opens,
    };
    use tauri::tray::{MouseButton, MouseButtonState};

    #[test]
    fn closing_the_main_window_destroys_it() {
        assert_eq!(close_action(WINDOW_LABEL), CloseAction::Destroy);
    }

    #[test]
    fn closing_another_window_is_left_alone() {
        assert_eq!(close_action("settings"), CloseAction::Default);
    }

    #[test]
    fn an_exit_without_a_code_is_prevented_so_the_tray_stays() {
        assert!(should_prevent_exit(None));
    }

    #[test]
    fn quit_from_the_tray_exits() {
        assert!(!should_prevent_exit(Some(QUIT_EXIT_CODE)));
        assert!(!should_prevent_exit(Some(1)));
    }

    #[test]
    fn tray_menu_items_map_to_actions() {
        assert_eq!(menu_action(MENU_OPEN), Some(MenuAction::OpenWindow));
        assert_eq!(menu_action(MENU_QUIT), Some(MenuAction::Quit));
        assert_eq!(menu_action("something-else"), None);
    }

    #[test]
    fn a_left_click_release_on_the_tray_opens_the_window() {
        assert!(tray_click_opens(MouseButton::Left, MouseButtonState::Up));
    }

    #[test]
    fn other_tray_clicks_do_not_open_the_window() {
        assert!(!tray_click_opens(MouseButton::Left, MouseButtonState::Down));
        assert!(!tray_click_opens(MouseButton::Right, MouseButtonState::Up));
        assert!(!tray_click_opens(MouseButton::Middle, MouseButtonState::Up));
    }
}
