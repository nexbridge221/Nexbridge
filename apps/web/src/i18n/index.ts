import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import common from "./fr/common.json";
import landing from "./fr/landing.json";
import auth from "./fr/auth.json";
import app from "./fr/app.json";

/**
 * i18n : le français est la langue de lancement. Pour ajouter l'anglais, créez `./en/*.json`
 * (mêmes clés) et déclarez-les ci-dessous : aucun composant à modifier.
 */
void i18n.use(initReactI18next).init({
  resources: { fr: { common, landing, auth, app } },
  lng: "fr",
  fallbackLng: "fr",
  defaultNS: "common",
  ns: ["common", "landing", "auth", "app"],
  interpolation: { escapeValue: false },
  returnNull: false,
});
export default i18n;
