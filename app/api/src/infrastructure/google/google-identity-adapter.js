import { OAuth2Client } from "google-auth-library";
import { AppError } from "../../common/errors/app-error.js";

export class GoogleIdentityAdapter {
  constructor(clientId) {
    this.clientId = clientId;
    this.client = new OAuth2Client(clientId);
  }
  async verify(credential) {
    if (!this.clientId)
      throw new AppError(
        "GOOGLE_NOT_CONFIGURED",
        "Google sign-in is not configured.",
        503,
      );
    try {
      const ticket = await this.client.verifyIdToken({
        idToken: credential,
        audience: this.clientId,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email || !payload.email_verified)
        throw new Error("unverified identity");
      return {
        subject: payload.sub,
        email: payload.email,
        normalizedEmail: payload.email.toLowerCase(),
        displayName: payload.name || payload.email.split("@")[0],
      };
    } catch {
      throw new AppError(
        "GOOGLE_CREDENTIAL_INVALID",
        "Google sign-in could not be verified.",
        401,
      );
    }
  }
}
