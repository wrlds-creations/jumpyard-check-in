import { CoreOptions } from '@adyen/adyen-web/dist/types/core/types';
import { IPaymentConfiguration } from './payment.model';
export interface IAdyenCheckoutSessionResponse {
    isValid: boolean;
    errorMessage?: string;
    session: IAdyenCheckoutSession;
}
export interface IAdyenCheckoutSession {
    id: string;
    data?: string;
}
export interface IAdyenPaymentConfiguration extends IPaymentConfiguration {
    expandFirstMethod: boolean;
    captureBillingAddress: boolean;
    applePayMerchantName?: string;
    googlePayMerchantId?: string;
    googlePayGatewayMerchantId?: string;
    googlePayMerchantName?: string;
    googlePayMerchantOrigin?: string;
    googlePayAuthJwt?: string;
    paymentMethods: IAdyenCheckoutPaymentMethod[];
    address?: IPhysicalAddress;
}
export interface IPhysicalAddress {
    city: string;
    country: string;
    houseNumberOrName: string;
    postalCode: string;
    stateOrProvince: string;
    street: string;
}
export interface IAdyenCheckoutPaymentMethod {
    name: string;
    type: string;
    brands: string[];
    details: IAdyenCheckoutPaymentMethodDetailItem[];
    configuration?: any;
}
export interface IAdyenCheckoutPaymentMethodDetail {
    key: string;
    type: string;
    optional?: boolean;
    items: IAdyenCheckoutPaymentMethodDetailItem[];
}
export interface IAdyenCheckoutPaymentMethodDetailItem {
    id: string;
    name: string;
}
export interface IAdyenPaymentNotification {
    eventCode: string;
    merchantReference: string;
    paymentMethod: string;
    pspReference: string;
    reason: string;
    amount: IAdyenPaymentNotificationAmount;
    isSuccess: boolean;
    additionalData: IAdyenPaymentNotificationAdditionalData;
}
export interface IAdyenPaymentNotificationAdditionalData {
    checkoutSessionId?: string;
    cardSummary?: string;
}
export interface IAdyenPaymentNotificationAmount {
    currency: string;
    value: string;
}
export interface IAdyenPaymentResult {
    resultCode: string;
}
export declare class AdyenResult {
    static readonly authenticationFinished = "AuthenticationFinished";
    static readonly transactionStatus = "AuthenticationNotRequired";
    static readonly authorised = "Authorised";
    static readonly pending = "Pending";
    static readonly presentToShopper = "PresentToShopper";
    static readonly received = "Received";
    static readonly cancelled = "Cancelled";
    static readonly error = "Error";
    static readonly refused = "Refused";
}
export declare class AdyenNotificationEvent {
    static readonly authorisation = "AUTHORISATION";
    static readonly pending = "PENDING";
}
export declare class AdyenDropInStatus {
    static readonly ready = "ready";
    static readonly loading = "loading";
}
export declare class AdyenStorageKeys {
    static readonly sessionId = "ecom-payments:session-id";
}
export declare class AdyenPaymentMethod {
    static readonly cards = "scheme";
    static readonly ideal = "ideal";
    static readonly sepadirectdebit = "sepadirectdebit";
    static readonly paywithgoogle = "paywithgoogle";
    static readonly googlepay = "googlepay";
    static readonly paypal = "paypal";
    static readonly applepay = "applepay";
    static readonly zip = "zip";
    static readonly maestro = "maestro";
    static readonly klarna = "klarna";
    static readonly klarna_account = "klarna_account";
    static readonly klarna_paynow = "klarna_paynow";
    static readonly afterpaytouch = "afterpaytouch";
    static readonly clearpay = "clearpay";
    static readonly affirm = "affirm";
    static readonly facilypay = "facilypay";
    static readonly ratepay = "ratepay";
    static readonly paybright = "paybright";
}
export interface AdyenDropInCoreOptions extends CoreOptions {
    paymentMethodsConfiguration?: any;
}
export declare class AdyenErrorCodes {
    static readonly networkError = "NETWORK_ERROR";
    static readonly paymentAlreadyAttempted = "PAYMENT_ALREADY_ATTEMPTED";
}
