import { ILog } from './payment.model';
export declare class LocalStorageService {
    private $log;
    private static instance;
    private localStorage;
    private constructor();
    /**
     * Ensure Singleton instance of service - https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-0.html#example-15
     * @param log actions.log should be passed into get instance
     * @returns instance of service.
     * @example `const localStorageService = LocalStorageService.getInstance(actions.log);`
     */
    static getInstance(log: ILog): LocalStorageService;
    add(key: string, data: any): void;
    get<T>(key: string): T | null;
    remove(key: string): void;
    clear(): void;
    /**
     * Checks if local or session storage is available.
     * Note Safari (in private mode) has a functional localStorage object (with a quota of zero).
     * Therefore we need to actively set an item to check that it is real and functional.
     * Modified from https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API#feature-detecting_localstorage
     */
    isStorageAvailable(type: 'localStorage' | 'sessionStorage'): boolean;
}
