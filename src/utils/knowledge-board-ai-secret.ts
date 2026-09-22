/* 2026-09-22 由 dev 缓存编译产物机械还原：类型标注已被 esbuild 剥除，import 说明符已尽量还原。过 node --check，未做运行验证。 */
import { readDesktopSecureStore, writeDesktopSecureStore } from "/src/services/desktop-bridge.ts";
import { isRecord } from "/src/utils/knowledge-board-shared.ts";
const DATABASE_NAME = "xiaoye-secure-storage";
const DATABASE_VERSION = 1;
const STORE_NAME = "knowledge-board-ai-keys";
const LOCAL_SECRET_KEY_PREFIX = "kb-board-ai-secret";
const hasWindow = () => typeof window !== "undefined";
const hasIndexedDbSupport = () => hasWindow() && typeof window.indexedDB !== "undefined";
const getStrongCryptoSupport = () => {
  if (!hasWindow()) {
    return null;
  }
  if (!window.isSecureContext || !window.crypto?.subtle || !hasIndexedDbSupport()) {
    return null;
  }
  return window.crypto;
};
const getWeakCryptoSupport = () => {
  if (!hasWindow() || !window.crypto?.getRandomValues) {
    return null;
  }
  return window.crypto;
};
const getKeyId = (userId) => {
  return `kb-board-ai:${userId || "anonymous"}`;
};
const getLocalSecretStorageKey = (userId) => {
  return `${LOCAL_SECRET_KEY_PREFIX}:${userId || "anonymous"}`;
};
export const resolveKnowledgeBoardAiSecretSupportIssue = () => {
  if (!hasWindow()) {
    return "当前不在浏览器环境中。";
  }
  if (typeof window.localStorage === "undefined") {
    return "当前页面无法使用本地存储。";
  }
  if (typeof TextEncoder === "undefined" || typeof TextDecoder === "undefined") {
    return "当前浏览器缺少文本编解码能力。";
  }
  return "";
};
const openDatabase = () => {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, {
          keyPath: "id"
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("打开安全存储失败"));
  });
};
const runStoreOperation = async (mode, executor) => {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    executor(
      store,
      (value) => resolve(value),
      (error) => reject(error)
    );
    transaction.oncomplete = () => {
      database.close();
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error("安全存储事务失败"));
      database.close();
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error("安全存储事务中断"));
      database.close();
    };
  });
};
const arrayBufferToBase64 = (value) => {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
};
const base64ToUint8Array = (value) => {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};
const getRandomBytes = (length) => {
  const cryptoSupport = getWeakCryptoSupport();
  if (!cryptoSupport) {
    throw new Error("当前环境缺少安全随机数能力，无法保护 API Key。");
  }
  const bytes = new Uint8Array(length);
  return cryptoSupport.getRandomValues(bytes);
};
const getStoredKeyRecord = async (userId) => {
  if (!hasWindow()) {
    return null;
  }
  if (!hasIndexedDbSupport()) {
    const keyMaterial = window.localStorage.getItem(getLocalSecretStorageKey(userId));
    return keyMaterial ? {
      id: getKeyId(userId),
      keyMaterial
    } : null;
  }
  return runStoreOperation("readonly", (store, resolve, reject) => {
    const request = store.get(getKeyId(userId));
    request.onsuccess = () => {
      const result = request.result;
      resolve(result ?? null);
    };
    request.onerror = () => reject(request.error ?? new Error("读取加密密钥失败"));
  });
};
const persistKeyMaterial = async (userId, keyMaterial) => {
  if (!hasWindow()) {
    return;
  }
  if (!hasIndexedDbSupport()) {
    window.localStorage.setItem(getLocalSecretStorageKey(userId), keyMaterial);
    return;
  }
  return runStoreOperation("readwrite", (store, resolve, reject) => {
    const request = store.put({
      id: getKeyId(userId),
      keyMaterial,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("保存加密密钥失败"));
  });
};
const deleteStoredKeyRecord = async (userId) => {
  if (!hasIndexedDbSupport()) {
    return;
  }
  return runStoreOperation("readwrite", (store, resolve, reject) => {
    const request = store.delete(getKeyId(userId));
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("删除旧加密密钥材料失败"));
  });
};
const importCryptoKey = async (keyMaterial) => {
  const cryptoSupport = getStrongCryptoSupport();
  if (!cryptoSupport) {
    return null;
  }
  try {
    return await cryptoSupport.subtle.importKey("raw", base64ToUint8Array(keyMaterial), { name: "AES-GCM" }, false, [
      "encrypt",
      "decrypt"
    ]);
  } catch {
    return null;
  }
};
const createKeyMaterial = () => {
  return arrayBufferToBase64(getRandomBytes(32));
};
const resolveCryptoKeyForDecrypt = async (userId) => {
  const cryptoSupport = getStrongCryptoSupport();
  if (!cryptoSupport) {
    return null;
  }
  try {
    const storedRecord = await getStoredKeyRecord(userId);
    if (storedRecord?.keyMaterial) {
      return await importCryptoKey(storedRecord.keyMaterial);
    }
    if (storedRecord?.key) {
      return storedRecord.key;
    }
  } catch {
    return null;
  }
  return null;
};
const resolveCryptoKeyForEncrypt = async (userId) => {
  const cryptoSupport = getStrongCryptoSupport();
  if (!cryptoSupport) {
    return null;
  }
  try {
    const storedRecord = await getStoredKeyRecord(userId);
    if (storedRecord?.keyMaterial) {
      return await importCryptoKey(storedRecord.keyMaterial);
    }
    const nextKeyMaterial = createKeyMaterial();
    await persistKeyMaterial(userId, nextKeyMaterial);
    return await importCryptoKey(nextKeyMaterial);
  } catch {
    return null;
  }
};
const resolveFallbackKeyMaterial = async (userId) => {
  const storedRecord = await getStoredKeyRecord(userId);
  if (storedRecord?.keyMaterial) {
    return storedRecord.keyMaterial;
  }
  const nextKeyMaterial = createKeyMaterial();
  await persistKeyMaterial(userId, nextKeyMaterial);
  return nextKeyMaterial;
};
const xorCipherBytes = (dataBytes, keyBytes, ivBytes) => {
  const output = new Uint8Array(dataBytes.length);
  for (let index = 0; index < dataBytes.length; index += 1) {
    const keyByte = keyBytes[index % keyBytes.length] ?? 0;
    const ivByte = ivBytes[index % ivBytes.length] ?? 0;
    const saltByte = index * 31 + ivBytes.length * 17 & 255;
    output[index] = (dataBytes[index] ?? 0) ^ keyByte ^ ivByte ^ saltByte;
  }
  return output;
};
const encryptKnowledgeBoardAiSecretFallback = async (value, userId) => {
  const keyMaterial = await resolveFallbackKeyMaterial(userId);
  const keyBytes = base64ToUint8Array(keyMaterial);
  const ivBytes = getRandomBytes(16);
  const dataBytes = new TextEncoder().encode(value);
  const ciphertext = xorCipherBytes(dataBytes, keyBytes, ivBytes);
  return {
    version: 2,
    algorithm: "XOR-LOCAL",
    iv: arrayBufferToBase64(ivBytes),
    ciphertext: arrayBufferToBase64(ciphertext)
  };
};
const decryptKnowledgeBoardAiSecretFallback = async (value, userId) => {
  const storedRecord = await getStoredKeyRecord(userId);
  if (!storedRecord?.keyMaterial) {
    return "";
  }
  try {
    const keyBytes = base64ToUint8Array(storedRecord.keyMaterial);
    const ivBytes = base64ToUint8Array(value.iv);
    const dataBytes = base64ToUint8Array(value.ciphertext);
    const decryptedBytes = xorCipherBytes(dataBytes, keyBytes, ivBytes);
    return new TextDecoder().decode(decryptedBytes);
  } catch {
    return "";
  }
};
const encryptSecretLocally = async (value, userId) => {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return null;
  }
  const cryptoSupport = getStrongCryptoSupport();
  const key = await resolveCryptoKeyForEncrypt(userId);
  if (cryptoSupport && key) {
    try {
      const iv = cryptoSupport.getRandomValues(new Uint8Array(12));
      const encoded = new TextEncoder().encode(normalizedValue);
      const encrypted = await cryptoSupport.subtle.encrypt(
        {
          name: "AES-GCM",
          iv
        },
        key,
        encoded
      );
      return {
        version: 1,
        algorithm: "AES-GCM",
        iv: arrayBufferToBase64(iv),
        ciphertext: arrayBufferToBase64(encrypted)
      };
    } catch {
      return null;
    }
  }
  return encryptKnowledgeBoardAiSecretFallback(normalizedValue, userId);
};
const decryptSecretLocally = async (value, userId) => {
  if (value.algorithm === "XOR-LOCAL" || value.version === 2) {
    return decryptKnowledgeBoardAiSecretFallback(value, userId);
  }
  const cryptoSupport = getStrongCryptoSupport();
  const key = await resolveCryptoKeyForDecrypt(userId);
  if (!cryptoSupport || !key) {
    return "";
  }
  try {
    const decrypted = await cryptoSupport.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64ToUint8Array(value.iv)
      },
      key,
      base64ToUint8Array(value.ciphertext)
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return "";
  }
};
const DESKTOP_HANDLE_PREFIX = "safe-store:";
const digestHex = async (value) => {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    try {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    } catch {
    }
  }
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};
const buildDesktopSecretStorageKey = async (userId, plaintext) => {
  const digest = await digestHex(plaintext);
  return `${getKeyId(userId)}:${digest}`;
};
const createDesktopHandleSecret = (storageKey) => ({
  version: 1,
  algorithm: "AES-GCM",
  iv: "",
  ciphertext: `${DESKTOP_HANDLE_PREFIX}${storageKey}`
});
const isDesktopHandleSecret = (value) => value.iv === "" && value.ciphertext.startsWith(DESKTOP_HANDLE_PREFIX);
const resolveDesktopHandleStorageKey = (value) => value.ciphertext.slice(DESKTOP_HANDLE_PREFIX.length);
const DESKTOP_PROBE_STORAGE_KEY = "__xiaoye-secure-store-probe__";
let secretBackendKindPromise = null;
const resolveSecretBackendKind = () => {
  if (!secretBackendKindPromise) {
    secretBackendKindPromise = (async () => {
      const probe = await readDesktopSecureStore(DESKTOP_PROBE_STORAGE_KEY);
      return probe.reason === "no-desktop-bridge" || probe.reason === "unavailable" ? "local-obfuscated" : "desktop-safe-store";
    })().catch(() => "local-obfuscated");
  }
  return secretBackendKindPromise;
};
export const isLocalObfuscatedStorage = async () => {
  return await resolveSecretBackendKind() === "local-obfuscated";
};
const encryptSecretViaDesktop = async (normalizedValue, userId) => {
  const storageKey = await buildDesktopSecretStorageKey(userId, normalizedValue);
  const outcome = await writeDesktopSecureStore(storageKey, normalizedValue);
  if (!outcome.ok) {
    return encryptSecretLocally(normalizedValue, userId);
  }
  return createDesktopHandleSecret(storageKey);
};
const decryptSecretViaDesktop = async (value) => {
  const storageKey = resolveDesktopHandleStorageKey(value);
  if (!storageKey) {
    return "";
  }
  const outcome = await readDesktopSecureStore(storageKey);
  return outcome.value ?? "";
};
const CONFIG_RECORD_STORAGE_KEY_PREFIX = "kb-board-ai-config:";
const getBoardAiConfigRecordStorageKey = (userId) => `${CONFIG_RECORD_STORAGE_KEY_PREFIX}${userId || "anonymous"}`;
const readBoardAiConfigRecord = (userId) => {
  if (!hasWindow() || typeof window.localStorage === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(getBoardAiConfigRecordStorageKey(userId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed) || !Array.isArray(parsed.profiles)) {
      return null;
    }
    return { profiles: parsed.profiles };
  } catch {
    return null;
  }
};
const isRecordedSecret = (value) => isRecord(value) && typeof value.iv === "string" && typeof value.ciphertext === "string";
const isDesktopHandleRecordSecret = (value) => value.iv === "" && value.ciphertext.startsWith(DESKTOP_HANDLE_PREFIX);
const getSecretFingerprint = (value) => `${value.iv}|${value.ciphertext}`;
const recordHasLegacySecret = (record) => (record.profiles ?? []).some((profile) => {
  const secret = isRecord(profile) ? profile.encryptedApiKey : void 0;
  return isRecordedSecret(secret) && !isDesktopHandleRecordSecret(secret);
});
const replaceLegacySecretInConfigRecord = (userId, fingerprint, handle) => {
  const record = readBoardAiConfigRecord(userId);
  if (!record) {
    return false;
  }
  let replaced = false;
  for (const profile of record.profiles ?? []) {
    if (!isRecord(profile)) {
      continue;
    }
    const secret = profile.encryptedApiKey;
    if (isRecordedSecret(secret) && !isDesktopHandleRecordSecret(secret) && getSecretFingerprint(secret) === fingerprint) {
      profile.encryptedApiKey = handle;
      replaced = true;
    }
  }
  if (!replaced) {
    return false;
  }
  try {
    window.localStorage.setItem(getBoardAiConfigRecordStorageKey(userId), JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
};
const deleteLegacySecretMaterial = async (userId) => {
  if (hasWindow()) {
    try {
      window.localStorage.removeItem(getLocalSecretStorageKey(userId));
    } catch {
    }
  }
  try {
    await deleteStoredKeyRecord(userId);
  } catch {
  }
};
const deleteLegacySecretMaterialWhenDrained = async (userId) => {
  const record = readBoardAiConfigRecord(userId);
  if (record && recordHasLegacySecret(record)) {
    return;
  }
  await deleteLegacySecretMaterial(userId);
};
const drainedCheckDoneUsers = /* @__PURE__ */ new Set();
const cleanupLegacySecretMaterialOnce = async (userId) => {
  const userKey = userId || "anonymous";
  if (drainedCheckDoneUsers.has(userKey)) {
    return;
  }
  drainedCheckDoneUsers.add(userKey);
  const record = readBoardAiConfigRecord(userId);
  if (record && !recordHasLegacySecret(record)) {
    await deleteLegacySecretMaterial(userId);
  }
};
const migrateLegacySecretViaDesktop = async (value, userId) => {
  const plaintext = await decryptSecretLocally(value, userId);
  const fingerprint = getSecretFingerprint(value);
  const storageKey = await buildDesktopSecretStorageKey(userId, plaintext || fingerprint);
  let rewritten = false;
  if (plaintext) {
    const outcome = await writeDesktopSecureStore(storageKey, plaintext);
    if (outcome.ok) {
      rewritten = replaceLegacySecretInConfigRecord(userId, fingerprint, createDesktopHandleSecret(storageKey));
    }
  } else {
    rewritten = replaceLegacySecretInConfigRecord(userId, fingerprint, createDesktopHandleSecret(storageKey));
  }
  if (rewritten) {
    await deleteLegacySecretMaterialWhenDrained(userId);
  }
  return plaintext;
};
export const encryptKnowledgeBoardAiSecret = async (value, userId) => {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return null;
  }
  if (await resolveSecretBackendKind() === "desktop-safe-store") {
    return encryptSecretViaDesktop(normalizedValue, userId);
  }
  return encryptSecretLocally(normalizedValue, userId);
};
export const decryptKnowledgeBoardAiSecret = async (value, userId) => {
  if (!value) {
    return "";
  }
  if (await resolveSecretBackendKind() === "desktop-safe-store") {
    if (isDesktopHandleSecret(value)) {
      await cleanupLegacySecretMaterialOnce(userId);
      return decryptSecretViaDesktop(value);
    }
    return migrateLegacySecretViaDesktop(value, userId);
  }
  return decryptSecretLocally(value, userId);
};

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImtub3dsZWRnZS1ib2FyZC1haS1zZWNyZXQudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiDmj5Dkvpvnn6Xor4bnlLvmnb8gQUkg5a+G6ZKl55qE5a2Y5YKo6IO95Yqb77yIRzQg5a2Y5YKo5ZCO56uv5oq96LGh77yJ44CCXG4gKlxuICogLSAqKuahjOmdouerryoq77yaYHdpbmRvdy54aWFveWVEZXNrdG9wYCDlj6/nlKjkuJTkuLvov5vnqIsgc2FmZVN0b3JhZ2Ug5Yqg5a+G5Y+v55So5pe277yM5piO5paHXG4gKiAgIGFwaUtleSDnm7TmjqXnu48gSVBDIOS6pOe7meS4u+i/m+eoi++8jOeUsSBPUyDnuqfog73lipvvvIhtYWNPUyBLZXljaGFpbiAvIFdpbmRvd3MgRFBBUEkgL1xuICogICBMaW51eCBsaWJzZWNyZXTvvInliqDlr4bokL0gYHVzZXJEYXRhL3NlY3VyZS1zdG9yZS5qc29uYO+8jOS4jeWGjemcgOimgea4suafk+WxgiBBRVMtR0NNXG4gKiAgIOi/meWxguacrOWcsOa3t+a3huOAgmxvY2FsU3RvcmFnZSDnmoTphY3nva7orrDlvZXlj6rkv53lrZjmjIflkJHmp73kvY3nmoTjgIzlj6Xmn4TjgI3vvIhzYWZlLXN0b3JlOiDliY3nvIDvvInjgIJcbiAqIC0gKipXZWIg56uvKirvvJrnu7TmjIHml6LmnInlrp7njrDigJTigJTlr4bpkqXmnZDmlpnlrZggSW5kZXhlZERC77yIeGlhb3llLXNlY3VyZS1zdG9yYWdl77yJ44CBXG4gKiAgIEFFUy1HQ00g5a+G5paH5a2YIGxvY2FsU3RvcmFnZe+8m+e8uiBJbmRleGVkREIgLyDpnZ7lronlhajkuIrkuIvmlofml7blm57pgIAgWE9SIOWFvOWuuea3t+a3huOAglxuICogICDlj6/nlKggYGlzTG9jYWxPYmZ1c2NhdGVkU3RvcmFnZSgpYCDmjqLmtYvlvZPliY3mmK/lkKbkuLrmnKzlnLDmt7fmt4blrZjlgqjvvIjphY3nva4gVUkg5o+Q56S655So77yJ44CCXG4gKiAtICoq5a2Y6YeP6L+B56e7KirvvJrmoYzpnaLnq6/pppbor7vliLAgV2ViIOagvOW8j+aXp+WvhuaWh+aXtu+8jOeUqOaXp+WvhumSpeadkOaWmeino+WHuuaYjuaWhyDihpIg5YaZ5YWl5Li76L+b56iLXG4gKiAgIOKGkiDmiorphY3nva7orrDlvZXmlLnlhpnkuLrlj6Xmn4Qg4oaSIOmFjee9ruiusOW9lemHjOWGjeaXoCBXZWIg5qC85byP5a+G5paH5pe25Yig6Zmk5pen5a+G6ZKl5p2Q5paZXG4gKiAgIO+8iOS4gOasoeaAp+OAgemdmem7mO+8m+WkmuS7vemFjee9ruWFseS6q+WQjOS4gOS7veWvhumSpeadkOaWme+8jOWboOatpOS7peOAjOWFqOmDqOi/geenu+WujOOAjeS4uuWIoOmZpOaXtuacuu+8ieOAglxuICpcbiAqIOWHuuWPoyBgZW5jcnlwdEtub3dsZWRnZUJvYXJkQWlTZWNyZXRgIC8gYGRlY3J5cHRLbm93bGVkZ2VCb2FyZEFpU2VjcmV0YCDnrb7lkI3kuI5cbiAqIOi/lOWbnuW9oueKtuS4jeWPmO+8jGB1dGlscy9rbm93bGVkZ2UtYm9hcmQtYWktY29uZmlnLnRzYCDnrYnmtojotLnmlrnpm7bmlLnliqjjgIJcbiAqL1xuXG5pbXBvcnQgdHlwZSB7IEtub3dsZWRnZUJvYXJkQWlFbmNyeXB0ZWRTZWNyZXQgfSBmcm9tIFwiQC90eXBlcy9rbm93bGVkZ2UtYm9hcmQtYWlcIlxuaW1wb3J0IHsgcmVhZERlc2t0b3BTZWN1cmVTdG9yZSwgd3JpdGVEZXNrdG9wU2VjdXJlU3RvcmUgfSBmcm9tIFwiQC9zZXJ2aWNlcy9kZXNrdG9wLWJyaWRnZVwiXG5pbXBvcnQgeyBpc1JlY29yZCB9IGZyb20gXCJAL3V0aWxzL2tub3dsZWRnZS1ib2FyZC1zaGFyZWRcIlxuXG4vKiogSW5kZXhlZERCIOS4reS/neWtmOWvhumSpeadkOaWmeaXtuS9v+eUqOeahOaVsOaNruW6k+WQjeOAgiAqL1xuY29uc3QgREFUQUJBU0VfTkFNRSA9IFwieGlhb3llLXNlY3VyZS1zdG9yYWdlXCJcbi8qKiDlronlhajlrZjlgqjmlbDmja7lupPnmoTnu5PmnoTniYjmnKzlj7fjgIIgKi9cbmNvbnN0IERBVEFCQVNFX1ZFUlNJT04gPSAxXG4vKiogSW5kZXhlZERCIOS4reS/neWtmOWvhumSpeadkOaWmeeahOWvueixoeS7k+W6k+WQjeensOOAgiAqL1xuY29uc3QgU1RPUkVfTkFNRSA9IFwia25vd2xlZGdlLWJvYXJkLWFpLWtleXNcIlxuLyoqIOS4jeaUr+aMgSBJbmRleGVkREIg5pe25Zue6YCA5YiwIGxvY2FsU3RvcmFnZSDnmoTlrZjlgqjplK7liY3nvIDjgIIgKi9cbmNvbnN0IExPQ0FMX1NFQ1JFVF9LRVlfUFJFRklYID0gXCJrYi1ib2FyZC1haS1zZWNyZXRcIlxuXG5pbnRlcmZhY2UgS25vd2xlZGdlQm9hcmRBaUtleVJlY29yZCB7XG4gIGlkOiBzdHJpbmdcbiAga2V5TWF0ZXJpYWw/OiBzdHJpbmdcbiAga2V5PzogQ3J5cHRvS2V5XG4gIHVwZGF0ZWRBdD86IHN0cmluZ1xufVxuXG5jb25zdCBoYXNXaW5kb3cgPSAoKSA9PiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiXG5cbmNvbnN0IGhhc0luZGV4ZWREYlN1cHBvcnQgPSAoKSA9PiBoYXNXaW5kb3coKSAmJiB0eXBlb2Ygd2luZG93LmluZGV4ZWREQiAhPT0gXCJ1bmRlZmluZWRcIlxuXG5jb25zdCBnZXRTdHJvbmdDcnlwdG9TdXBwb3J0ID0gKCkgPT4ge1xuICBpZiAoIWhhc1dpbmRvdygpKSB7XG4gICAgcmV0dXJuIG51bGxcbiAgfVxuXG4gIGlmICghd2luZG93LmlzU2VjdXJlQ29udGV4dCB8fCAhd2luZG93LmNyeXB0bz8uc3VidGxlIHx8ICFoYXNJbmRleGVkRGJTdXBwb3J0KCkpIHtcbiAgICByZXR1cm4gbnVsbFxuICB9XG5cbiAgcmV0dXJuIHdpbmRvdy5jcnlwdG9cbn1cblxuY29uc3QgZ2V0V2Vha0NyeXB0b1N1cHBvcnQgPSAoKSA9PiB7XG4gIGlmICghaGFzV2luZG93KCkgfHwgIXdpbmRvdy5jcnlwdG8/LmdldFJhbmRvbVZhbHVlcykge1xuICAgIHJldHVybiBudWxsXG4gIH1cblxuICByZXR1cm4gd2luZG93LmNyeXB0b1xufVxuXG5jb25zdCBnZXRLZXlJZCA9ICh1c2VySWQ/OiBzdHJpbmcgfCBudWxsKSA9PiB7XG4gIHJldHVybiBga2ItYm9hcmQtYWk6JHt1c2VySWQgfHwgXCJhbm9ueW1vdXNcIn1gXG59XG5cbmNvbnN0IGdldExvY2FsU2VjcmV0U3RvcmFnZUtleSA9ICh1c2VySWQ/OiBzdHJpbmcgfCBudWxsKSA9PiB7XG4gIHJldHVybiBgJHtMT0NBTF9TRUNSRVRfS0VZX1BSRUZJWH06JHt1c2VySWQgfHwgXCJhbm9ueW1vdXNcIn1gXG59XG5cbi8qKiDov5Tlm57lvZPliY3mtY/op4jlmajnjq/looPml6Dms5XlronlhajlrZjlgqjlr4bpkqXml7bnmoTljp/lm6Dor7TmmI7jgIIgKi9cbmV4cG9ydCBjb25zdCByZXNvbHZlS25vd2xlZGdlQm9hcmRBaVNlY3JldFN1cHBvcnRJc3N1ZSA9ICgpID0+IHtcbiAgaWYgKCFoYXNXaW5kb3coKSkge1xuICAgIHJldHVybiBcIuW9k+WJjeS4jeWcqOa1j+iniOWZqOeOr+Wig+S4reOAglwiXG4gIH1cblxuICBpZiAodHlwZW9mIHdpbmRvdy5sb2NhbFN0b3JhZ2UgPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICByZXR1cm4gXCLlvZPliY3pobXpnaLml6Dms5Xkvb/nlKjmnKzlnLDlrZjlgqjjgIJcIlxuICB9XG5cbiAgaWYgKHR5cGVvZiBUZXh0RW5jb2RlciA9PT0gXCJ1bmRlZmluZWRcIiB8fCB0eXBlb2YgVGV4dERlY29kZXIgPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICByZXR1cm4gXCLlvZPliY3mtY/op4jlmajnvLrlsJHmlofmnKznvJbop6PnoIHog73lipvjgIJcIlxuICB9XG5cbiAgcmV0dXJuIFwiXCJcbn1cblxuY29uc3Qgb3BlbkRhdGFiYXNlID0gKCkgPT4ge1xuICByZXR1cm4gbmV3IFByb21pc2U8SURCRGF0YWJhc2U+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCByZXF1ZXN0ID0gd2luZG93LmluZGV4ZWREQi5vcGVuKERBVEFCQVNFX05BTUUsIERBVEFCQVNFX1ZFUlNJT04pXG5cbiAgICByZXF1ZXN0Lm9udXBncmFkZW5lZWRlZCA9ICgpID0+IHtcbiAgICAgIGNvbnN0IGRhdGFiYXNlID0gcmVxdWVzdC5yZXN1bHRcblxuICAgICAgaWYgKCFkYXRhYmFzZS5vYmplY3RTdG9yZU5hbWVzLmNvbnRhaW5zKFNUT1JFX05BTUUpKSB7XG4gICAgICAgIGRhdGFiYXNlLmNyZWF0ZU9iamVjdFN0b3JlKFNUT1JFX05BTUUsIHtcbiAgICAgICAgICBrZXlQYXRoOiBcImlkXCIsXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgfVxuXG4gICAgcmVxdWVzdC5vbnN1Y2Nlc3MgPSAoKSA9PiByZXNvbHZlKHJlcXVlc3QucmVzdWx0KVxuICAgIHJlcXVlc3Qub25lcnJvciA9ICgpID0+IHJlamVjdChyZXF1ZXN0LmVycm9yID8/IG5ldyBFcnJvcihcIuaJk+W8gOWuieWFqOWtmOWCqOWksei0pVwiKSlcbiAgfSlcbn1cblxuY29uc3QgcnVuU3RvcmVPcGVyYXRpb24gPSBhc3luYyA8VD4oXG4gIG1vZGU6IElEQlRyYW5zYWN0aW9uTW9kZSxcbiAgZXhlY3V0b3I6IChzdG9yZTogSURCT2JqZWN0U3RvcmUsIHJlc29sdmU6ICh2YWx1ZTogVCkgPT4gdm9pZCwgcmVqZWN0OiAoZXJyb3I6IHVua25vd24pID0+IHZvaWQpID0+IHZvaWRcbikgPT4ge1xuICBjb25zdCBkYXRhYmFzZSA9IGF3YWl0IG9wZW5EYXRhYmFzZSgpXG5cbiAgcmV0dXJuIG5ldyBQcm9taXNlPFQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCB0cmFuc2FjdGlvbiA9IGRhdGFiYXNlLnRyYW5zYWN0aW9uKFNUT1JFX05BTUUsIG1vZGUpXG4gICAgY29uc3Qgc3RvcmUgPSB0cmFuc2FjdGlvbi5vYmplY3RTdG9yZShTVE9SRV9OQU1FKVxuXG4gICAgZXhlY3V0b3IoXG4gICAgICBzdG9yZSxcbiAgICAgIHZhbHVlID0+IHJlc29sdmUodmFsdWUpLFxuICAgICAgZXJyb3IgPT4gcmVqZWN0KGVycm9yKVxuICAgIClcblxuICAgIHRyYW5zYWN0aW9uLm9uY29tcGxldGUgPSAoKSA9PiB7XG4gICAgICBkYXRhYmFzZS5jbG9zZSgpXG4gICAgfVxuXG4gICAgdHJhbnNhY3Rpb24ub25lcnJvciA9ICgpID0+IHtcbiAgICAgIHJlamVjdCh0cmFuc2FjdGlvbi5lcnJvciA/PyBuZXcgRXJyb3IoXCLlronlhajlrZjlgqjkuovliqHlpLHotKVcIikpXG4gICAgICBkYXRhYmFzZS5jbG9zZSgpXG4gICAgfVxuXG4gICAgdHJhbnNhY3Rpb24ub25hYm9ydCA9ICgpID0+IHtcbiAgICAgIHJlamVjdCh0cmFuc2FjdGlvbi5lcnJvciA/PyBuZXcgRXJyb3IoXCLlronlhajlrZjlgqjkuovliqHkuK3mlq1cIikpXG4gICAgICBkYXRhYmFzZS5jbG9zZSgpXG4gICAgfVxuICB9KVxufVxuXG5jb25zdCBhcnJheUJ1ZmZlclRvQmFzZTY0ID0gKHZhbHVlOiBBcnJheUJ1ZmZlciB8IFVpbnQ4QXJyYXkpID0+IHtcbiAgY29uc3QgYnl0ZXMgPSB2YWx1ZSBpbnN0YW5jZW9mIFVpbnQ4QXJyYXkgPyB2YWx1ZSA6IG5ldyBVaW50OEFycmF5KHZhbHVlKVxuICBsZXQgYmluYXJ5ID0gXCJcIlxuXG4gIGJ5dGVzLmZvckVhY2goYnl0ZSA9PiB7XG4gICAgYmluYXJ5ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnl0ZSlcbiAgfSlcblxuICByZXR1cm4gd2luZG93LmJ0b2EoYmluYXJ5KVxufVxuXG5jb25zdCBiYXNlNjRUb1VpbnQ4QXJyYXkgPSAodmFsdWU6IHN0cmluZykgPT4ge1xuICBjb25zdCBiaW5hcnkgPSB3aW5kb3cuYXRvYih2YWx1ZSlcbiAgY29uc3QgYnl0ZXMgPSBuZXcgVWludDhBcnJheShiaW5hcnkubGVuZ3RoKVxuXG4gIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBiaW5hcnkubGVuZ3RoOyBpbmRleCArPSAxKSB7XG4gICAgYnl0ZXNbaW5kZXhdID0gYmluYXJ5LmNoYXJDb2RlQXQoaW5kZXgpXG4gIH1cblxuICByZXR1cm4gYnl0ZXNcbn1cblxuLyoqIOWPluWuieWFqOmaj+acuuWtl+iKgu+8muWvhumSpeadkOaWmeS4jiBJViDpg73kuI3lhYHorrjlvLHnhrXpmY3nuqfvvIznjq/looPkuI3mlK/mjIHml7bnm7TmjqXlpLHotKXjgIIgKi9cbmNvbnN0IGdldFJhbmRvbUJ5dGVzID0gKGxlbmd0aDogbnVtYmVyKSA9PiB7XG4gIGNvbnN0IGNyeXB0b1N1cHBvcnQgPSBnZXRXZWFrQ3J5cHRvU3VwcG9ydCgpXG5cbiAgaWYgKCFjcnlwdG9TdXBwb3J0KSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwi5b2T5YmN546v5aKD57y65bCR5a6J5YWo6ZqP5py65pWw6IO95Yqb77yM5peg5rOV5L+d5oqkIEFQSSBLZXnjgIJcIilcbiAgfVxuXG4gIGNvbnN0IGJ5dGVzID0gbmV3IFVpbnQ4QXJyYXkobGVuZ3RoKVxuICByZXR1cm4gY3J5cHRvU3VwcG9ydC5nZXRSYW5kb21WYWx1ZXMoYnl0ZXMpXG59XG5cbmNvbnN0IGdldFN0b3JlZEtleVJlY29yZCA9IGFzeW5jICh1c2VySWQ/OiBzdHJpbmcgfCBudWxsKSA9PiB7XG4gIGlmICghaGFzV2luZG93KCkpIHtcbiAgICByZXR1cm4gbnVsbFxuICB9XG5cbiAgaWYgKCFoYXNJbmRleGVkRGJTdXBwb3J0KCkpIHtcbiAgICBjb25zdCBrZXlNYXRlcmlhbCA9IHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbShnZXRMb2NhbFNlY3JldFN0b3JhZ2VLZXkodXNlcklkKSlcblxuICAgIHJldHVybiBrZXlNYXRlcmlhbFxuICAgICAgPyAoe1xuICAgICAgICAgIGlkOiBnZXRLZXlJZCh1c2VySWQpLFxuICAgICAgICAgIGtleU1hdGVyaWFsLFxuICAgICAgICB9IHNhdGlzZmllcyBLbm93bGVkZ2VCb2FyZEFpS2V5UmVjb3JkKVxuICAgICAgOiBudWxsXG4gIH1cblxuICByZXR1cm4gcnVuU3RvcmVPcGVyYXRpb248S25vd2xlZGdlQm9hcmRBaUtleVJlY29yZCB8IG51bGw+KFwicmVhZG9ubHlcIiwgKHN0b3JlLCByZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCByZXF1ZXN0ID0gc3RvcmUuZ2V0KGdldEtleUlkKHVzZXJJZCkpXG5cbiAgICByZXF1ZXN0Lm9uc3VjY2VzcyA9ICgpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IHJlcXVlc3QucmVzdWx0IGFzIEtub3dsZWRnZUJvYXJkQWlLZXlSZWNvcmQgfCB1bmRlZmluZWRcbiAgICAgIHJlc29sdmUocmVzdWx0ID8/IG51bGwpXG4gICAgfVxuXG4gICAgcmVxdWVzdC5vbmVycm9yID0gKCkgPT4gcmVqZWN0KHJlcXVlc3QuZXJyb3IgPz8gbmV3IEVycm9yKFwi6K+75Y+W5Yqg5a+G5a+G6ZKl5aSx6LSlXCIpKVxuICB9KVxufVxuXG5jb25zdCBwZXJzaXN0S2V5TWF0ZXJpYWwgPSBhc3luYyAodXNlcklkOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLCBrZXlNYXRlcmlhbDogc3RyaW5nKSA9PiB7XG4gIGlmICghaGFzV2luZG93KCkpIHtcbiAgICByZXR1cm5cbiAgfVxuXG4gIGlmICghaGFzSW5kZXhlZERiU3VwcG9ydCgpKSB7XG4gICAgd2luZG93LmxvY2FsU3RvcmFnZS5zZXRJdGVtKGdldExvY2FsU2VjcmV0U3RvcmFnZUtleSh1c2VySWQpLCBrZXlNYXRlcmlhbClcbiAgICByZXR1cm5cbiAgfVxuXG4gIHJldHVybiBydW5TdG9yZU9wZXJhdGlvbjx2b2lkPihcInJlYWR3cml0ZVwiLCAoc3RvcmUsIHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHJlcXVlc3QgPSBzdG9yZS5wdXQoe1xuICAgICAgaWQ6IGdldEtleUlkKHVzZXJJZCksXG4gICAgICBrZXlNYXRlcmlhbCxcbiAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgIH0pXG5cbiAgICByZXF1ZXN0Lm9uc3VjY2VzcyA9ICgpID0+IHJlc29sdmUoKVxuICAgIHJlcXVlc3Qub25lcnJvciA9ICgpID0+IHJlamVjdChyZXF1ZXN0LmVycm9yID8/IG5ldyBFcnJvcihcIuS/neWtmOWKoOWvhuWvhumSpeWksei0pVwiKSlcbiAgfSlcbn1cblxuLyoqIOWIoOmZpCBJbmRleGVkREIg5Lit55qE5pen5a+G6ZKl5p2Q5paZ6K6w5b2V77yI5a2Y6YeP6L+B56e75pS25bC+55So77yJ44CCICovXG5jb25zdCBkZWxldGVTdG9yZWRLZXlSZWNvcmQgPSBhc3luYyAodXNlcklkPzogc3RyaW5nIHwgbnVsbCkgPT4ge1xuICBpZiAoIWhhc0luZGV4ZWREYlN1cHBvcnQoKSkge1xuICAgIHJldHVyblxuICB9XG5cbiAgcmV0dXJuIHJ1blN0b3JlT3BlcmF0aW9uPHZvaWQ+KFwicmVhZHdyaXRlXCIsIChzdG9yZSwgcmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgcmVxdWVzdCA9IHN0b3JlLmRlbGV0ZShnZXRLZXlJZCh1c2VySWQpKVxuXG4gICAgcmVxdWVzdC5vbnN1Y2Nlc3MgPSAoKSA9PiByZXNvbHZlKClcbiAgICByZXF1ZXN0Lm9uZXJyb3IgPSAoKSA9PiByZWplY3QocmVxdWVzdC5lcnJvciA/PyBuZXcgRXJyb3IoXCLliKDpmaTml6fliqDlr4blr4bpkqXmnZDmlpnlpLHotKVcIikpXG4gIH0pXG59XG5cbmNvbnN0IGltcG9ydENyeXB0b0tleSA9IGFzeW5jIChrZXlNYXRlcmlhbDogc3RyaW5nKSA9PiB7XG4gIGNvbnN0IGNyeXB0b1N1cHBvcnQgPSBnZXRTdHJvbmdDcnlwdG9TdXBwb3J0KClcblxuICBpZiAoIWNyeXB0b1N1cHBvcnQpIHtcbiAgICByZXR1cm4gbnVsbFxuICB9XG5cbiAgdHJ5IHtcbiAgICByZXR1cm4gYXdhaXQgY3J5cHRvU3VwcG9ydC5zdWJ0bGUuaW1wb3J0S2V5KFwicmF3XCIsIGJhc2U2NFRvVWludDhBcnJheShrZXlNYXRlcmlhbCksIHsgbmFtZTogXCJBRVMtR0NNXCIgfSwgZmFsc2UsIFtcbiAgICAgIFwiZW5jcnlwdFwiLFxuICAgICAgXCJkZWNyeXB0XCIsXG4gICAgXSlcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIG51bGxcbiAgfVxufVxuXG5jb25zdCBjcmVhdGVLZXlNYXRlcmlhbCA9ICgpID0+IHtcbiAgcmV0dXJuIGFycmF5QnVmZmVyVG9CYXNlNjQoZ2V0UmFuZG9tQnl0ZXMoMzIpKVxufVxuXG5jb25zdCByZXNvbHZlQ3J5cHRvS2V5Rm9yRGVjcnlwdCA9IGFzeW5jICh1c2VySWQ/OiBzdHJpbmcgfCBudWxsKSA9PiB7XG4gIGNvbnN0IGNyeXB0b1N1cHBvcnQgPSBnZXRTdHJvbmdDcnlwdG9TdXBwb3J0KClcblxuICBpZiAoIWNyeXB0b1N1cHBvcnQpIHtcbiAgICByZXR1cm4gbnVsbFxuICB9XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBzdG9yZWRSZWNvcmQgPSBhd2FpdCBnZXRTdG9yZWRLZXlSZWNvcmQodXNlcklkKVxuXG4gICAgaWYgKHN0b3JlZFJlY29yZD8ua2V5TWF0ZXJpYWwpIHtcbiAgICAgIHJldHVybiBhd2FpdCBpbXBvcnRDcnlwdG9LZXkoc3RvcmVkUmVjb3JkLmtleU1hdGVyaWFsKVxuICAgIH1cblxuICAgIGlmIChzdG9yZWRSZWNvcmQ/LmtleSkge1xuICAgICAgcmV0dXJuIHN0b3JlZFJlY29yZC5rZXlcbiAgICB9XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBudWxsXG4gIH1cblxuICByZXR1cm4gbnVsbFxufVxuXG5jb25zdCByZXNvbHZlQ3J5cHRvS2V5Rm9yRW5jcnlwdCA9IGFzeW5jICh1c2VySWQ/OiBzdHJpbmcgfCBudWxsKSA9PiB7XG4gIGNvbnN0IGNyeXB0b1N1cHBvcnQgPSBnZXRTdHJvbmdDcnlwdG9TdXBwb3J0KClcblxuICBpZiAoIWNyeXB0b1N1cHBvcnQpIHtcbiAgICByZXR1cm4gbnVsbFxuICB9XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBzdG9yZWRSZWNvcmQgPSBhd2FpdCBnZXRTdG9yZWRLZXlSZWNvcmQodXNlcklkKVxuXG4gICAgaWYgKHN0b3JlZFJlY29yZD8ua2V5TWF0ZXJpYWwpIHtcbiAgICAgIHJldHVybiBhd2FpdCBpbXBvcnRDcnlwdG9LZXkoc3RvcmVkUmVjb3JkLmtleU1hdGVyaWFsKVxuICAgIH1cblxuICAgIGNvbnN0IG5leHRLZXlNYXRlcmlhbCA9IGNyZWF0ZUtleU1hdGVyaWFsKClcblxuICAgIGF3YWl0IHBlcnNpc3RLZXlNYXRlcmlhbCh1c2VySWQsIG5leHRLZXlNYXRlcmlhbClcbiAgICByZXR1cm4gYXdhaXQgaW1wb3J0Q3J5cHRvS2V5KG5leHRLZXlNYXRlcmlhbClcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIG51bGxcbiAgfVxufVxuXG5jb25zdCByZXNvbHZlRmFsbGJhY2tLZXlNYXRlcmlhbCA9IGFzeW5jICh1c2VySWQ/OiBzdHJpbmcgfCBudWxsKSA9PiB7XG4gIGNvbnN0IHN0b3JlZFJlY29yZCA9IGF3YWl0IGdldFN0b3JlZEtleVJlY29yZCh1c2VySWQpXG5cbiAgaWYgKHN0b3JlZFJlY29yZD8ua2V5TWF0ZXJpYWwpIHtcbiAgICByZXR1cm4gc3RvcmVkUmVjb3JkLmtleU1hdGVyaWFsXG4gIH1cblxuICBjb25zdCBuZXh0S2V5TWF0ZXJpYWwgPSBjcmVhdGVLZXlNYXRlcmlhbCgpXG4gIGF3YWl0IHBlcnNpc3RLZXlNYXRlcmlhbCh1c2VySWQsIG5leHRLZXlNYXRlcmlhbClcbiAgcmV0dXJuIG5leHRLZXlNYXRlcmlhbFxufVxuXG5jb25zdCB4b3JDaXBoZXJCeXRlcyA9IChkYXRhQnl0ZXM6IFVpbnQ4QXJyYXksIGtleUJ5dGVzOiBVaW50OEFycmF5LCBpdkJ5dGVzOiBVaW50OEFycmF5KSA9PiB7XG4gIGNvbnN0IG91dHB1dCA9IG5ldyBVaW50OEFycmF5KGRhdGFCeXRlcy5sZW5ndGgpXG5cbiAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGRhdGFCeXRlcy5sZW5ndGg7IGluZGV4ICs9IDEpIHtcbiAgICBjb25zdCBrZXlCeXRlID0ga2V5Qnl0ZXNbaW5kZXggJSBrZXlCeXRlcy5sZW5ndGhdID8/IDBcbiAgICBjb25zdCBpdkJ5dGUgPSBpdkJ5dGVzW2luZGV4ICUgaXZCeXRlcy5sZW5ndGhdID8/IDBcbiAgICBjb25zdCBzYWx0Qnl0ZSA9IChpbmRleCAqIDMxICsgaXZCeXRlcy5sZW5ndGggKiAxNykgJiAweGZmXG4gICAgb3V0cHV0W2luZGV4XSA9IChkYXRhQnl0ZXNbaW5kZXhdID8/IDApIF4ga2V5Qnl0ZSBeIGl2Qnl0ZSBeIHNhbHRCeXRlXG4gIH1cblxuICByZXR1cm4gb3V0cHV0XG59XG5cbmNvbnN0IGVuY3J5cHRLbm93bGVkZ2VCb2FyZEFpU2VjcmV0RmFsbGJhY2sgPSBhc3luYyAodmFsdWU6IHN0cmluZywgdXNlcklkPzogc3RyaW5nIHwgbnVsbCkgPT4ge1xuICBjb25zdCBrZXlNYXRlcmlhbCA9IGF3YWl0IHJlc29sdmVGYWxsYmFja0tleU1hdGVyaWFsKHVzZXJJZClcbiAgY29uc3Qga2V5Qnl0ZXMgPSBiYXNlNjRUb1VpbnQ4QXJyYXkoa2V5TWF0ZXJpYWwpXG4gIGNvbnN0IGl2Qnl0ZXMgPSBnZXRSYW5kb21CeXRlcygxNilcbiAgY29uc3QgZGF0YUJ5dGVzID0gbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKHZhbHVlKVxuICBjb25zdCBjaXBoZXJ0ZXh0ID0geG9yQ2lwaGVyQnl0ZXMoZGF0YUJ5dGVzLCBrZXlCeXRlcywgaXZCeXRlcylcblxuICByZXR1cm4ge1xuICAgIHZlcnNpb246IDIsXG4gICAgYWxnb3JpdGhtOiBcIlhPUi1MT0NBTFwiLFxuICAgIGl2OiBhcnJheUJ1ZmZlclRvQmFzZTY0KGl2Qnl0ZXMpLFxuICAgIGNpcGhlcnRleHQ6IGFycmF5QnVmZmVyVG9CYXNlNjQoY2lwaGVydGV4dCksXG4gIH0gc2F0aXNmaWVzIEtub3dsZWRnZUJvYXJkQWlFbmNyeXB0ZWRTZWNyZXRcbn1cblxuY29uc3QgZGVjcnlwdEtub3dsZWRnZUJvYXJkQWlTZWNyZXRGYWxsYmFjayA9IGFzeW5jIChcbiAgdmFsdWU6IEtub3dsZWRnZUJvYXJkQWlFbmNyeXB0ZWRTZWNyZXQsXG4gIHVzZXJJZD86IHN0cmluZyB8IG51bGxcbikgPT4ge1xuICBjb25zdCBzdG9yZWRSZWNvcmQgPSBhd2FpdCBnZXRTdG9yZWRLZXlSZWNvcmQodXNlcklkKVxuXG4gIGlmICghc3RvcmVkUmVjb3JkPy5rZXlNYXRlcmlhbCkge1xuICAgIHJldHVybiBcIlwiXG4gIH1cblxuICB0cnkge1xuICAgIGNvbnN0IGtleUJ5dGVzID0gYmFzZTY0VG9VaW50OEFycmF5KHN0b3JlZFJlY29yZC5rZXlNYXRlcmlhbClcbiAgICBjb25zdCBpdkJ5dGVzID0gYmFzZTY0VG9VaW50OEFycmF5KHZhbHVlLml2KVxuICAgIGNvbnN0IGRhdGFCeXRlcyA9IGJhc2U2NFRvVWludDhBcnJheSh2YWx1ZS5jaXBoZXJ0ZXh0KVxuICAgIGNvbnN0IGRlY3J5cHRlZEJ5dGVzID0geG9yQ2lwaGVyQnl0ZXMoZGF0YUJ5dGVzLCBrZXlCeXRlcywgaXZCeXRlcylcbiAgICByZXR1cm4gbmV3IFRleHREZWNvZGVyKCkuZGVjb2RlKGRlY3J5cHRlZEJ5dGVzKVxuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gXCJcIlxuICB9XG59XG5cbi8qKlxuICogV2ViIOerr+acrOWcsOWunueOsO+8muaKiiBBUEkgS2V5IOWKoOWvhuS4uuWPr+WGmeWFpeacrOWcsOWtmOWCqOeahOWvhuaWh+OAglxuICog5a6J5YWo5LiK5LiL5paH5LyY5YWIIEFFUy1HQ03vvIjlr4bpkqXmnZDmlpnlnKggSW5kZXhlZERC77yJ77yM5ZCm5YiZ6YCAIFhPUiDlhbzlrrnmt7fmt4bjgIJcbiAqL1xuY29uc3QgZW5jcnlwdFNlY3JldExvY2FsbHkgPSBhc3luYyAodmFsdWU6IHN0cmluZywgdXNlcklkPzogc3RyaW5nIHwgbnVsbCkgPT4ge1xuICBjb25zdCBub3JtYWxpemVkVmFsdWUgPSB2YWx1ZS50cmltKClcblxuICBpZiAoIW5vcm1hbGl6ZWRWYWx1ZSkge1xuICAgIHJldHVybiBudWxsXG4gIH1cblxuICBjb25zdCBjcnlwdG9TdXBwb3J0ID0gZ2V0U3Ryb25nQ3J5cHRvU3VwcG9ydCgpXG4gIGNvbnN0IGtleSA9IGF3YWl0IHJlc29sdmVDcnlwdG9LZXlGb3JFbmNyeXB0KHVzZXJJZClcblxuICBpZiAoY3J5cHRvU3VwcG9ydCAmJiBrZXkpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgaXYgPSBjcnlwdG9TdXBwb3J0LmdldFJhbmRvbVZhbHVlcyhuZXcgVWludDhBcnJheSgxMikpXG4gICAgICBjb25zdCBlbmNvZGVkID0gbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKG5vcm1hbGl6ZWRWYWx1ZSlcbiAgICAgIGNvbnN0IGVuY3J5cHRlZCA9IGF3YWl0IGNyeXB0b1N1cHBvcnQuc3VidGxlLmVuY3J5cHQoXG4gICAgICAgIHtcbiAgICAgICAgICBuYW1lOiBcIkFFUy1HQ01cIixcbiAgICAgICAgICBpdixcbiAgICAgICAgfSxcbiAgICAgICAga2V5LFxuICAgICAgICBlbmNvZGVkXG4gICAgICApXG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIHZlcnNpb246IDEsXG4gICAgICAgIGFsZ29yaXRobTogXCJBRVMtR0NNXCIsXG4gICAgICAgIGl2OiBhcnJheUJ1ZmZlclRvQmFzZTY0KGl2KSxcbiAgICAgICAgY2lwaGVydGV4dDogYXJyYXlCdWZmZXJUb0Jhc2U2NChlbmNyeXB0ZWQpLFxuICAgICAgfSBzYXRpc2ZpZXMgS25vd2xlZGdlQm9hcmRBaUVuY3J5cHRlZFNlY3JldFxuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG4gIH1cblxuICByZXR1cm4gZW5jcnlwdEtub3dsZWRnZUJvYXJkQWlTZWNyZXRGYWxsYmFjayhub3JtYWxpemVkVmFsdWUsIHVzZXJJZClcbn1cblxuLyoqIFdlYiDnq6/mnKzlnLDlrp7njrDvvJrmiormnKzlnLDkv53lrZjnmoTlr4bmlofov5jljp/kuLrlj6/nlKjnmoQgQVBJIEtleeOAgiAqL1xuY29uc3QgZGVjcnlwdFNlY3JldExvY2FsbHkgPSBhc3luYyAodmFsdWU6IEtub3dsZWRnZUJvYXJkQWlFbmNyeXB0ZWRTZWNyZXQsIHVzZXJJZD86IHN0cmluZyB8IG51bGwpID0+IHtcbiAgaWYgKHZhbHVlLmFsZ29yaXRobSA9PT0gXCJYT1ItTE9DQUxcIiB8fCB2YWx1ZS52ZXJzaW9uID09PSAyKSB7XG4gICAgcmV0dXJuIGRlY3J5cHRLbm93bGVkZ2VCb2FyZEFpU2VjcmV0RmFsbGJhY2sodmFsdWUsIHVzZXJJZClcbiAgfVxuXG4gIGNvbnN0IGNyeXB0b1N1cHBvcnQgPSBnZXRTdHJvbmdDcnlwdG9TdXBwb3J0KClcbiAgY29uc3Qga2V5ID0gYXdhaXQgcmVzb2x2ZUNyeXB0b0tleUZvckRlY3J5cHQodXNlcklkKVxuXG4gIGlmICghY3J5cHRvU3VwcG9ydCB8fCAha2V5KSB7XG4gICAgcmV0dXJuIFwiXCJcbiAgfVxuXG4gIHRyeSB7XG4gICAgY29uc3QgZGVjcnlwdGVkID0gYXdhaXQgY3J5cHRvU3VwcG9ydC5zdWJ0bGUuZGVjcnlwdChcbiAgICAgIHtcbiAgICAgICAgbmFtZTogXCJBRVMtR0NNXCIsXG4gICAgICAgIGl2OiBiYXNlNjRUb1VpbnQ4QXJyYXkodmFsdWUuaXYpLFxuICAgICAgfSxcbiAgICAgIGtleSxcbiAgICAgIGJhc2U2NFRvVWludDhBcnJheSh2YWx1ZS5jaXBoZXJ0ZXh0KVxuICAgIClcblxuICAgIHJldHVybiBuZXcgVGV4dERlY29kZXIoKS5kZWNvZGUoZGVjcnlwdGVkKVxuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gXCJcIlxuICB9XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8g5qGM6Z2i56uv5a2Y5YKo5ZCO56uv77yIRzTvvIlcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKipcbiAqIOahjOmdouerr+anveS9jeWPpeafhOWcqOWvhuaWh+Wtl+autemHjOeahOWJjee8gOOAguWPpeafhOS8quijheaIkCB2ZXJzaW9uIDEgLyBBRVMtR0NNIOW9oueKtlxuICog77yIS25vd2xlZGdlQm9hcmRBaUVuY3J5cHRlZFNlY3JldCDnmoTmnprkuL7nuqbmnZ/vvIzkuJTphY3nva7orrDlvZXlvZLkuIDljJbkvJrmiopcbiAqIHZlcnNpb24vYWxnb3JpdGhtIOaUtuaVm+WIsOW3suefpeWAvO+8ie+8jOecn+ato+eahOagh+iusOaYryBgaXYgPT09IFwiXCJgICsg5pys5YmN57yA4oCU4oCUXG4gKiDml6LmnIkgV2ViIOWunueOsOeahCBJViDmgZLkuLrpmo/mnLrlrZfoioLnmoQgYmFzZTY077yI6Z2e56m677yJ77yM5LiN5Lya5LiO5LmL5re35reG44CCXG4gKi9cbmNvbnN0IERFU0tUT1BfSEFORExFX1BSRUZJWCA9IFwic2FmZS1zdG9yZTpcIlxuXG4vKiog5piO5paH5pGY6KaB77yI5qe95L2N5ZCO57yA77yJ77ya5LyY5YWIIFNIQS0yNTbvvJvnvLogc3VidGxlIOeahOeOr+Wig+mAgCBGTlYtMWHvvIjku4XkvZzljrvph43moIfor4bvvIzkuI3mib/mi4Xkv53lr4bogYzotKPvvInjgIIgKi9cbmNvbnN0IGRpZ2VzdEhleCA9IGFzeW5jICh2YWx1ZTogc3RyaW5nKSA9PiB7XG4gIGlmICh0eXBlb2YgY3J5cHRvICE9PSBcInVuZGVmaW5lZFwiICYmIGNyeXB0by5zdWJ0bGUpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgZGlnZXN0ID0gYXdhaXQgY3J5cHRvLnN1YnRsZS5kaWdlc3QoXCJTSEEtMjU2XCIsIG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSh2YWx1ZSkpXG4gICAgICByZXR1cm4gQXJyYXkuZnJvbShuZXcgVWludDhBcnJheShkaWdlc3QpLCBieXRlID0+IGJ5dGUudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDIsIFwiMFwiKSkuam9pbihcIlwiKVxuICAgIH0gY2F0Y2gge1xuICAgICAgLy8g6JC95Yiw5LiL5pa5IEZOVi0xYSDlhZzlupVcbiAgICB9XG4gIH1cblxuICBsZXQgaGFzaCA9IDB4ODExYzlkYzVcbiAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHZhbHVlLmxlbmd0aDsgaW5kZXggKz0gMSkge1xuICAgIGhhc2ggXj0gdmFsdWUuY2hhckNvZGVBdChpbmRleClcbiAgICBoYXNoID0gTWF0aC5pbXVsKGhhc2gsIDB4MDEwMDAxOTMpXG4gIH1cbiAgcmV0dXJuIChoYXNoID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgXCIwXCIpXG59XG5cbi8qKiDmoYzpnaLnq6/mp73kvY3lrZjlgqjplK7msr/nlKggZ2V0S2V5SWQg55qEIGBrYi1ib2FyZC1haTp7dXNlcklkfWAg5ZG95ZCN6K+t5LmJ77yM5YaN5ou85piO5paH5pGY6KaB5L2c5qe95L2N5ZCO57yA44CCICovXG5jb25zdCBidWlsZERlc2t0b3BTZWNyZXRTdG9yYWdlS2V5ID0gYXN5bmMgKHVzZXJJZDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCwgcGxhaW50ZXh0OiBzdHJpbmcpID0+IHtcbiAgY29uc3QgZGlnZXN0ID0gYXdhaXQgZGlnZXN0SGV4KHBsYWludGV4dClcbiAgcmV0dXJuIGAke2dldEtleUlkKHVzZXJJZCl9OiR7ZGlnZXN0fWBcbn1cblxuY29uc3QgY3JlYXRlRGVza3RvcEhhbmRsZVNlY3JldCA9IChzdG9yYWdlS2V5OiBzdHJpbmcpOiBLbm93bGVkZ2VCb2FyZEFpRW5jcnlwdGVkU2VjcmV0ID0+ICh7XG4gIHZlcnNpb246IDEsXG4gIGFsZ29yaXRobTogXCJBRVMtR0NNXCIsXG4gIGl2OiBcIlwiLFxuICBjaXBoZXJ0ZXh0OiBgJHtERVNLVE9QX0hBTkRMRV9QUkVGSVh9JHtzdG9yYWdlS2V5fWAsXG59KVxuXG5jb25zdCBpc0Rlc2t0b3BIYW5kbGVTZWNyZXQgPSAodmFsdWU6IEtub3dsZWRnZUJvYXJkQWlFbmNyeXB0ZWRTZWNyZXQpID0+XG4gIHZhbHVlLml2ID09PSBcIlwiICYmIHZhbHVlLmNpcGhlcnRleHQuc3RhcnRzV2l0aChERVNLVE9QX0hBTkRMRV9QUkVGSVgpXG5cbmNvbnN0IHJlc29sdmVEZXNrdG9wSGFuZGxlU3RvcmFnZUtleSA9ICh2YWx1ZTogS25vd2xlZGdlQm9hcmRBaUVuY3J5cHRlZFNlY3JldCkgPT5cbiAgdmFsdWUuY2lwaGVydGV4dC5zbGljZShERVNLVE9QX0hBTkRMRV9QUkVGSVgubGVuZ3RoKVxuXG50eXBlIEtub3dsZWRnZUJvYXJkQWlTZWNyZXRCYWNrZW5kS2luZCA9IFwiZGVza3RvcC1zYWZlLXN0b3JlXCIgfCBcImxvY2FsLW9iZnVzY2F0ZWRcIlxuXG4vKiog5Y+v55So5oCn5o6i5rWL6ZSu77ya55yf5a6e5a2Y5YKo6ZSu6YO95bimIGBrYi1ib2FyZC1haTpgIOWJjee8gO+8jOS4jeS8muS4juWug+aSnuWQjeOAgiAqL1xuY29uc3QgREVTS1RPUF9QUk9CRV9TVE9SQUdFX0tFWSA9IFwiX194aWFveWUtc2VjdXJlLXN0b3JlLXByb2JlX19cIlxuXG5sZXQgc2VjcmV0QmFja2VuZEtpbmRQcm9taXNlOiBQcm9taXNlPEtub3dsZWRnZUJvYXJkQWlTZWNyZXRCYWNrZW5kS2luZD4gfCBudWxsID0gbnVsbFxuXG4vKipcbiAqIOino+aekOW9k+WJjeS8muivneeahOWvhumSpeWtmOWCqOWQjuerr++8iOe7k+aenOe8k+WtmO+8jOavj+S8muivneWPquaOoua1i+S4gOasoe+8ieOAglxuICpcbiAqIOahjOmdouerr+WIpOWumuWPo+W+hO+8mmB3aW5kb3cueGlhb3llRGVza3RvcC5zZWN1cmVTdG9yZUdldGAg5Y+v55So5LiU5Li76L+b56iLXG4gKiBzYWZlU3RvcmFnZSDliqDlr4blj6/nlKjjgILmjqLmtYvnlKjkuIDmnaHml6Dlia/kvZznlKjnmoQgZ2V077ya5Li76L+b56iL57y657O757uf6IO95Yqb5pe25Zue5oqlXG4gKiByZWFzb249dW5hdmFpbGFibGXvvIzpnZ4gRWxlY3Ryb24g546v5aKD5Zue5oqlIG5vLWRlc2t0b3AtYnJpZGdl4oCU4oCU5Lik6ICF6YO95b2S5YWlXG4gKiDmnKzlnLDmt7fmt4blrp7njrDvvIhXZWIg56uv6Lev5b6E77yJ44CCXG4gKi9cbmNvbnN0IHJlc29sdmVTZWNyZXRCYWNrZW5kS2luZCA9ICgpID0+IHtcbiAgaWYgKCFzZWNyZXRCYWNrZW5kS2luZFByb21pc2UpIHtcbiAgICBzZWNyZXRCYWNrZW5kS2luZFByb21pc2UgPSAoYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgcHJvYmUgPSBhd2FpdCByZWFkRGVza3RvcFNlY3VyZVN0b3JlKERFU0tUT1BfUFJPQkVfU1RPUkFHRV9LRVkpXG4gICAgICByZXR1cm4gcHJvYmUucmVhc29uID09PSBcIm5vLWRlc2t0b3AtYnJpZGdlXCIgfHwgcHJvYmUucmVhc29uID09PSBcInVuYXZhaWxhYmxlXCJcbiAgICAgICAgPyAoXCJsb2NhbC1vYmZ1c2NhdGVkXCIgYXMgY29uc3QpXG4gICAgICAgIDogKFwiZGVza3RvcC1zYWZlLXN0b3JlXCIgYXMgY29uc3QpXG4gICAgfSkoKS5jYXRjaCgoKSA9PiBcImxvY2FsLW9iZnVzY2F0ZWRcIiBhcyBjb25zdClcbiAgfVxuICByZXR1cm4gc2VjcmV0QmFja2VuZEtpbmRQcm9taXNlXG59XG5cbi8qKlxuICog5b2T5YmN5a+G6ZKl5piv5ZCm6JC95Zyo5pys5Zyw5re35reG5a2Y5YKo77yIV2ViIOerr++8jOaIluahjOmdouerr+ezu+e7n+e6p+WKoOWvhuS4jeWPr+eUqOaXtueahOWbnumAgO+8ieOAglxuICog55S75p2/IEFJIOmFjee9riBVSSDmja7mraTpgInmi6nlrZjlgqjmlrnlvI/mj5DnpLrmlofmoYjjgIJcbiAqL1xuZXhwb3J0IGNvbnN0IGlzTG9jYWxPYmZ1c2NhdGVkU3RvcmFnZSA9IGFzeW5jICgpID0+IHtcbiAgcmV0dXJuIChhd2FpdCByZXNvbHZlU2VjcmV0QmFja2VuZEtpbmQoKSkgPT09IFwibG9jYWwtb2JmdXNjYXRlZFwiXG59XG5cbi8qKiDmoYzpnaLnq6/lhpnlhaXvvJrmmI7mlocgYXBpS2V5IOS6pOe7meS4u+i/m+eoiyBzYWZlU3RvcmFnZSDliqDlr4bokL3nm5jvvIzov5Tlm57mjIflkJHmp73kvY3nmoTlj6Xmn4TjgIIgKi9cbmNvbnN0IGVuY3J5cHRTZWNyZXRWaWFEZXNrdG9wID0gYXN5bmMgKG5vcm1hbGl6ZWRWYWx1ZTogc3RyaW5nLCB1c2VySWQ/OiBzdHJpbmcgfCBudWxsKSA9PiB7XG4gIGNvbnN0IHN0b3JhZ2VLZXkgPSBhd2FpdCBidWlsZERlc2t0b3BTZWNyZXRTdG9yYWdlS2V5KHVzZXJJZCwgbm9ybWFsaXplZFZhbHVlKVxuICBjb25zdCBvdXRjb21lID0gYXdhaXQgd3JpdGVEZXNrdG9wU2VjdXJlU3RvcmUoc3RvcmFnZUtleSwgbm9ybWFsaXplZFZhbHVlKVxuXG4gIC8vIOS4u+i/m+eoi+WGmeWksei0pe+8iElPIOW8guW4uOetiee9leingeWcuuaZr++8ie+8muWbnumAgCBXZWIg5pys5Zyw5a6e546w77yM5a6B5Y+v6ZmN57qn5Lmf5LiN5Lii5L+d5a2Y6IO95YqbXG4gIGlmICghb3V0Y29tZS5vaykge1xuICAgIHJldHVybiBlbmNyeXB0U2VjcmV0TG9jYWxseShub3JtYWxpemVkVmFsdWUsIHVzZXJJZClcbiAgfVxuXG4gIHJldHVybiBjcmVhdGVEZXNrdG9wSGFuZGxlU2VjcmV0KHN0b3JhZ2VLZXkpXG59XG5cbi8qKiDmoYzpnaLnq6/or7vlj5bvvJrmjInlj6Xmn4Tph4znmoTlrZjlgqjplK7lkJHkuLvov5vnqIvlj5blm57mmI7mlofjgIIgKi9cbmNvbnN0IGRlY3J5cHRTZWNyZXRWaWFEZXNrdG9wID0gYXN5bmMgKHZhbHVlOiBLbm93bGVkZ2VCb2FyZEFpRW5jcnlwdGVkU2VjcmV0KSA9PiB7XG4gIGNvbnN0IHN0b3JhZ2VLZXkgPSByZXNvbHZlRGVza3RvcEhhbmRsZVN0b3JhZ2VLZXkodmFsdWUpXG4gIGlmICghc3RvcmFnZUtleSkge1xuICAgIHJldHVybiBcIlwiXG4gIH1cblxuICBjb25zdCBvdXRjb21lID0gYXdhaXQgcmVhZERlc2t0b3BTZWN1cmVTdG9yZShzdG9yYWdlS2V5KVxuICByZXR1cm4gb3V0Y29tZS52YWx1ZSA/PyBcIlwiXG59XG5cbi8qKlxuICog6YWN572u6K6w5b2V55qE5a2Y5YKo6ZSu5YmN57yA44CC5LiOIHV0aWxzL2tub3dsZWRnZS1ib2FyZC1haS1jb25maWcudHMg55qEXG4gKiBnZXRLbm93bGVkZ2VCb2FyZEFpU3RvcmFnZUtleSDlkIzmnoTigJTigJTpgqPkuKrmlofku7blj43lkJHkvp3otZbmnKzmqKHlnZfvvIxpbXBvcnQg5Lya5oiQ546v77yMXG4gKiDlrZfpnaLph4/lkIzmupDnu7TmiqTvvIzmlLnliqjpobvkuKTovrnlkIzmraXjgIJcbiAqL1xuY29uc3QgQ09ORklHX1JFQ09SRF9TVE9SQUdFX0tFWV9QUkVGSVggPSBcImtiLWJvYXJkLWFpLWNvbmZpZzpcIlxuXG5jb25zdCBnZXRCb2FyZEFpQ29uZmlnUmVjb3JkU3RvcmFnZUtleSA9ICh1c2VySWQ/OiBzdHJpbmcgfCBudWxsKSA9PlxuICBgJHtDT05GSUdfUkVDT1JEX1NUT1JBR0VfS0VZX1BSRUZJWH0ke3VzZXJJZCB8fCBcImFub255bW91c1wifWBcblxuLyoqIOi/geenu+aXtuimgeaUueWGmeeahCBsb2NhbFN0b3JhZ2Ug6YWN572u6K6w5b2V5pyA5bCP5b2i54q277yI5Y+q5YWz5b+DIHByb2ZpbGVzW10uZW5jcnlwdGVkQXBpS2V577yJ44CCICovXG5pbnRlcmZhY2UgQm9hcmRBaUNvbmZpZ1JlY29yZFNoYXBlIHtcbiAgcHJvZmlsZXM/OiB1bmtub3duW11cbn1cblxuLyoqIOivu+WPlueUu+advyBBSSDphY3nva7orrDlvZXvvIhsb2NhbFN0b3JhZ2XvvInvvJvnvLrlpLHmiJbmjZ/lnY/ov5Tlm54gbnVsbO+8iOi/geenu+S+p+S4jeWKqOaXp+adkOaWme+8ieOAgiAqL1xuY29uc3QgcmVhZEJvYXJkQWlDb25maWdSZWNvcmQgPSAodXNlcklkPzogc3RyaW5nIHwgbnVsbCk6IEJvYXJkQWlDb25maWdSZWNvcmRTaGFwZSB8IG51bGwgPT4ge1xuICBpZiAoIWhhc1dpbmRvdygpIHx8IHR5cGVvZiB3aW5kb3cubG9jYWxTdG9yYWdlID09PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgcmV0dXJuIG51bGxcbiAgfVxuXG4gIHRyeSB7XG4gICAgY29uc3QgcmF3ID0gd2luZG93LmxvY2FsU3RvcmFnZS5nZXRJdGVtKGdldEJvYXJkQWlDb25maWdSZWNvcmRTdG9yYWdlS2V5KHVzZXJJZCkpXG4gICAgaWYgKCFyYXcpIHtcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgY29uc3QgcGFyc2VkOiB1bmtub3duID0gSlNPTi5wYXJzZShyYXcpXG4gICAgaWYgKCFpc1JlY29yZChwYXJzZWQpIHx8ICFBcnJheS5pc0FycmF5KHBhcnNlZC5wcm9maWxlcykpIHtcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgcmV0dXJuIHsgcHJvZmlsZXM6IHBhcnNlZC5wcm9maWxlcyB9XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBudWxsXG4gIH1cbn1cblxuLyoqIOWIpOWumumFjee9ruiusOW9lemHjOeahOWvhuaWh+Wtl+auteaYr+WQpuS4uuOAjOW4piBpdi9jaXBoZXJ0ZXh0IOWtl+espuS4suOAjeeahOWPr+ivhuWIq+W9oueKtuOAgiAqL1xuY29uc3QgaXNSZWNvcmRlZFNlY3JldCA9ICh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIHsgaXY6IHN0cmluZzsgY2lwaGVydGV4dDogc3RyaW5nIH0gPT5cbiAgaXNSZWNvcmQodmFsdWUpICYmIHR5cGVvZiB2YWx1ZS5pdiA9PT0gXCJzdHJpbmdcIiAmJiB0eXBlb2YgdmFsdWUuY2lwaGVydGV4dCA9PT0gXCJzdHJpbmdcIlxuXG5jb25zdCBpc0Rlc2t0b3BIYW5kbGVSZWNvcmRTZWNyZXQgPSAodmFsdWU6IHsgaXY6IHN0cmluZzsgY2lwaGVydGV4dDogc3RyaW5nIH0pID0+XG4gIHZhbHVlLml2ID09PSBcIlwiICYmIHZhbHVlLmNpcGhlcnRleHQuc3RhcnRzV2l0aChERVNLVE9QX0hBTkRMRV9QUkVGSVgpXG5cbi8qKiDlr4bmlofmjIfnurnvvJppdiArIGNpcGhlcnRleHQg5b2S5LiA5YyW5a2X56ym5Liy44CC5ZCM5LiA5a+G5paH5Zyo6YWN572u6K6w5b2V6YeM55qE5Ye6546w5L2N572u6Z2g5a6D5a6a5L2N44CCICovXG5jb25zdCBnZXRTZWNyZXRGaW5nZXJwcmludCA9ICh2YWx1ZTogeyBpdjogc3RyaW5nOyBjaXBoZXJ0ZXh0OiBzdHJpbmcgfSkgPT4gYCR7dmFsdWUuaXZ9fCR7dmFsdWUuY2lwaGVydGV4dH1gXG5cbi8qKiDphY3nva7orrDlvZXph4zmmK/lkKbov5jmnIkgV2ViIOagvOW8j+WvhuaWh++8iOacqui/geenu+mhue+8ieOAgiAqL1xuY29uc3QgcmVjb3JkSGFzTGVnYWN5U2VjcmV0ID0gKHJlY29yZDogQm9hcmRBaUNvbmZpZ1JlY29yZFNoYXBlKSA9PlxuICAocmVjb3JkLnByb2ZpbGVzID8/IFtdKS5zb21lKHByb2ZpbGUgPT4ge1xuICAgIGNvbnN0IHNlY3JldCA9IGlzUmVjb3JkKHByb2ZpbGUpID8gcHJvZmlsZS5lbmNyeXB0ZWRBcGlLZXkgOiB1bmRlZmluZWRcbiAgICByZXR1cm4gaXNSZWNvcmRlZFNlY3JldChzZWNyZXQpICYmICFpc0Rlc2t0b3BIYW5kbGVSZWNvcmRTZWNyZXQoc2VjcmV0KVxuICB9KVxuXG4vKipcbiAqIOaKiumFjee9ruiusOW9leS4reaMh+e6ueWMuemFjeeahCBXZWIg5qC85byP5a+G5paH5pS55YaZ5Li65qGM6Z2i5Y+l5p+E5bm25YaZ5Zue44CCXG4gKiDlj6rliqjljLnphY3pobnvvIzlhbbkvZnlrZfmrrXljp/moLfkv53nlZnvvJvorrDlvZXnvLrlpLEgLyDmnKrlkb3kuK0gLyDlhpnlm57lpLHotKXpg73ov5Tlm54gZmFsc2VcbiAqIO+8iOiwg+eUqOaWueaNruivpeWAvOWGs+WumuaYr+WQpuaOqOi/m+aXp+adkOaWmeWIoOmZpO+8ieOAglxuICovXG5jb25zdCByZXBsYWNlTGVnYWN5U2VjcmV0SW5Db25maWdSZWNvcmQgPSAoXG4gIHVzZXJJZDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCxcbiAgZmluZ2VycHJpbnQ6IHN0cmluZyxcbiAgaGFuZGxlOiBLbm93bGVkZ2VCb2FyZEFpRW5jcnlwdGVkU2VjcmV0XG4pID0+IHtcbiAgY29uc3QgcmVjb3JkID0gcmVhZEJvYXJkQWlDb25maWdSZWNvcmQodXNlcklkKVxuICBpZiAoIXJlY29yZCkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG5cbiAgbGV0IHJlcGxhY2VkID0gZmFsc2VcbiAgZm9yIChjb25zdCBwcm9maWxlIG9mIHJlY29yZC5wcm9maWxlcyA/PyBbXSkge1xuICAgIGlmICghaXNSZWNvcmQocHJvZmlsZSkpIHtcbiAgICAgIGNvbnRpbnVlXG4gICAgfVxuICAgIGNvbnN0IHNlY3JldCA9IHByb2ZpbGUuZW5jcnlwdGVkQXBpS2V5XG4gICAgaWYgKFxuICAgICAgaXNSZWNvcmRlZFNlY3JldChzZWNyZXQpICYmXG4gICAgICAhaXNEZXNrdG9wSGFuZGxlUmVjb3JkU2VjcmV0KHNlY3JldCkgJiZcbiAgICAgIGdldFNlY3JldEZpbmdlcnByaW50KHNlY3JldCkgPT09IGZpbmdlcnByaW50XG4gICAgKSB7XG4gICAgICBwcm9maWxlLmVuY3J5cHRlZEFwaUtleSA9IGhhbmRsZVxuICAgICAgcmVwbGFjZWQgPSB0cnVlXG4gICAgfVxuICB9XG5cbiAgaWYgKCFyZXBsYWNlZCkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG5cbiAgdHJ5IHtcbiAgICB3aW5kb3cubG9jYWxTdG9yYWdlLnNldEl0ZW0oZ2V0Qm9hcmRBaUNvbmZpZ1JlY29yZFN0b3JhZ2VLZXkodXNlcklkKSwgSlNPTi5zdHJpbmdpZnkocmVjb3JkKSlcbiAgICByZXR1cm4gdHJ1ZVxuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxufVxuXG4vKiog5Yig6Zmk5pen5a+G6ZKl5p2Q5paZ77yabG9jYWxTdG9yYWdlIOWFnOW6lemUriArIEluZGV4ZWREQiDlr4bpkqXorrDlvZXvvIjlkIToh6rlsL3lipvogIzkuLrvvInjgIIgKi9cbmNvbnN0IGRlbGV0ZUxlZ2FjeVNlY3JldE1hdGVyaWFsID0gYXN5bmMgKHVzZXJJZD86IHN0cmluZyB8IG51bGwpID0+IHtcbiAgaWYgKGhhc1dpbmRvdygpKSB7XG4gICAgdHJ5IHtcbiAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbShnZXRMb2NhbFNlY3JldFN0b3JhZ2VLZXkodXNlcklkKSlcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIGxvY2FsU3RvcmFnZSDkuI3lj6/nlKjml7blv73nlaXvvIxJbmRleGVkREIg6Lev5b6E57un57utXG4gICAgfVxuICB9XG5cbiAgdHJ5IHtcbiAgICBhd2FpdCBkZWxldGVTdG9yZWRLZXlSZWNvcmQodXNlcklkKVxuICB9IGNhdGNoIHtcbiAgICAvLyDliKDkuI3mjonlsLHnlZnnnYDvvJrphY3nva7orrDlvZXlt7LmlLnlhpnkuLrlj6Xmn4TvvIzml6fmnZDmlpnlj6rmmK/ml6DlrrPmrovnlZlcbiAgfVxufVxuXG4vKiog6YWN572u6K6w5b2V6YeM5bey5pegIFdlYiDmoLzlvI/lr4bmlofml7bmiY3liKDpmaTml6flr4bpkqXmnZDmlpnvvIjlpJrku73phY3nva7lj6/og73lhbHnlKjlkIzkuIDku73mnZDmlpnvvInjgIIgKi9cbmNvbnN0IGRlbGV0ZUxlZ2FjeVNlY3JldE1hdGVyaWFsV2hlbkRyYWluZWQgPSBhc3luYyAodXNlcklkPzogc3RyaW5nIHwgbnVsbCkgPT4ge1xuICBjb25zdCByZWNvcmQgPSByZWFkQm9hcmRBaUNvbmZpZ1JlY29yZCh1c2VySWQpXG4gIGlmIChyZWNvcmQgJiYgcmVjb3JkSGFzTGVnYWN5U2VjcmV0KHJlY29yZCkpIHtcbiAgICByZXR1cm5cbiAgfVxuICBhd2FpdCBkZWxldGVMZWdhY3lTZWNyZXRNYXRlcmlhbCh1c2VySWQpXG59XG5cbi8qKiDlt7LlgZrov4fjgIzorrDlvZXlt7LmjpLnqbrjgI3mo4Dmn6XnmoTnlKjmiLfvvIjmr4/kvJror53kuIDmrKHvvIzpgb/lhY3mr4/mrKHor7vlj5bpg73miavphY3nva7orrDlvZXvvInjgIIgKi9cbmNvbnN0IGRyYWluZWRDaGVja0RvbmVVc2VycyA9IG5ldyBTZXQ8c3RyaW5nPigpXG5cbi8qKlxuICog5Lya6K+d57qn5YWc5bqV5riF55CG77ya6YWN572u6K6w5b2V5bey5YWo5piv5qGM6Z2i5Y+l5p+E77yI5L6L5aaC5LiK5LiA5Lya6K+d55u05o6l5L+d5a2Y6KaG5YaZ44CB5rKh6LWwXG4gKiDpgJDmnaHov4Hnp7vvvInml7bvvIzml6flr4bpkqXmnZDmlpnlnKjmraTooaXliKDjgILorrDlvZXph4zku43mnIkgV2ViIOagvOW8j+WvhuaWh+aXtuS4jeWKqO+8iOetiemAkOadoei/geenu++8ieOAglxuICovXG5jb25zdCBjbGVhbnVwTGVnYWN5U2VjcmV0TWF0ZXJpYWxPbmNlID0gYXN5bmMgKHVzZXJJZD86IHN0cmluZyB8IG51bGwpID0+IHtcbiAgY29uc3QgdXNlcktleSA9IHVzZXJJZCB8fCBcImFub255bW91c1wiXG4gIGlmIChkcmFpbmVkQ2hlY2tEb25lVXNlcnMuaGFzKHVzZXJLZXkpKSB7XG4gICAgcmV0dXJuXG4gIH1cbiAgZHJhaW5lZENoZWNrRG9uZVVzZXJzLmFkZCh1c2VyS2V5KVxuXG4gIGNvbnN0IHJlY29yZCA9IHJlYWRCb2FyZEFpQ29uZmlnUmVjb3JkKHVzZXJJZClcbiAgaWYgKHJlY29yZCAmJiAhcmVjb3JkSGFzTGVnYWN5U2VjcmV0KHJlY29yZCkpIHtcbiAgICBhd2FpdCBkZWxldGVMZWdhY3lTZWNyZXRNYXRlcmlhbCh1c2VySWQpXG4gIH1cbn1cblxuLyoqXG4gKiDkuIDmrKHmgKfpnZnpu5jov4Hnp7vvvIjmoYzpnaLnq6/pppbor7vliLAgV2ViIOagvOW8j+aXp+WvhuaWh+aXtuinpuWPke+8ie+8mlxuICog5pen5a+G6ZKl5p2Q5paZ5bCa5pyq5Yig6ZmkIOKGkiDop6Plh7rmmI7mlocg4oaSIOWGmeWFpeS4u+i/m+eoi+anveS9jSDihpIg6YWN572u6K6w5b2V6YeM55qE6K+l5a+G5paHXG4gKiDmlLnlhpnkuLrmoYzpnaLlj6Xmn4Qg4oaSIOiusOW9leaOkuepuuWQjuWIoOmZpOaXp+adkOaWmeOAglxuICovXG5jb25zdCBtaWdyYXRlTGVnYWN5U2VjcmV0VmlhRGVza3RvcCA9IGFzeW5jICh2YWx1ZTogS25vd2xlZGdlQm9hcmRBaUVuY3J5cHRlZFNlY3JldCwgdXNlcklkPzogc3RyaW5nIHwgbnVsbCkgPT4ge1xuICBjb25zdCBwbGFpbnRleHQgPSBhd2FpdCBkZWNyeXB0U2VjcmV0TG9jYWxseSh2YWx1ZSwgdXNlcklkKVxuICBjb25zdCBmaW5nZXJwcmludCA9IGdldFNlY3JldEZpbmdlcnByaW50KHZhbHVlKVxuICAvLyDmmI7mlofkuI3lj6/op6Pml7bnlKjmjIfnurnmtL7nlJ/kuIDkuKrnqLPlrprmp73kvY3vvIjlj6Xmn4TmjIflkJHnqbrmp73vvIzor7vlm57kuLrnqbrkuLLvvIzkuI7njrDnirbkuIDoh7TvvIlcbiAgY29uc3Qgc3RvcmFnZUtleSA9IGF3YWl0IGJ1aWxkRGVza3RvcFNlY3JldFN0b3JhZ2VLZXkodXNlcklkLCBwbGFpbnRleHQgfHwgZmluZ2VycHJpbnQpXG4gIGxldCByZXdyaXR0ZW4gPSBmYWxzZVxuXG4gIGlmIChwbGFpbnRleHQpIHtcbiAgICBjb25zdCBvdXRjb21lID0gYXdhaXQgd3JpdGVEZXNrdG9wU2VjdXJlU3RvcmUoc3RvcmFnZUtleSwgcGxhaW50ZXh0KVxuICAgIC8vIOWGmeWksei0peaXtuS/neeVmeaXp+agvOW8j+S4jeWKqO+8muS4i+asoeivu+WPlui/mOS8mumHjeivlei/geenu++8jOaXp+adkOaWmeS5n+S4jeWIoFxuICAgIGlmIChvdXRjb21lLm9rKSB7XG4gICAgICByZXdyaXR0ZW4gPSByZXBsYWNlTGVnYWN5U2VjcmV0SW5Db25maWdSZWNvcmQodXNlcklkLCBmaW5nZXJwcmludCwgY3JlYXRlRGVza3RvcEhhbmRsZVNlY3JldChzdG9yYWdlS2V5KSlcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgLy8g5pen5a+G5paH5bey5LiN5Y+v6Kej77yI5p2Q5paZ57y65aSx5oiW5o2f5Z2P77yJ77ya5pS55YaZ5Li656m65Y+l5p+E5q2i5L2P5Y+N5aSN6Kej5a+G5bCd6K+V77yM5o2f5aSx5LiO546w54q25LiA6Ie0XG4gICAgcmV3cml0dGVuID0gcmVwbGFjZUxlZ2FjeVNlY3JldEluQ29uZmlnUmVjb3JkKHVzZXJJZCwgZmluZ2VycHJpbnQsIGNyZWF0ZURlc2t0b3BIYW5kbGVTZWNyZXQoc3RvcmFnZUtleSkpXG4gIH1cblxuICBpZiAocmV3cml0dGVuKSB7XG4gICAgYXdhaXQgZGVsZXRlTGVnYWN5U2VjcmV0TWF0ZXJpYWxXaGVuRHJhaW5lZCh1c2VySWQpXG4gIH1cblxuICByZXR1cm4gcGxhaW50ZXh0XG59XG5cbi8qKiDlsIYgQVBJIEtleSDliqDlr4bkuLrlj6/lhpnlhaXmnKzlnLDlrZjlgqjnmoTlr4bmlofjgILmoYzpnaLnq6/otbDkuLvov5vnqIvlronlhajlrZjlgqjvvIjov5Tlm57mp73kvY3lj6Xmn4TvvInvvIxXZWIg56uv6LWw5pys5Zyw5re35reG5a6e546w44CCICovXG5leHBvcnQgY29uc3QgZW5jcnlwdEtub3dsZWRnZUJvYXJkQWlTZWNyZXQgPSBhc3luYyAodmFsdWU6IHN0cmluZywgdXNlcklkPzogc3RyaW5nIHwgbnVsbCkgPT4ge1xuICBjb25zdCBub3JtYWxpemVkVmFsdWUgPSB2YWx1ZS50cmltKClcblxuICBpZiAoIW5vcm1hbGl6ZWRWYWx1ZSkge1xuICAgIHJldHVybiBudWxsXG4gIH1cblxuICBpZiAoKGF3YWl0IHJlc29sdmVTZWNyZXRCYWNrZW5kS2luZCgpKSA9PT0gXCJkZXNrdG9wLXNhZmUtc3RvcmVcIikge1xuICAgIHJldHVybiBlbmNyeXB0U2VjcmV0VmlhRGVza3RvcChub3JtYWxpemVkVmFsdWUsIHVzZXJJZClcbiAgfVxuXG4gIHJldHVybiBlbmNyeXB0U2VjcmV0TG9jYWxseShub3JtYWxpemVkVmFsdWUsIHVzZXJJZClcbn1cblxuLyoqIOWwhuacrOWcsOS/neWtmOeahOWvhuaWh+i/mOWOn+S4uuWPr+eUqOeahCBBUEkgS2V544CC5qGM6Z2i56uv5Y+l5p+E5ZCR5Li76L+b56iL5Y+W5Zue5piO5paH77yM5pen5qC85byP6Kem5Y+R5LiA5qyh5oCn6L+B56e744CCICovXG5leHBvcnQgY29uc3QgZGVjcnlwdEtub3dsZWRnZUJvYXJkQWlTZWNyZXQgPSBhc3luYyAoXG4gIHZhbHVlOiBLbm93bGVkZ2VCb2FyZEFpRW5jcnlwdGVkU2VjcmV0IHwgbnVsbCB8IHVuZGVmaW5lZCxcbiAgdXNlcklkPzogc3RyaW5nIHwgbnVsbFxuKSA9PiB7XG4gIGlmICghdmFsdWUpIHtcbiAgICByZXR1cm4gXCJcIlxuICB9XG5cbiAgaWYgKChhd2FpdCByZXNvbHZlU2VjcmV0QmFja2VuZEtpbmQoKSkgPT09IFwiZGVza3RvcC1zYWZlLXN0b3JlXCIpIHtcbiAgICBpZiAoaXNEZXNrdG9wSGFuZGxlU2VjcmV0KHZhbHVlKSkge1xuICAgICAgYXdhaXQgY2xlYW51cExlZ2FjeVNlY3JldE1hdGVyaWFsT25jZSh1c2VySWQpXG4gICAgICByZXR1cm4gZGVjcnlwdFNlY3JldFZpYURlc2t0b3AodmFsdWUpXG4gICAgfVxuICAgIHJldHVybiBtaWdyYXRlTGVnYWN5U2VjcmV0VmlhRGVza3RvcCh2YWx1ZSwgdXNlcklkKVxuICB9XG5cbiAgcmV0dXJuIGRlY3J5cHRTZWNyZXRMb2NhbGx5KHZhbHVlLCB1c2VySWQpXG59XG4iXSwibWFwcGluZ3MiOiJBQW1CQSxTQUFTLHdCQUF3QiwrQkFBK0I7QUFDaEUsU0FBUyxnQkFBZ0I7QUFHekIsTUFBTSxnQkFBZ0I7QUFFdEIsTUFBTSxtQkFBbUI7QUFFekIsTUFBTSxhQUFhO0FBRW5CLE1BQU0sMEJBQTBCO0FBU2hDLE1BQU0sWUFBWSxNQUFNLE9BQU8sV0FBVztBQUUxQyxNQUFNLHNCQUFzQixNQUFNLFVBQVUsS0FBSyxP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