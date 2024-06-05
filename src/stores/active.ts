export function getActive() {
    const active = localStorage.getItem("active")
    return active
}

export function setActive(path: string) {
    localStorage.setItem("active", path)
    return true
}