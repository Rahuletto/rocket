export function dirStore(path: string, opened: boolean) {
    let folders = getDirStore()
    if(isOpened(path)) {
        folders = folders.filter((folder: {path: string, opened: boolean}) => (path !== folder.path))
    } else {
        folders.push({path, opened})
    }

    localStorage.setItem("opened", JSON.stringify(folders))
}

export function getDirStore() {
    const opened = localStorage.getItem("opened")
    if (!opened) return []
    return JSON.parse(opened)
}

export function isOpened(path: string) {
    const opened = localStorage.getItem("opened")
    if (!opened) return false
    return JSON.parse(opened).find((folder: {path: string, opened: boolean}) => folder.path === path)
}