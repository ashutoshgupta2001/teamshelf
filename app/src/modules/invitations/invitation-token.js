export async function resolveInvitationToken({
  repository,
  tokens,
  rawToken,
  now,
  transaction,
}) {
  const signed = tokens.verifyInvitation?.(rawToken);
  if (signed?.kind === "WORKSPACE")
    return {
      invitation: await repository.findActiveById(signed.id, now, transaction),
      platform: null,
      bootstrap: null,
    };
  if (signed?.kind === "PLATFORM")
    return {
      invitation: null,
      platform: await repository.findActivePlatformById(
        signed.id,
        now,
        transaction,
      ),
      bootstrap: null,
    };

  // Continue accepting pre-existing opaque links and bootstrap invitations.
  const hash = tokens.hash(rawToken);
  const invitation = await repository.findActiveByTokenHash(
    hash,
    now,
    transaction,
  );
  const platform = invitation
    ? null
    : await repository.findPlatformByTokenHash(hash, now, transaction);
  const bootstrap =
    invitation || platform
      ? null
      : await repository.findBootstrapByTokenHash(hash, now, transaction);
  return { invitation, platform, bootstrap };
}
