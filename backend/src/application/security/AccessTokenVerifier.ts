export type VerifiedPrincipal = {
  subject: string;
  scopes: ReadonlySet<string>;
};

export interface AccessTokenVerifier {
  verify(token: string): Promise<VerifiedPrincipal>;
}
