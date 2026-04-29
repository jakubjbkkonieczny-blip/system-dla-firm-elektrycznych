type LogParams = {
  method: string;
  path: string;
  status: number;
  durationMs: number;
};

export function logRequestSummary({ method, path, status, durationMs }: LogParams): void {
  console.log(`[api] ${method} ${path} ${status} ${durationMs}ms`);
}
