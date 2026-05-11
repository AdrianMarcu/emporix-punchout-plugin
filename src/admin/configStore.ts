import axios from 'axios';
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

const CONFIG_KEY = 'punchout-plugin';

export async function getConfig(tenantId: string, accessToken: string): Promise<PluginConfig | null> {
  try {
    const res = await axios.get<{ value: PluginConfig }>(
      `${appConfig.emporix.apiBase}/configuration/${tenantId}/configurations/${CONFIG_KEY}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 5000 },
    );
    const cfg = res.data.value;
    cfg.serviceAccount.clientSecret = decrypt(
      cfg.serviceAccount.clientSecret,
      appConfig.crypto.aesKey,
    );
    return cfg;
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && err.response?.status === 404) return null;
    throw err;
  }
}

export async function saveConfig(
  tenantId: string,
  incoming: Omit<PluginConfig, 'sharedSecretHash'> & { sharedSecret?: string },
  accessToken: string,
): Promise<void> {
  const existing = await getConfig(tenantId, accessToken);

  const { sharedSecret, ...configFields } = incoming;

  const sharedSecretHash = sharedSecret
    ? await hashSecret(sharedSecret)
    : (existing?.sharedSecretHash ?? '');

  const toSave: PluginConfig = {
    ...configFields,
    sharedSecretHash,
    serviceAccount: {
      clientId: incoming.serviceAccount.clientId,
      clientSecret: encrypt(incoming.serviceAccount.clientSecret, appConfig.crypto.aesKey),
    },
  };

  await axios.put(
    `${appConfig.emporix.apiBase}/configuration/${tenantId}/configurations/${CONFIG_KEY}`,
    { value: toSave },
    { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 5000 },
  );
}
