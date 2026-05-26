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
    storefrontClientId: process.env.STOREFRONT_CLIENT_ID,
  };
}

/** Strip accidental URL prefix from a storefrontClientId value. */
function sanitizeClientId(id: string | undefined): string | undefined {
  if (!id) return undefined;
  // If value contains a URL prefix (pasted from address bar), extract the token after the last slash or dot
  if (id.startsWith('http://') || id.startsWith('https://')) {
    // Pull the last contiguous alphanumeric segment (the real client ID)
    const match = id.match(/([A-Za-z0-9]{20,})$/);
    return match ? match[1] : undefined;
  }
  return id;
}

export async function getConfig(tenantId: string, _accessToken?: string): Promise<PluginConfig | null> {
  let cfg: PluginConfig | null = null;
  try {
    const raw = await redis.get(`${CONFIG_PREFIX}${tenantId}`);
    if (raw) {
      cfg = { ...DEFAULTS, ...JSON.parse(raw) as Partial<PluginConfig> };
    }
  } catch {
    // Redis unavailable — fall through to env seed
  }

  if (!cfg) {
    const seed = seedFromEnv();
    if (!seed.serviceAccount?.clientId) return null;
    cfg = { ...DEFAULTS, ...seed };
  }

  // env var always overrides Redis — prevents stale/corrupt values from blocking deploys
  if (process.env.STOREFRONT_CLIENT_ID) {
    cfg.storefrontClientId = process.env.STOREFRONT_CLIENT_ID;
  } else {
    cfg.storefrontClientId = sanitizeClientId(cfg.storefrontClientId);
  }

  return cfg;
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
  // Treat '***' (masked display value) OR empty string as "keep existing secret"
  const clientSecretToStore = ((!rawClientSecret || rawClientSecret === '***') && existing)
    ? existing.serviceAccount.clientSecret
    : rawClientSecret;

  // Strip any accidental URL prefix from storefrontClientId (e.g. pasted from browser address bar)
  const rawStorefrontClientId = configFields.storefrontClientId ?? '';
  const cleanStorefrontClientId = rawStorefrontClientId.replace(/^https?:\/\/\S+?([A-Za-z0-9]{20,})$/, '$1') || rawStorefrontClientId;

  const toSave: PluginConfig = {
    ...DEFAULTS,
    ...(existing ?? {}),
    ...configFields,
    storefrontClientId: cleanStorefrontClientId || undefined,
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
