export class PersistenceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'PersistenceError'
    this.cause = options?.cause
  }
}

export function isPersistenceError(error: unknown): error is PersistenceError {
  return error instanceof PersistenceError
}
