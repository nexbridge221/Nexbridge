import { generateKeyPairSync, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

/** Remonte jusqu'à la racine du monorepo (là où se trouve pnpm-workspace.yaml). */
function findRepoRoot(start = process.cwd()): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

export const REPO_ROOT = findRepoRoot();
const LOCAL_DIR = path.join(REPO_ROOT, ".nexbridge-local");

const bool = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:5173"),
  API_PORT: z.coerce.number().int().default(4000),
  DEMO_MODE: bool,
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional(),
  JWT_PRIVATE_KEY: z.string().optional(),
  JWT_PUBLIC_KEY: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),
  COOKIE_SECURE: bool,
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default(".nexbridge-local/uploads"),
  SENDGRID_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default("NEXBRIDGE <no-reply@nexbridge.example>"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Configuration invalide :", parsed.error.flatten().fieldErrors);
  process.exit(1);
}
const env = parsed.data;
const isProd = env.NODE_ENV === "production";

/** En développement uniquement : génère et réutilise des secrets locaux (jamais dans Git). */
function localSecret(file: string, generate: () => string): string {
  if (isProd) {
    throw new Error(`Secret manquant en production : fournissez-le par variable d'environnement (${file}).`);
  }
  const dir = path.join(LOCAL_DIR, "keys");
  const full = path.join(dir, file);
  if (fs.existsSync(full)) return fs.readFileSync(full, "utf8");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const value = generate();
  fs.writeFileSync(full, value, { mode: 0o600 });
  return value;
}

function jwtKeys(): { privateKey: string; publicKey: string } {
  if (env.JWT_PRIVATE_KEY && env.JWT_PUBLIC_KEY) {
    return { privateKey: env.JWT_PRIVATE_KEY.replace(/\\n/g, "\n"), publicKey: env.JWT_PUBLIC_KEY.replace(/\\n/g, "\n") };
  }
  if (isProd) throw new Error("JWT_PRIVATE_KEY et JWT_PUBLIC_KEY sont obligatoires en production.");
  const dir = path.join(LOCAL_DIR, "keys");
  const privPath = path.join(dir, "jwt-private.pem");
  const pubPath = path.join(dir, "jwt-public.pem");
  if (fs.existsSync(privPath) && fs.existsSync(pubPath)) {
    return { privateKey: fs.readFileSync(privPath, "utf8"), publicKey: fs.readFileSync(pubPath, "utf8") };
  }
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  fs.writeFileSync(privPath, privateKey, { mode: 0o600 });
  fs.writeFileSync(pubPath, publicKey, { mode: 0o644 });
  return { privateKey, publicKey };
}

const encryptionKeyB64 = env.ENCRYPTION_KEY || localSecret("encryption.key", () => randomBytes(32).toString("base64"));
const encryptionKey = Buffer.from(encryptionKeyB64.trim(), "base64");
if (encryptionKey.length !== 32) {
  throw new Error("ENCRYPTION_KEY doit contenir 32 octets encodés en base64 (openssl rand -base64 32).");
}

if (isProd && env.DEMO_MODE) {
  throw new Error("DEMO_MODE ne doit jamais être activé en production.");
}
if (isProd && !env.COOKIE_SECURE) {
  throw new Error("COOKIE_SECURE=true est obligatoire en production (HTTPS).");
}

export const config = {
  env: env.NODE_ENV,
  isProd,
  isTest: env.NODE_ENV === "test",
  appUrl: env.APP_URL.replace(/\/$/, ""),
  port: env.API_PORT,
  demoMode: env.DEMO_MODE,
  databaseUrl: env.DATABASE_URL,
  redisUrl: env.REDIS_URL,
  jwt: { ...jwtKeys(), accessTtlSeconds: 15 * 60, refreshTtlSeconds: 7 * 24 * 3600, issuer: "nexbridge" },
  encryptionKey,
  cookieSecure: env.COOKIE_SECURE,
  storage: {
    driver: env.STORAGE_DRIVER,
    s3: { bucket: env.S3_BUCKET, region: env.S3_REGION, endpoint: env.S3_ENDPOINT, accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    localDir: path.isAbsolute(env.STORAGE_LOCAL_DIR) ? env.STORAGE_LOCAL_DIR : path.join(REPO_ROOT, env.STORAGE_LOCAL_DIR),
  },
  mail: { from: env.MAIL_FROM, sendgridKey: env.SENDGRID_API_KEY },
  oauth: {
    google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    linkedin: Boolean(env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET),
  },
  oauthCreds: {
    google: { id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET },
    linkedin: { id: env.LINKEDIN_CLIENT_ID, secret: env.LINKEDIN_CLIENT_SECRET },
  },
  stripe: { secretKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET },
  localDir: LOCAL_DIR,
} as const;
