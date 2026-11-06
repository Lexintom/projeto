export interface IdempotencyRecord {
  key: string;
  payloadHash: string;
  response: unknown;
  statusCode: number;
  createdAt: Date;
}

export interface IdempotencyService {
  check(
    key: string,
    payloadHash: string,
  ): Promise<{ exists: boolean; record?: IdempotencyRecord }>;
  save(
    key: string,
    payloadHash: string,
    response: unknown,
    statusCode: number,
  ): Promise<void>;
}
