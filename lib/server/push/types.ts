export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export type ParsedPushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type SendPushResult = {
  sent: number;
  failed: number;
  removedStale: number;
  skippedInactiveUser: boolean;
};
