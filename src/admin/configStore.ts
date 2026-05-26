import { hashSecret } from '../crypto';
import redis from '../redis';

export interface PluginConfig {
  sharedSecretHash: string;
  serviceAccount: { clientId: string; clientSecret: string };
  storefrontBaseUrl: string;
  /** Client ID of the storefront app (REACT_APP_CLIENT_ID in b2b-showcase).
   *  Used to obtain an anonymous customer token so the storefront can adopt
   *  the pre-created cart via loginBasedOnCustomerToken(). */
  storefrontClientId?: string;
  cxmlEnabled: boolean;
  ociEnabled: boolean;
  operationAllowed: 'create' | 'edit' | 'inspect';
  ociOkCode: 'ADDFROMCATALOG' | 'SOURCING';
  buyerMappings: Array<{ buyerOrgId: string; customerGroupId: string }>;
}

const CONFIG_PREFIX = 'punchout:config:';

const DEFAULTS: PluginConfig = {
  sharedSecretHash: '',
  serviceAccount: { clientId: '', clientSecret: '' },
  storefrontBaseUrl: '',
  cxmlEnabled: true,
  ociEnabled: false,
  operationAllowed: 'edit',
  ociOkCode: 'ADDFROMCATALOG',
  buyerMappings: [],
};

function seedFromEnv(): Partial<PluginConfig> {
  return {
    serviceAccount: {
      clientId: process.env.EMPORIX_CLIENT_ID ?? '',
      clientSecret: process.env.EMPORIX_CLIENT_SECRET ?? '',
    },
    storefrontBaseUrl: process.env.STOREFRONT_BASE_URL ?? '',
    // Stored as plaintext; verifySecret handles both plaintext and bcrypt
    sharedSecretHash: process.env.PUNCHOUT_SHARED_SECRET ?? '',
  };
}

export async function getConfig(tenantId: string, _accessToken?: string): Promise<PluginConfig | null> {
  try {
    const raw = await redis.get(`${CONFIG_PREFIX}${tenantId}`);
    if (raw) {
      return { ...DEFAULTS, ...JSON.parse(raw) as Partial<PluginConfig> };
    }
  } catch {
    // Redis unavailable — fall through to env seed
  }
  const seed = seedFromEnv();
  if (!seed.serviceAccount?.clientId) return null;
  return { ...DEFAULTS, ...seed };
}

export async function saveConfig(
  tenantId: string,
  incoming: Omit<PluginConfig, 'sharedSecretHash'> & { sharedSecret?: string },
  _accessToken?: string,
): Promise<void> {
  const existing = await getConfig(tenantId).catch(() => null);

  const { sharedSecret, ...configFields } = incoming;

  const sharedSecretHash = sharedSecret
    ? await hashSecret(sharedSecret)   // properly bcrypt-hashed when saved via UI
    : (existing?.sharedSecretHash ?? '');

  const rawClientSecret = incoming.serviceAccount.clientSecret;
  const clientSecretToStore = (rawClientSecret === '***' && existing)
    ? existing.serviceAccount.clientSecret
    : rawClientSecret;

  const toSave: PluginConfig = {
    ...DEFAULTS,
    ...(existing ?? {}),
    ...configFields,
    sharedSecretHash,
    serviceAccount: {
      clientId: incoming.serviceAccount.clientId,
      clientSecret: clientSecretToStore,
    },
  };

  try {
    await redis.set(`${CONFIG_PREFIX}${tenantId}`, JSON.stringify(toSave));
  } catch {
    // Redis unavailable — store in memory as last resort
    console.error('[configStore] Redis unavailable, config not persisted');
  }
}
