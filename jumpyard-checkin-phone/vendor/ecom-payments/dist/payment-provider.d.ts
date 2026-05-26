import { LocalStorageService } from './local-storage.service';
import { IBrowser, IHttp, IHttpOptions, IJwt, ILog, IPayment, IPaymentAction, IPaymentConfiguration, IPaymentDetail, IPaymentRequest, IPaymentRequestHandlers, IPaymentResult, PaymentProviders } from './payment.model';
export declare abstract class PaymentProvider {
    protected config: IPaymentConfiguration;
    protected $translate: (key: string, data?: any) => string;
    protected $http: IHttp;
    protected $log: ILog;
    protected payment: IPayment;
    protected paymentRequest: IPaymentRequest;
    protected storage: LocalStorageService;
    constructor(config: IPaymentConfiguration, actions: IPaymentAction);
    get providerType(): PaymentProviders;
    abstract setup(paymentRequest: IPaymentRequest, containerId?: string): Promise<any>;
    abstract hasRedirectResult(): boolean;
    abstract handleRedirect(handlers: IPaymentRequestHandlers): Promise<any>;
    abstract checkPaymentStatus(merchantReference: string, numberOfAttempts?: number): Promise<IPaymentResult>;
    abstract getPaymentDetail(numberOfAttempts?: number): Promise<IPaymentDetail | undefined>;
    abstract get supportRecurringBilling(): boolean;
    protected post: (endpoint: string, data: any, options?: IHttpOptions) => Promise<any>;
    protected get: (endpoint: string, params: any, options?: IHttpOptions) => Promise<any>;
    protected getAmountFromCents: (amountInCents: string | number) => number;
    protected getAmountInCents: (amount: number) => number;
    protected storePaymentRequest: (request: IPaymentRequest) => void;
    protected getBrowserInfo(): IBrowser;
    protected parseJtw: (jwt: string) => IJwt;
    protected delay(ms: number): Promise<unknown>;
    protected isEmbedded(): boolean;
}
