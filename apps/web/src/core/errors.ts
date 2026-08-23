/**
 * Errors the application reasons about, independent of who raised them.
 *
 * PipelineError lives here rather than beside the UI copy that renders it,
 * because the infrastructure adapters have to construct it and infrastructure
 * may not import from features. The code is the contract; the wording is a
 * presentation concern and stays in the feature layer.
 */
export class PipelineError extends Error {
  constructor(
    /** Machine-readable code from the server, e.g. 'insufficient_credits'. */
    readonly code: string,
    message: string,
    readonly status?: number,
    /** Extra fields the server returned — required/available credits, etc. */
    readonly detail?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PipelineError';
  }
}
