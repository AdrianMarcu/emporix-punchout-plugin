import type { OciSetupRequest } from './types';

export function parseOciSetupRequest(body: Record<string, string>): OciSetupRequest {
  const hookUrl = body['HOOK_URL'];
  if (!hookUrl) throw new Error('Missing HOOK_URL');
  return {
    hookUrl,
    username: body['USERNAME'] ?? '',
    password: body['PASSWORD'] ?? '',
    okCode: body['~OkCode'] ?? 'ADDFROMCATALOG',
    caller: body['~Caller'] ?? '',
  };
}
