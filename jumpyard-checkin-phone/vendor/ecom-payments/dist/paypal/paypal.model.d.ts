import { IPaymentConfiguration, IPaymentError } from '../payment.model';
export interface IPayPalPaymentConfiguration extends IPaymentConfiguration {
    clientId: string;
    merchantId: string;
    currency: string;
    partnerCode: string;
    canUseVenmo: boolean;
    canUsePayLater: boolean;
}
export interface ICaptureResult {
    isValid: boolean;
    error: IPaymentError;
    capture: ICaptureData;
}
export interface ICaptureData {
    status: string;
    amount: number;
    email: string;
    data: string;
}
export interface IPayPalAmount {
    value: number;
    currency: string;
}
export interface IPayPalPaymentDetails {
    paymentMethod?: string;
    payer: string;
}
export declare class PayPalFundingSources {
    static readonly paypal = "paypal";
    static readonly venmo = "venmo";
    static readonly payLater = "paylater";
    static readonly advancedCardProcessing = "card";
    static readonly bancontact = "bancontact";
    static readonly blik = "blik";
    static readonly esp = "eps";
    static readonly giroPay = "giropay";
    static readonly iDeal = "ideal";
    static readonly myBank = "mybank";
    static readonly p24 = "p24";
    static readonly sepaDirectDebit = "sepa";
    static readonly sofort = "sofort";
}
