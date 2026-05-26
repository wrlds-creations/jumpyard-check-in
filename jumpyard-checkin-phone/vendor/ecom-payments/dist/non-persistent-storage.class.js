/** Adaption from https://github.com/Adyen/adyen-web/pull/2028/files - storage.ts */
export class NonPersistentStorage {
    constructor() {
        this.storage = {};
    }
    get length() {
        return Object.keys(this.storage).length;
    }
    /** Returns the name of the nth key, or null if n is greater than or equal to the number of key/value pairs. */
    key(index) {
        if (index > this.length) {
            return null;
        }
        return Object.keys(this.storage)[index] || null;
    }
    /** Returns the current value associated with the given key, or null if the given key does not exist. */
    getItem(keyName) {
        return this.storage[keyName] || null;
    }
    /** Sets the value of the pair identified by key to value, creating a new key/value pair if none existed for key previously. */
    setItem(keyName, keyValue) {
        this.storage[keyName] = keyValue;
    }
    /** Removes the key/value pair with the given key, if a key/value pair with the given key exists. */
    removeItem(keyName) {
        delete this.storage[keyName];
    }
    /** Removes all key/value pairs, if there are any. */
    clear() {
        this.storage = {};
    }
}
