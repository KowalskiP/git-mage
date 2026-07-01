import { describe, it, expect } from "vitest";
import { translate, isLang, LANGS, DICT, type Lang } from "./dict";

describe("i18n", () => {
  it("ships the expected language set", () => {
    expect(LANGS.map((l) => l.code)).toEqual(["en", "ru", "de", "fr", "es", "zh"]);
  });

  it("translates known keys per language", () => {
    expect(translate("de", "settings.title")).toBe("Einstellungen");
    expect(translate("fr", "settings.title")).toBe("Paramètres");
    expect(translate("es", "settings.title")).toBe("Ajustes");
    expect(translate("zh", "settings.title")).toBe("设置");
  });

  it("falls back to the raw key when nothing matches", () => {
    expect(translate("de", "___missing___")).toBe("___missing___");
  });

  it("interpolates variables", () => {
    expect(translate("en", "update.available", { v: "1.2.3" })).toBe("Update 1.2.3 available");
    expect(translate("zh", "update.available", { v: "1.2.3" })).toContain("1.2.3");
  });

  it("isLang guards locale codes", () => {
    expect(isLang("de")).toBe(true);
    expect(isLang("xx")).toBe(false);
  });

  it("keeps git terms in English across locales", () => {
    for (const code of Object.keys(DICT) as Lang[]) {
      expect(translate(code, "settings.signing").toLowerCase()).toContain("commit");
    }
  });

  it("every locale covers all English keys", () => {
    const enKeys = Object.keys(DICT.en);
    for (const code of Object.keys(DICT) as Lang[]) {
      for (const k of enKeys) {
        expect(DICT[code][k], `${code} missing ${k}`).toBeTruthy();
      }
    }
  });
});
