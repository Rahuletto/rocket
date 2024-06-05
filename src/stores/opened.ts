
export function getOpens(): string[] {
    const storedArray = localStorage.getItem("open-files");
    return storedArray ? JSON.parse(storedArray) : [];
}

export function setOpens(array: string[]): void {
    localStorage.setItem("open-files", JSON.stringify(array));
}