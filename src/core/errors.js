export class ClientError extends Error {
  constructor(message, code = "CLIENT_ERROR", status = 400) {
    super(message);
    this.name = "ClientError";
    this.code = code;
    this.status = status;
  }
}

export class NotFoundError extends ClientError {
  constructor(message = "Introuvable.") {
    super(message, "NOT_FOUND", 404);
  }
}

export class AuthError extends ClientError {
  constructor(message = "Authentification requise.") {
    super(message, "AUTH_REQUIRED", 401);
  }
}
