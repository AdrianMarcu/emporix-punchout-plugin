import { encrypt, decrypt, hashSecret } from '../crypto';
import { config as appConfig } from '../config';
import redis from '../redis';

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

const CONFIG_PREFIX = 'punchout:config:';

function redisKey(tenantId: string): string {
  return `${CONFIG_PREFIX}${tenantId}`;
}

export async function getConfig(tenantId: string, _accessToken?: string): Promise<PluginConfig | null> {
  const raw = await redis.get(redisKey(tenantId));
  if (!raw) return null;
  const cfg = JSON.parse(raw) as PluginConfig;
  // Decrypt client secret stored at rest
  if (cfg.serviceAccount.clientSecret) {
    try {
      cfg.serviceAccount.clientSecret = decrypt(cfg.serviceAccount.clientSecret, appConfig.crypto.aesKey);
    } catch {
      // If decryption fails (e.g. key rotation), return empty secret
      cfg.serviceAccount.clientSecret = '';
    }
  }
  return cfg;
}

export async function saveConfig(
  tenantId: string,
  incoming: Omit<PluginConfig, 'sharedSecretHash'> & { sharedSecret?: string },
  _accessToken?: string,
): Promise<void> {
  const existing = await getConfig(tenantId);

  const { sharedSecret, ...configFields } = incoming;

  const sharedSecretHash = sharedSecret
    ? await hashSecret(sharedSecret)
    : (existing?.sharedSecretHash ?? '');

  const rawClientSecret = incoming.serviceAccount.clientSecret;
  const clientSecretToEncrypt = (rawClientSecret === '***' && existing)
    ? existing.serviceAccount.clientSecret  // already decrypted by getConfig
    : rawClientSecret;
  const encryptedClientSecret = clientSecretToEncrypt
    ? encrypt(clientSecretToEncrypt, appConfig.crypto.aesKey)
    : '';

  const toSave: PluginConfig = {
    ...configFields,
    sharedSecretHash,
    serviceAccount: {
      clientId: incoming.serviceAccount.clientId,
      clientSecret: encryptedClientSecret,
    },
  };

  await redis.set(redisKey(tenantId), JSON.stringify(toSave));
}
