export class InvitationNotFoundError extends Error {
  readonly code = 'INVITATION_NOT_FOUND';
  constructor(message = 'Invitation not found') {
    super(message);
    this.name = 'InvitationNotFoundError';
  }
}

export class InvitationExpiredError extends Error {
  readonly code = 'INVITATION_EXPIRED';
  constructor(message = 'Invitation has expired') {
    super(message);
    this.name = 'InvitationExpiredError';
  }
}

export class InvitationAlreadyUsedError extends Error {
  readonly code = 'INVITATION_ALREADY_USED';
  constructor(message = 'Invitation has already been used') {
    super(message);
    this.name = 'InvitationAlreadyUsedError';
  }
}

export class InvitationRevokedError extends Error {
  readonly code = 'INVITATION_REVOKED';
  constructor(message = 'Invitation has been revoked') {
    super(message);
    this.name = 'InvitationRevokedError';
  }
}

export class DuplicateInvitationError extends Error {
  readonly code = 'DUPLICATE_INVITATION';
  constructor(message = 'A pending invitation already exists for this email') {
    super(message);
    this.name = 'DuplicateInvitationError';
  }
}
