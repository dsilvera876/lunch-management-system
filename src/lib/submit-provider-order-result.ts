export type SubmitProviderOrderSuccess = {
  ok: true;
  orderId: string;
  providerId: string;
};

export type SubmitProviderOrderFailure = {
  ok: false;
  errorCode: string;
  providerId: string | null;
  providerName?: string | null;
  message?: string | null;
};

export type SubmitProviderOrderResult =
  | SubmitProviderOrderSuccess
  | SubmitProviderOrderFailure;

export type SubmitLunchCheckoutSuccess = {
  ok: true;
  orderGroupId: string;
  orderIds: string[];
  providerIds: string[];
  providerNames: string[];
};

export type SubmitLunchCheckoutFailure = {
  ok: false;
  errorCode: string;
  providerId: string | null;
  providerName: string | null;
  message: string | null;
};

export type SubmitLunchCheckoutResult =
  | SubmitLunchCheckoutSuccess
  | SubmitLunchCheckoutFailure;
