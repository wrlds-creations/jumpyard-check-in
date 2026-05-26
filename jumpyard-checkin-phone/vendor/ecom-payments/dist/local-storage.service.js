import { NonPersistentStorage } from './non-persistent-storage.class';
import { StorageKeys } from './payment.model';
export class LocalStorageService {
    constructor($log) {
        this.$log = $log;
        this.localStorage = this.isStorageAvailable('localStorage') ? window.localStorage : new NonPersistentStorage();
    }
    /**
     * Ensure Singleton instance of service - https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-0.html#example-15
     * @param log actions.log should be passed into get instance
     * @returns instance of service.
     * @example `const localStorageService = LocalStorageService.getInstance(actions.log);`
     */
    static getInstance(log) {
        if (!LocalStorageService.instance) {
            LocalStorageService.instance = new LocalStorageService(log);
        }
        return LocalStorageService.instance;
    }
    add(key, data) {
        try {
            this.localStorage.setItem(key, JSON.stringify(data));
        }
        catch (error) {
            this.$log.warn('Local storage failed', error);
        }
    }
    get(key) {
        try {
            const item = this.localStorage.getItem(key);
            return item ? JSON.parse(item) : null;
        }
        catch (error) {
            this.$log.warn('Local storage failed', error);
            return null;
        }
    }
    remove(key) {
        try {
            this.localStorage.removeItem(key);
        }
        catch (error) {
            this.$log.warn('Removing item from local storage failed', error);
        }
    }
    clear() {
        try {
            this.localStorage.removeItem(StorageKeys.payment);
            this.localStorage.removeItem(StorageKeys.unprocessedPayment);
            this.localStorage.removeItem(StorageKeys.selectedPaymentMethod);
            this.localStorage.removeItem(StorageKeys.paymentDetailCardLast4Digits);
            this.localStorage.removeItem(StorageKeys.payPalOrderId);
            this.localStorage.removeItem(StorageKeys.payPalPaymentDetails);
            this.localStorage.removeItem(StorageKeys.checkoutSessionId);
        }
        catch (error) {
            this.$log.warn('Clearing local storage failed', error);
        }
    }
    /**
     * Checks if local or session storage is available.
     * Note Safari (in private mode) has a functional localStorage object (with a quota of zero).
     * Therefore we need to actively set an item to check that it is real and functional.
     * Modified from https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API#feature-detecting_localstorage
     */
    isStorageAvailable(type) {
        try {
            const storage = window[type];
            const storeText = '__storage_test__';
            storage.setItem(storeText, storeText);
            storage.removeItem(storeText);
            return true;
        }
        catch (_) {
            return false;
        }
    }
}
