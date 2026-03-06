export class APIError extends Error {
    readonly status: number;
    readonly errorCode: string;

    constructor(status: number, errorCode: string, message: string) {
        super(message);
        this.name = 'APIError';
        this.status = status;
        this.errorCode = errorCode;
    }
}

export class AuthenticationError extends APIError {
    constructor(message = 'Invalid or revoked API key') {
        super(401, 'auth_required', message);
        this.name = 'AuthenticationError';
    }
}

export class PermissionDeniedError extends APIError {
    readonly requiredScope?: string;

    constructor(message = 'Insufficient scope', requiredScope?: string) {
        super(403, 'insufficient_scope', message);
        this.name = 'PermissionDeniedError';
        this.requiredScope = requiredScope;
    }
}

export class RateLimitError extends APIError {
    readonly retryAfter?: number;

    constructor(message = 'Rate limit exceeded', retryAfter?: number) {
        super(429, 'rate_limit_exceeded', message);
        this.name = 'RateLimitError';
        this.retryAfter = retryAfter;
    }
}

export class WorkspaceAccessDeniedError extends APIError {
    constructor(message = 'API key is not scoped to this workspace') {
        super(403, 'workspace_access_denied', message);
        this.name = 'WorkspaceAccessDeniedError';
    }
}
