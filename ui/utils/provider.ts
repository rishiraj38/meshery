/**
 * Provider-type helpers.
 *
 * Meshery runs against either the built-in local provider or a remote provider
 * (Meshery Cloud). The provider's type is reported by the provider-capabilities
 * response as `providerType` ("local" | "remote"; see
 * server/models/providers.go). These helpers centralize the check so callers do
 * not hand-roll `providerCapabilities?.providerType === 'local'` inline.
 *
 * Note on the local provider: since the schemas v1beta3 account-consolidation
 * cutover, the local provider's user is a synthetic UUID (LocalProviderUserID)
 * and no longer carries the legacy `userId: "meshery"` string. Code that used to
 * detect the local provider via `user.userId === 'meshery'` must use
 * `isLocalProvider(providerCapabilities)` instead.
 */
type ProviderCapabilitiesLike = { providerType?: string } | null | undefined;

export const isLocalProvider = (capabilities?: ProviderCapabilitiesLike): boolean =>
  capabilities?.providerType === 'local';

export const isRemoteProvider = (capabilities?: ProviderCapabilitiesLike): boolean =>
  capabilities?.providerType === 'remote';
