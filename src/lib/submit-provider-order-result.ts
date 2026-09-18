export type SubmitProviderOrderSuccess = {
  ok: true;
  orderId: string;
  providerId: string;
};

export type SubmitProviderOrderFailure = {
  ok: false;
  errorCode: string;
  providerId: string | null;
};

export type SubmitProviderOrderResult =
  | SubmitProviderOrderSuccess
  | SubmitProviderOrderFailure;
