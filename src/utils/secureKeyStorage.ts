import { Preferences } from "@capacitor/preferences";
import { registerPlugin } from "@capacitor/core";
import { isAndroidNative } from "./platform";

interface SecureKeyStoragePlugin {
  set(options: { key: string; value: string }): Promise<void>;
  get(options: { key: string }): Promise<{ value: string | null }>;
  remove(options: { key: string }): Promise<void>;
}

const SecureKeyStorage = registerPlugin<SecureKeyStoragePlugin>("SecureKeyStorage");

const NSEC_KEY = "nostr_nsec";
const getAccountNsecKey = (pubkey: string) => `nostr_nsec_${pubkey}`;

async function secureSet(key: string, value: string) {
  if (isAndroidNative()) {
    await SecureKeyStorage.set({ key, value });
    await Preferences.remove({ key });
    return;
  }

  await Preferences.set({ key, value });
}

async function secureGet(key: string): Promise<string | null> {
  if (isAndroidNative()) {
    const { value } = await SecureKeyStorage.get({ key });
    return value;
  }

  const { value } = await Preferences.get({ key });
  return value;
}

async function secureRemove(key: string) {
  if (isAndroidNative()) {
    await SecureKeyStorage.remove({ key });
    await Preferences.remove({ key });
    return;
  }

  await Preferences.remove({ key });
}

async function getLegacyPreference(key: string): Promise<string | null> {
  const { value } = await Preferences.get({ key });
  return value;
}

async function removeLegacyPreference(key: string) {
  await Preferences.remove({ key });
}

export async function saveNsec(nsec: string) {
  await secureSet(NSEC_KEY, nsec);
}

export async function getNsec(): Promise<string | null> {
  return secureGet(NSEC_KEY);
}

export async function removeNsec() {
  await secureRemove(NSEC_KEY);
}

export async function getLegacyNsec(): Promise<string | null> {
  return getLegacyPreference(NSEC_KEY);
}

export async function removeLegacyNsec() {
  await removeLegacyPreference(NSEC_KEY);
}

const NIP55_PACKAGE_KEY = "nip55_package_name";
const NIP55_PUBKEY_KEY = "nip55_pubkey";

export async function saveNip55Credentials(packageName: string, pubkey: string) {
  await Preferences.set({ key: NIP55_PACKAGE_KEY, value: packageName });
  await Preferences.set({ key: NIP55_PUBKEY_KEY, value: pubkey });
}

export async function getNip55Credentials(): Promise<{ packageName: string; pubkey: string } | null> {
  const { value: packageName } = await Preferences.get({ key: NIP55_PACKAGE_KEY });
  const { value: pubkey } = await Preferences.get({ key: NIP55_PUBKEY_KEY });

  if (packageName && pubkey) {
    return { packageName, pubkey };
  }
  return null;
}

export async function removeNip55Credentials() {
  await Preferences.remove({ key: NIP55_PACKAGE_KEY });
  await Preferences.remove({ key: NIP55_PUBKEY_KEY });
}

// ---------------------------------------------------------------------------
// Per-account secure storage (multi-account support)
// Keys are namespaced by pubkey so multiple accounts can coexist.
// ---------------------------------------------------------------------------

export async function saveNsecForAccount(pubkey: string, nsec: string) {
  await secureSet(getAccountNsecKey(pubkey), nsec);
}

export async function getNsecForAccount(pubkey: string): Promise<string | null> {
  return secureGet(getAccountNsecKey(pubkey));
}

export async function removeNsecForAccount(pubkey: string) {
  await secureRemove(getAccountNsecKey(pubkey));
}

export async function getLegacyNsecForAccount(pubkey: string): Promise<string | null> {
  return getLegacyPreference(getAccountNsecKey(pubkey));
}

export async function removeLegacyNsecForAccount(pubkey: string) {
  await removeLegacyPreference(getAccountNsecKey(pubkey));
}

export async function saveNip55PkgForAccount(pubkey: string, packageName: string) {
  await Preferences.set({ key: `nip55_pkg_${pubkey}`, value: packageName });
}

export async function getNip55PkgForAccount(pubkey: string): Promise<string | null> {
  const { value } = await Preferences.get({ key: `nip55_pkg_${pubkey}` });
  return value;
}

export async function removeNip55PkgForAccount(pubkey: string) {
  await Preferences.remove({ key: `nip55_pkg_${pubkey}` });
}
