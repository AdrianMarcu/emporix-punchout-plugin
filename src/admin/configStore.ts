import { encrypt, decrypt, hashSecret } from '../crypto';
import { config as appConfig } from '../config';

export interface PluginConfig {
  sharedSecretHash: string;
  serviceAccount: { clientId: string; clientSecret: string };
  storefrontBaseUrl: string;
  cxmlEnabled: boolean;
  ociEnabled: boolean;
  operationAllowed: 'create' | 'edit' | 'inspect';
  ociOkCode: 'ADDFROMCATALOG' | 'SOURCING';
  buyerMappings: Array<{ buyerOrgId: string; customerGroupId: string }>;
}

// In-memory store keyed by tenantId — sufficient for demo/PoC.
// Config survives the process lifetime; persists across requests within a session.
const store = new Map<string, PluginConfig>();

// Optionally seed from environment variables so config survives redeployments
function seedFromEnv(_tenantId: string): PluginConfig | null {
  const clientId = process.env.EMPORIX_CLIENT_ID;
  const clientSecret = process.env.EMPORIX_CLIENT_SECRET ?? '';
  const storefrontBaseUrl = process.env.STOREFRONT_BASE_URL ?? '';
  const sharedSecret = process.env.PUNCHOUT_SHARED_SECRET ?? '';
  if (!clientId) return null;
  return {
    sharedSecretHash: sharedSecret,   // stored as plaintext for demo; verified in punchout route
    serviceAccount: { clientId, clientSecret },
    storefrontBaseUrl,
    cxmlEnabled: true,
    ociEnabled: false,
    operationAllowed: 'edit',
    ociOkCode: 'ADDFROMCATALOG',
    buyerMappings: [],
  };
}

export async function getConfig(tenantId: string, _accessToken?: string): Promise<PluginConfig | null> {
  return store.get(tenantId) ?? seedFromEnv(tenantId);
}

export async function saveConfig(
  tenantId: string,
  incoming: Omit<PluginConfig, 'sharedSecretHash'> & { sharedSecret?: string },
  _accessToken?: string,
): Promise<void> {
  const existing = store.get(tenantId) ?? seedFromEnv(tenantId);

  const { sharedSecret, ...configFields } = incoming;

  const sharedSecretHash = sharedSecret
    ? await hashSecret(sharedSecret)
    : (existing?.sharedSecretHash ?? '');

  const rawClientSecret = incoming.serviceAccount.clientSecret;
  const clientSecretToStore = (rawClientSecret === '***' && existing)
    ? existing.serviceAccount.clientSecret
    : rawClientSecret;

  const toSave: PluginConfig = {
    ...configFields,
    sharedSecretHash,
    serviceAccount: {
      clientId: incoming.serviceAccount.clientId,
      clientSecret: clientSecretToStore,
    },
  };

  store.set(tenantId, toSave);
}
