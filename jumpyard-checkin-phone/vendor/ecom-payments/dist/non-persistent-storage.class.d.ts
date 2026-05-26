/** Adaption from https://github.com/Adyen/adyen-web/pull/2028/files - storage.ts */
export declare class NonPersistentStorage implements Storage {
    private storage;
    constructor();
    get length(): number;
    /** Returns the name of the nth key, or null if n is greater than or equal to the number of key/value pairs. */
    key(index: number): string | null;
    /** Returns the current value associated with the given key, or null if the given key does not exist. */
    getItem(keyName: string): string | null;
    /** Sets the value of the pair identified by key to value, creating a new key/value pair if none existed for key previously. */
    setItem(keyName: string, keyValue: string): void;
    /** Removes the key/value pair with the given key, if a key/value pair with the given key exists. */
    removeItem(keyName: string): void;
    /** Removes all key/value pairs, if there are any. */
    clear(): void;
}
