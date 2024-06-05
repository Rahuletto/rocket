function simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
}

export function uuid(input: string): string {
    const hash = simpleHash(input);
    let id = Math.abs(hash).toString(36);

    // Ensure the ID is exactly 32 characters long
    while (id.length < 32) {
        id += Math.abs(simpleHash(id)).toString(36);
    }

    // Remove leading zeros
    id = id.replace(/^0+/g, '');

    // If the resulting ID is empty, fallback to "0"
    if (id === '') {
        id = '0';
    }

    // Ensure the ID is exactly 32 characters long
    while (id.length < 32) {
        id += Math.abs(simpleHash(id)).toString(36);
    }

    return id.slice(0, 32); // Trim to ensure exactly 32 characters
}