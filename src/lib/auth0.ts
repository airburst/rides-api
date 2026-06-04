import * as jose from "jose";
import { env } from "./env.js";

const AUTH0_DOMAIN = env("AUTH0_DOMAIN");
const AUTH0_AUDIENCE = env("AUTH0_AUDIENCE");

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

export interface Auth0UserInfo {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
}

export async function fetchAuth0UserInfo(
  accessToken: string,
): Promise<Auth0UserInfo> {
  const res = await fetch(`https://${AUTH0_DOMAIN}/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Auth0 /userinfo failed: ${res.status}`);
  }

  return res.json() as Promise<Auth0UserInfo>;
}
