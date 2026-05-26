import { LocalStorageService } from './local-storage.service';
import { StorageKeys } from './payment.model';
export class PaymentProvider {
    constructor(config, actions) {
        this.post = (endpoint, data, options) => {
            return this.$http.post(new URL(endpoint, this.config.apiUrl).toString(), data, options);
        };
        this.get = (endpoint, params, options) => {
            return this.$http.get(new URL(endpoint, this.config.apiUrl).toString(), params, options);
        };
        this.getAmountFromCents = (amountInCents) => {
            if (typeof amountInCents === 'string') {
                amountInCents = amountInCents.replace(/\$/g, '');
                amountInCents = parseFloat(amountInCents);
            }
            return amountInCents / 100;
        };
        this.getAmountInCents = (amount) => {
            return amount * 100;
        };
        this.storePaymentRequest = (request) => {
            this.storage.clear();
            this.paymentRequest = request;
            this.payment = this.parseJtw(request.jwt).payload;
            this.payment.paymentProvider = this.providerType;
            this.storage.add(StorageKeys.payment, this.payment);
        };
        this.parseJtw = (jwt) => {
            if (!jwt) {
                return null;
            }
            const split = jwt.split('.');
            if (split.length !== 3) {
                return null;
            }
            return {
                header: JSON.parse(atob(split[0])),
                payload: JSON.parse(atob(split[1])),
                signature: split[3]
            };
        };
        this.config = config;
        this.$translate = actions.translate;
        this.$http = actions.http;
        this.$log = actions.log;
        this.storage = LocalStorageService.getInstance(this.$log);
    }
    get providerType() {
        return this.config.provider;
    }
    getBrowserInfo() {
        return {
            locale: navigator.language,
            userAgent: navigator.userAgent,
            tzOffset: new Date().getTimezoneOffset(),
            screen: {
                colorDepth: window.screen.colorDepth,
                height: window.screen.height,
                width: window.screen.width
            },
            isEmbedded: this.isEmbedded()
        };
    }
    async delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    isEmbedded() {
        return window && window.self !== window.top;
    }
}
