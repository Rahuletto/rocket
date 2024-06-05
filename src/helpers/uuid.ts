function simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return hash;
}

export function uuid(input: string): string {
    const hash = simpleHash(input);
    const length = 32;
    let id = Math.abs(hash).toString(36);
    if (id.length > length) {
        id = id.slice(0, length);
    } else {
        while (id.length < length) {
            id = '0' + id;
        }
    }
    return id;
}