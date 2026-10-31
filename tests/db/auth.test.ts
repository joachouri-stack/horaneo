import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setPlatformAdmin } from "@/db/admin-role";
import { adminTwoFactors, auditLog, authSessions, users } from "@/db/schema";
import { createAuth, type Auth } from "@/lib/auth/auth";
import { checkLoginCode, LOGIN_CODE_MAX_ATTEMPTS } from "@/lib/auth/login-code";
import { totpCodeAt } from "@/lib/auth/totp";
import {
  beginTwoFactorSetup,
  confirmTwoFactorSetup,
  getAdminSecurityState,
  verifyAdminCode,
} from "@/lib/auth/two-factor-service";
import { testOutbox } from "@/lib/email/send";
import { hasTestDatabase, openAppDb, openTestDb, pgErrorCode, type TestDb } from "../setup/db";

/**
 * Connexion de bout en bout sur une vraie base, avec le rôle restreint de
 * l'application : lien magique, création du compte, session, double
 * vérification de l'administratrice.
 */
describe.skipIf(!hasTestDatabase)("connexion", () => {
  let owner: TestDb;
  let app: TestDb;
  let auth: Auth;

  beforeAll(async () => {
    owner = await openTestDb();
    app = openAppDb();
    auth = createAuth(app);
  });

  afterAll(async () => {
    await app?.$client.end();
    await owner?.$client.end();
  });

  /** Demande un lien magique et renvoie le jeton reçu par e-mail. */
  async function requestMagicLink(email: string): Promise<string> {
    const before = testOutbox.length;
    await auth.api.signInMagicLink({
      body: { email, callbackURL: "/fr/espace" },
      headers: new Headers({ cookie: "NEXT_LOCALE=fr" }),
    });
    expect(testOutbox.length).toBe(before + 1);
    const message = testOutbox.at(-1)!;
    expect(message.to).toBe(email);
    const url = /https?:\/\/\S+/.exec(message.text)![0];
    return new URL(url).searchParams.get("token")!;
  }

  /** Ouvre le lien magique ; renvoie le cookie de session. */
  async function openMagicLink(
    token: string,
  ): Promise<{ status: number; cookie: string | null; location: string | null }> {
    const response = await auth.api.magicLinkVerify({
      query: { token, callbackURL: "/fr/espace" },
      headers: new Headers(),
      asResponse: true,
    });
    const setCookie = response.headers.get("set-cookie");
    const cookie = setCookie ? setCookie.split(";")[0] : null;
    return { status: response.status, cookie, location: response.headers.get("location") };
  }

  async function signIn(email: string) {
    const opened = await openMagicLink(await requestMagicLink(email));
    expect(opened.cookie).toBeTruthy();
    const session = await auth.api.getSession({ headers: new Headers({ cookie: opened.cookie! }) });
    expect(session).not.toBeNull();
    return { cookie: opened.cookie!, session: session! };
  }

  const uniqueEmail = (label: string) =>
    `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

  describe("lien magique", () => {
    it("envoie un e-mail en français avec un lien de connexion", async () => {
      const email = uniqueEmail("gerante");
      await requestMagicLink(email);
      const message = testOutbox.at(-1)!;
      expect(message.subject).toContain("Votre lien de connexion");
      expect(message.html).toContain("Me connecter");
      expect(message.text).toContain("15 minutes");
    });

    it("crée le compte à la première connexion, sans statut d'administratrice", async () => {
      const email = uniqueEmail("nouvelle");
      const { session } = await signIn(email);
      expect(session.user.email).toBe(email);
      const [row] = await owner.select().from(users).where(eq(users.email, email));
      expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
      expect(row.emailVerified).toBe(true);
      expect(row.isPlatformAdmin).toBe(false);
      expect(row.lastLoginAt).not.toBeNull();
    });

    it("redirige vers la page demandée après connexion", async () => {
      const opened = await openMagicLink(await requestMagicLink(uniqueEmail("redir")));
      expect(opened.status).toBe(302);
      expect(opened.location).toContain("/fr/espace");
    });

    it("retrouve le même compte à la connexion suivante", async () => {
      const email = uniqueEmail("fidele");
      const first = await signIn(email);
      const second = await signIn(email);
      expect(second.session.user.id).toBe(first.session.user.id);
    });

    it("un lien ne sert qu'une seule fois", async () => {
      const token = await requestMagicLink(uniqueEmail("unique"));
      expect((await openMagicLink(token)).cookie).toBeTruthy();
      const again = await openMagicLink(token);
      expect(again.cookie).toBeNull();
      expect(again.location).toContain("error");
    });

    it("ne stocke pas le jeton en clair", async () => {
      const token = await requestMagicLink(uniqueEmail("hache"));
      const rows = await owner.execute(
        sql`SELECT 1 FROM auth_verifications WHERE value LIKE ${"%" + token + "%"} OR identifier = ${token}`,
      );
      expect(rows).toHaveLength(0);
    });

    it("refuse un jeton inventé", async () => {
      expect((await openMagicLink("jeton-invente")).cookie).toBeNull();
    });
  });

  describe("code à 6 chiffres", () => {
    /** Code écrit dans le dernier e-mail envoyé. */
    const lastCode = () => / (\d{6})$/m.exec(testOutbox.at(-1)!.text)![1];

    it("l'e-mail contient aussi un code, qui ouvre le même lien", async () => {
      const email = uniqueEmail("code");
      const token = await requestMagicLink(email);
      const code = lastCode();
      expect(testOutbox.at(-1)!.html).toContain(code);
      const result = await checkLoginCode(email.toUpperCase(), code.replace(/(\d{3})/, "$1 "), app);
      expect(result).toEqual({ ok: true, token });
      expect((await openMagicLink(token)).cookie).toBeTruthy();
    });

    it("un code ne sert qu'une fois", async () => {
      const email = uniqueEmail("code-unique");
      await requestMagicLink(email);
      const code = lastCode();
      expect((await checkLoginCode(email, code, app)).ok).toBe(true);
      expect(await checkLoginCode(email, code, app)).toEqual({ ok: false, reason: "invalid" });
    });

    it("le code d'une autre adresse ne marche pas", async () => {
      await requestMagicLink(uniqueEmail("code-a"));
      const code = lastCode();
      const other = uniqueEmail("code-b");
      await requestMagicLink(other);
      const otherCode = lastCode();
      if (code !== otherCode) expect((await checkLoginCode(other, code, app)).ok).toBe(false);
    });

    it("bloqué après trop d'essais, même avec le bon code ensuite", async () => {
      const email = uniqueEmail("code-essais");
      await requestMagicLink(email);
      const code = lastCode();
      const wrong = code === "000000" ? "111111" : "000000";
      for (let i = 1; i < LOGIN_CODE_MAX_ATTEMPTS; i++) {
        expect(await checkLoginCode(email, wrong, app)).toEqual({ ok: false, reason: "invalid" });
      }
      expect(await checkLoginCode(email, wrong, app)).toEqual({ ok: false, reason: "locked" });
      expect((await checkLoginCode(email, code, app)).ok).toBe(false);
    });

    it("une nouvelle demande remplace l'ancien code", async () => {
      const email = uniqueEmail("code-nouveau");
      await requestMagicLink(email);
      const first = lastCode();
      await requestMagicLink(email);
      const second = lastCode();
      if (first !== second) expect((await checkLoginCode(email, first, app)).ok).toBe(false);
      expect((await checkLoginCode(email, second, app)).ok).toBe(true);
    });
  });

  describe("droits de la connexion", () => {
    it("ne permet pas de se déclarer administratrice par l'API", async () => {
      const email = uniqueEmail("ambitieuse");
      const { cookie } = await signIn(email);
      await auth.api
        .updateUser({ body: { isPlatformAdmin: true } as never, headers: new Headers({ cookie }) })
        .catch(() => undefined);
      const [row] = await owner.select().from(users).where(eq(users.email, email));
      expect(row.isPlatformAdmin).toBe(false);
    });

    it("la base refuse elle-même toute modification du statut d'administratrice", async () => {
      expect(await pgErrorCode(app.execute(sql`UPDATE users SET is_platform_admin = true`))).toBe("42501");
      expect(
        await pgErrorCode(app.execute(sql`UPDATE auth_sessions SET two_factor_verified_at = now()`)),
      ).toBe("42501");
      // Même en créant directement une ligne : le garde-fou de la base refuse.
      expect(
        await pgErrorCode(
          app.execute(
            sql`INSERT INTO users (email, is_platform_admin) VALUES (${uniqueEmail("pirate")}, true)`,
          ),
        ),
      ).toBe("42501");
      const [someUser] = await owner.select().from(users).limit(1);
      expect(
        await pgErrorCode(
          app.execute(sql`INSERT INTO auth_sessions (user_id, token, expires_at, two_factor_verified_at)
                          VALUES (${someUser.id}, ${"t-" + Date.now()}, now() + interval '1 day', now())`),
        ),
      ).toBe("42501");
    });

    it("la connexion n'a accès à aucune donnée des tenants", async () => {
      for (const table of [
        "customers",
        "appointments",
        "tenants",
        "payments",
        "audit_log",
        "admin_two_factors",
      ]) {
        expect(
          await pgErrorCode(app.execute(sql`SELECT 1 FROM ${sql.identifier(table)} LIMIT 1`)),
          table,
        ).toBe("42501");
      }
    });
  });

  describe("administratrice", () => {
    it("le statut se donne en ligne de commande et est journalisé", async () => {
      const email = uniqueEmail("admin");
      const user = await setPlatformAdmin(owner, email.toUpperCase(), true);
      expect(user.email).toBe(email);
      expect(user.isPlatformAdmin).toBe(true);
      const entries = await owner.select().from(auditLog).where(eq(auditLog.targetId, user.id));
      expect(entries.map((entry) => entry.action)).toContain("admin.granted");
    });

    it("double vérification : mise en place, connexion, codes de secours, retrait", async () => {
      const email = uniqueEmail("admin2fa");
      await setPlatformAdmin(owner, email, true);
      const { session } = await signIn(email);
      const userId = session.user.id;
      const sessionId = session.session.id;
      const options = { database: app };

      expect(await getAdminSecurityState(userId, options)).toMatchObject({
        isPlatformAdmin: true,
        twoFactorConfirmed: false,
      });

      // Mise en place : la même clé est proposée tant qu'elle n'est pas confirmée.
      const secret = await beginTwoFactorSetup(userId, options);
      expect(await beginTwoFactorSetup(userId, options)).toBe(secret);
      const [stored] = await owner.select().from(adminTwoFactors).where(eq(adminTwoFactors.userId, userId));
      expect(stored.secretEncrypted).not.toContain(secret);

      // Un mauvais code ne confirme rien.
      const t0 = Date.now();
      expect(
        await confirmTwoFactorSetup(userId, sessionId, "000000", { ...options, now: () => t0 - 10 * 60_000 }),
      ).toBeNull();

      // Le bon code confirme et donne 8 codes de secours ; la session est vérifiée.
      const backupCodes = await confirmTwoFactorSetup(userId, sessionId, totpCodeAt(secret, t0), {
        ...options,
        now: () => t0,
      });
      expect(backupCodes).toHaveLength(8);
      const [verified] = await owner.select().from(authSessions).where(eq(authSessions.id, sessionId));
      expect(verified.twoFactorVerifiedAt).not.toBeNull();
      await expect(beginTwoFactorSetup(userId, options)).rejects.toThrow(/déjà configurée/);

      // Un code déjà utilisé est refusé, le suivant est accepté.
      expect(
        await verifyAdminCode(userId, sessionId, totpCodeAt(secret, t0), { ...options, now: () => t0 }),
      ).toBe(false);
      const t1 = t0 + 30_000;
      expect(
        await verifyAdminCode(userId, sessionId, totpCodeAt(secret, t1), { ...options, now: () => t1 }),
      ).toBe(true);

      // Code de secours : accepté une seule fois.
      expect(await verifyAdminCode(userId, sessionId, backupCodes![0], options)).toBe(true);
      expect(await verifyAdminCode(userId, sessionId, backupCodes![0], options)).toBe(false);
      expect((await getAdminSecurityState(userId, options)).backupCodesLeft).toBe(7);

      // Trop d'erreurs depuis la dernière connexion (10, dont le code de secours déjà utilisé) :
      // même le bon code est refusé (compté en base, commun à tous les serveurs).
      for (let i = 0; i < 9; i += 1)
        expect(await verifyAdminCode(userId, sessionId, "000000", options)).toBe(false);
      const t2 = t1 + 30_000;
      expect(
        await verifyAdminCode(userId, sessionId, totpCodeAt(secret, t2), { ...options, now: () => t2 }),
      ).toBe("locked");

      // Tout est journalisé.
      const actions = (await owner.select().from(auditLog).where(eq(auditLog.actorUserId, userId))).map(
        (e) => e.action,
      );
      expect(actions).toEqual(
        expect.arrayContaining(["admin.two_factor_enabled", "admin.login", "admin.login_failed"]),
      );

      // Retrait du statut : double vérification et sessions supprimées.
      await setPlatformAdmin(owner, email, false);
      expect(
        await owner.select().from(adminTwoFactors).where(eq(adminTwoFactors.userId, userId)),
      ).toHaveLength(0);
      expect(await owner.select().from(authSessions).where(eq(authSessions.userId, userId))).toHaveLength(0);
    });

    it("une personne qui n'est pas administratrice ne peut pas activer la double vérification d'une autre", async () => {
      const email = uniqueEmail("autre");
      const { session } = await signIn(email);
      const state = await getAdminSecurityState(session.user.id, { database: app });
      expect(state.isPlatformAdmin).toBe(false);
    });
  });
});
