use tauri::{
    menu::{Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    AppHandle,
};

pub fn menu_bar(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    // File Items
    let new_file = MenuItemBuilder::new("New File")
        .id("new_file")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let new_folder = MenuItemBuilder::new("New Folder")
        .id("new_folder")
        .accelerator("CmdOrCtrl+Shift+N")
        .build(app)?;
    let open_folder = MenuItemBuilder::new("Open Folder...")
        .id("open")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let save_file = MenuItemBuilder::new("Save")
        .id("save")
        .accelerator("CmdOrCtrl+S")
        .build(app)?;

    let file = SubmenuBuilder::new(app, "File")
        .item(&new_file)
        .item(&new_folder)
        .separator()
        .item(&open_folder)
        .separator()
        .item(&save_file)
        .separator()
        .close_window()
        .build()?;

    // Edit Items
    let edit = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    // View Items
    let swap_layout = MenuItemBuilder::new("Swap Sidebar Position")
        .id("swap")
        .accelerator("CmdOrCtrl+Alt+S")
        .build(app)?;
    let toggle_theme = MenuItemBuilder::new("Toggle Theme")
        .id("theme")
        .accelerator("CmdOrCtrl+T")
        .build(app)?;
    let toggle_sidebar = MenuItemBuilder::new("Toggle Side Bar")
        .id("toggle_sidebar")
        .accelerator("CmdOrCtrl+B")
        .build(app)?;
    let toggle_terminal = MenuItemBuilder::new("Toggle Terminal")
        .id("terminal")
        .accelerator("CmdOrCtrl+J")
        .build(app)?;
    let toggle_agent = MenuItemBuilder::new("Toggle Agent Panel")
        .id("toggle_agent")
        .accelerator("CmdOrCtrl+Shift+A")
        .build(app)?;

    let view = SubmenuBuilder::new(app, "View")
        .item(&swap_layout)
        .item(&toggle_theme)
        .separator()
        .item(&toggle_sidebar)
        .item(&toggle_terminal)
        .item(&toggle_agent)
        .separator()
        .fullscreen()
        .build()?;

    // Terminal Items
    let new_terminal = MenuItemBuilder::new("New Terminal")
        .id("terminal")
        .accelerator("CmdOrCtrl+Shift+`")
        .build(app)?;

    let terminal = SubmenuBuilder::new(app, "Terminal")
        .item(&new_terminal)
        .build()?;

    MenuBuilder::new(app)
        .item(&file)
        .item(&edit)
        .item(&view)
        .item(&terminal)
        .build()
}
