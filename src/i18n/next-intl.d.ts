import type fr from "../../messages/fr.json";
import type { Locale } from "./locales";

// Les clés de traduction sont vérifiées à la compilation à partir du français.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof fr;
  }
}
