/** Typed run-level failures. `status` maps 1:1 to the HTTP status of PRD §8.7. */
export class RunError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail?: string;

  constructor(status: number, code: string, message: string, detail?: string) {
    super(message);
    this.name = 'RunError';
    this.status = status;
    this.code = code;
    if (detail) this.detail = detail;
  }
}

export const badRequest = (code: string, message: string): RunError => new RunError(400, code, message);
export const conflict = (code: string, message: string, detail?: string): RunError => new RunError(409, code, message, detail);
export const notFound = (code: string, message: string): RunError => new RunError(404, code, message);
export const invalidBody = (code: string, message: string, detail?: string): RunError => new RunError(422, code, message, detail);
