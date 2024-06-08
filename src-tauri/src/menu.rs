use tauri::{AboutMetadata, CustomMenuItem, Menu, MenuItem, Submenu};

pub fn menu_bar() -> Menu {
    let app_name = "Rocket";
    let mut menu = Menu::new();
    #[cfg(target_os = "macos")]
    {
        menu = menu.add_submenu(Submenu::new(
            app_name,
            Menu::new()
                .add_native_item(MenuItem::About(
                    app_name.to_string(),
                    AboutMetadata::default(),
                ))
                .add_native_item(MenuItem::Separator)
                .add_native_item(MenuItem::Hide)
                .add_native_item(MenuItem::HideOthers)
                .add_native_item(MenuItem::ShowAll)
                .add_native_item(MenuItem::Separator)
                .add_native_item(MenuItem::Quit),
        ));
    }

    let mut file_menu = Menu::new();
    file_menu = file_menu
        .add_item(CustomMenuItem::new("new_file".to_string(), "New File"))
        .add_item(CustomMenuItem::new("new_folder".to_string(), "New Folder"))
        .add_native_item(MenuItem::Separator)
        .add_item(CustomMenuItem::new("open".to_string(), "Open Folder"))
        .add_native_item(MenuItem::Separator)
        .add_item(CustomMenuItem::new("save".to_string(), "Save").accelerator("Command+S"))
        .add_item(
            CustomMenuItem::new("auto_save".to_string(), "Auto Save")
                .selected()
                .disabled(),
        )
        .add_native_item(MenuItem::Separator)
        .add_native_item(MenuItem::CloseWindow);

    #[cfg(not(target_os = "macos"))]
    {
        file_menu = file_menu.add_native_item(MenuItem::Quit);
    }

    menu = menu.add_submenu(Submenu::new("File", file_menu));

    #[cfg(not(target_os = "linux"))]
    let mut edit_menu = Menu::new();
    #[cfg(target_os = "macos")]
    {
        edit_menu = edit_menu
            .add_native_item(MenuItem::Undo)
            .add_native_item(MenuItem::Redo)
            .add_native_item(MenuItem::Separator);
    }
    #[cfg(not(target_os = "linux"))]
    {
        edit_menu = edit_menu
            .add_native_item(MenuItem::Cut)
            .add_native_item(MenuItem::Copy)
            .add_native_item(MenuItem::Paste);
    }
    #[cfg(target_os = "macos")]
    {
        edit_menu = edit_menu.add_native_item(MenuItem::SelectAll);
    }
    #[cfg(not(target_os = "linux"))]
    {
        menu = menu.add_submenu(Submenu::new("Edit", edit_menu));
    }
    #[cfg(target_os = "macos")]
    {
        let mut view_menu = Menu::new();

        view_menu = view_menu
            .add_item(CustomMenuItem::new("swap".to_string(), "Swap Layout"))
            .add_item(CustomMenuItem::new("theme".to_string(), "Change Theme"))
            .add_native_item(MenuItem::Separator)
            .add_native_item(MenuItem::EnterFullScreen);

        menu = menu.add_submenu(Submenu::new("View", view_menu));
    }

    let mut window_menu = Menu::new();
    window_menu = window_menu.add_native_item(MenuItem::Minimize);
    #[cfg(target_os = "macos")]
    {
        window_menu = window_menu.add_native_item(MenuItem::Separator);
    }
    window_menu = window_menu
        .add_native_item(MenuItem::CloseWindow)
        .add_native_item(MenuItem::Quit);
    menu = menu.add_submenu(Submenu::new("Window", window_menu));

    let mut terminal_menu = Menu::new();
    terminal_menu =
        terminal_menu.add_item(CustomMenuItem::new("terminal".to_string(), "New Terminal"));

    menu = menu.add_submenu(Submenu::new("Terminal", terminal_menu));

    menu
}
