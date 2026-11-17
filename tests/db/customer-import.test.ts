import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@/db/access";
import * as s from "@/db/schema";
import { importCustomers } from "@/modules/customers/import";
import { decodeFile, guessColumns, mapRows, parseBirthday, parseCsv } from "@/modules/customers/import-file";
import { createTenantWithData } from "../setup/fixtures";
import { hasTestDatabase, openAppDb, openTestDb, type TestDb } from "../setup/db";

/** Lecture d'un fichier clients (sans base). */
describe("fichier clients à importer", () => {
  it("lit un CSV d'Excel en français (point-virgule, guillemets, accents en Windows-1252)", () => {
    const text =
      'Prénom;Nom;Téléphone;E-mail;Date de naissance;Remarques\r\nCamille;Martin;06 12 34 56 78;camille@example.com;14/03/1985;"Aime le thé; pas de café"\r\n\r\nZoé;;;zoe@example.com;;\r\n';
    const rows = parseCsv(text);
    expect(rows).toHaveLength(3);
    expect(rows[1][5]).toBe("Aime le thé; pas de café");
    const columns = guessColumns(rows[0]);
    expect(columns).toMatchObject({
      firstName: 0,
      lastName: 1,
      phone: 2,
      email: 3,
      birthday: 4,
      notes: 5,
      fullName: null,
    });
    const [camille, zoe] = mapRows(rows, columns);
    expect(camille).toMatchObject({
      line: 2,
      firstName: "Camille",
      lastName: "Martin",
      birthMonth: 3,
      birthDay: 14,
    });
    expect(zoe).toMatchObject({ firstName: "Zoé", email: "zoe@example.com", birthMonth: null });

    // Ancien Excel : « é » codé sur un octet (Windows-1252).
    const legacy = new Uint8Array([0x50, 0x72, 0xe9, 0x6e, 0x6f, 0x6d]).buffer;
    expect(decodeFile(legacy)).toBe("Prénom");
  });

  it("nom complet dans une seule colonne, virgules, anniversaires", () => {
    const rows = parseCsv("Client,Mobile,Mail\nCamille Martin Dupont,0612345678,c@example.com\n");
    const columns = guessColumns(rows[0]);
    expect(columns).toMatchObject({ fullName: 0, phone: 1, email: 2 });
    expect(mapRows(rows, columns)[0]).toMatchObject({ firstName: "Camille", lastName: "Martin Dupont" });
    expect(parseBirthday("1990-02-29")).toEqual({ birthMonth: 2, birthDay: 29 });
    expect(parseBirthday("31/04/1990")).toBeNull();
    expect(parseBirthday("demain")).toBeNull();
    // Numéros de ligne du fichier : lignes vides et cellules sur plusieurs lignes comprises.
    const withGaps = parseCsv('Prénom;Notes\n\nCamille;"ligne 1\nligne 2"\nNina;\n');
    const mapped = mapRows(withGaps, guessColumns(withGaps[0]));
    expect(mapped.map((row) => [row.firstName, row.line])).toEqual([
      ["Camille", 3],
      ["Nina", 5],
    ]);
  });
});

describe.skipIf(!hasTestDatabase)("import des clients", () => {
  let owner: TestDb;
  let app: TestDb;

  beforeAll(async () => {
    owner = await openTestDb();
    app = openAppDb();
  });

  afterAll(async () => {
    await app?.$client.end();
    await owner?.$client.end();
  });

  const row = (line: number, values: Partial<Parameters<typeof importCustomers>[2]["rows"][number]>) => ({
    line,
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    notes: "",
    birthMonth: null,
    birthDay: null,
    ...values,
  });

  it("crée les fiches, saute les doublons et signale les lignes incomplètes", async () => {
    const { tenant, customer } = await createTenantWithData(owner, "import");
    const report = await withTenant(
      tenant.id,
      (tx) =>
        importCustomers(tx, tenant.id, {
          consent: false,
          rows: [
            row(2, {
              firstName: "Nina",
              lastName: "Durand",
              phone: "06 11 22 33 44",
              birthMonth: 7,
              birthDay: 2,
            }),
            // Déjà présente (fixture : Camille, +33612345678 ; même e-mail).
            row(3, { firstName: "camille ", phone: "0612345678" }),
            row(4, { firstName: "Autre", email: customer.email?.toUpperCase() ?? "" }),
            // Deux fois dans le même fichier.
            row(5, { firstName: "Nina", phone: "+33611223344" }),
            row(6, { firstName: "", phone: "0611111111" }),
            row(7, { firstName: "Léa" }),
            row(8, { firstName: "Léo", phone: "12" }),
            row(9, { firstName: "Lou", email: "pas-un-email" }),
          ],
        }),
      app,
    );
    expect(report).toEqual({
      created: 1,
      duplicates: 3,
      invalid: 4,
      quotaReached: false,
      problems: [
        { line: 6, reason: "name" },
        { line: 7, reason: "contact" },
        { line: 8, reason: "phone" },
        { line: 9, reason: "email" },
      ],
    });
    const [nina] = await owner
      .select()
      .from(s.customers)
      .where(and(eq(s.customers.tenantId, tenant.id), eq(s.customers.firstName, "Nina")));
    expect(nina).toMatchObject({
      lastName: "Durand",
      phone: "+33611223344",
      birthMonth: 7,
      birthDay: 2,
      emailConsent: false,
      smsConsent: false,
    });
  });

  it("consentement confirmé par la gérante : enregistré sur les fiches importées", async () => {
    const { tenant } = await createTenantWithData(owner, "import-consent");
    await withTenant(
      tenant.id,
      (tx) =>
        importCustomers(tx, tenant.id, {
          consent: true,
          rows: [row(2, { firstName: "Inès", email: "ines@example.com" })],
        }),
      app,
    );
    const [ines] = await owner
      .select()
      .from(s.customers)
      .where(and(eq(s.customers.tenantId, tenant.id), eq(s.customers.email, "ines@example.com")));
    expect(ines).toMatchObject({ emailConsent: true, smsConsent: true });
    expect(ines.consentAt).not.toBeNull();
  });
});
