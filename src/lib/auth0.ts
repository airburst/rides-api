import * as jose from "jose";

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE;

if (!AUTH0_DOMAIN || !AUTH0_AUDIENCE) {
  throw new Error(
    "AUTH0_DOMAIN and AUTH0_AUDIENCE environment variables are required",
  );
}

// Cache JWKS to avoid fetching on every request
let jwks: jose.JWTVerifyGetKey | null = null;

function getJwks() {
  jwks ??= jose.createRemoteJWKSet(
    new URL(`https://${AUTH0_DOMAIN}/.well-known/jwks.json`),
  );
  return jwks;
}

export interface Auth0TokenPayload {
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  [key: string]: unknown;
}

export async function verifyAuth0Token(
  token: string,
): Promise<Auth0TokenPayload> {
  const jwks = getJwks();

  const { payload } = await jose.jwtVerify(token, jwks, {
    issuer: `https://${AUTH0_DOMAIN}/`,
    audience: AUTH0_AUDIENCE,
  });

  return payload as Auth0TokenPayload;
}
