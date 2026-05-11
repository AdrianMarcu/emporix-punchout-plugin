export interface PunchoutSession {
  sessionId: string;
  protocol: 'cxml' | 'oci';
  buyerOrgId: string;
  customerGroupId: string;
  browserFormPostUrl: string;
  buyerCookie: string;
  emporixCartId: string | null;
  createdAt: string;
}
