export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function invalidSignature() {
  return new ApiError(
    401,
    "INVALID_SIGNATURE",
    "Wallet signature could not be verified. Please sign in again.",
  );
}
