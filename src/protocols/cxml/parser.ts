import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { CxmlSetupRequest } from './types';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

export function parsePunchOutSetupRequest(xml: string): CxmlSetupRequest {
  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    throw new Error('Invalid cXML');
  }

  const doc = parser.parse(xml) as Record<string, unknown>;

  const root = doc['cXML'] as Record<string, unknown> | undefined;
  if (!root) throw new Error('Invalid cXML: missing root element');

  const payloadId = String(root['@_payloadID'] ?? '');
  if (!payloadId) throw new Error('Invalid cXML: missing payloadID attribute');

  const header = root['Header'] as Record<string, unknown> | undefined;
  if (!header) throw new Error('Invalid cXML: missing Header');

  const from = header['From'] as Record<string, unknown>;
  const buyerOrgId = String(
    (from?.['Credential'] as Record<string, unknown>)?.['Identity'] ?? ''
  );

  const sender = header['Sender'] as Record<string, unknown>;
  const senderCred = sender?.['Credential'] as Record<string, unknown>;
  const sharedSecret = String(senderCred?.['SharedSecret'] ?? '');
  if (!sharedSecret) throw new Error('Missing SharedSecret');

  const request = root['Request'] as Record<string, unknown>;
  const setupReq = request?.['PunchOutSetupRequest'] as Record<string, unknown>;
  if (!setupReq) throw new Error('Invalid cXML: missing PunchOutSetupRequest');

  const buyerCookie = String(setupReq['BuyerCookie'] ?? '');
  if (!buyerCookie) throw new Error('Missing BuyerCookie');

  const bfp = setupReq['BrowserFormPost'] as Record<string, unknown>;
  const browserFormPostUrl = String(bfp?.['URL'] ?? '');
  if (!browserFormPostUrl) throw new Error('Missing BrowserFormPost URL');

  const rawOperation = String((setupReq['@_operation'] as string) ?? 'create');
  const VALID_OPERATIONS = ['create', 'edit', 'inspect'] as const;
  if (!VALID_OPERATIONS.includes(rawOperation as CxmlSetupRequest['operation'])) {
    throw new Error(`Invalid operation: ${rawOperation}`);
  }
  const operation = rawOperation as CxmlSetupRequest['operation'];

  return { payloadId, buyerOrgId, sharedSecret, buyerCookie, browserFormPostUrl, operation };
}
