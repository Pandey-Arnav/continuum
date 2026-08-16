import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import {
  AESEncryptionKey,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
} from "expo-crypto";

const STORAGE_KEY = "continuum.outbox.v1";
const KEY_ALIAS = "continuum.outbox.aes-key.v1";
const MAX_ITEMS = 100;
const MAX_PLAINTEXT_BYTES = 750_000;

export interface QueuedCorrection {
  clientCorrectionId: string;
  factIndex: number;
  originalFact: Record<string, unknown>;
  correctedFact: Record<string, unknown>;
  reason: string;
  correctedBy: string;
}

export interface OutboxPayload {
  entry: Record<string, unknown>;
  corrections: QueuedCorrection[];
}

export interface OutboxItem extends OutboxPayload {
  id: string;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

export interface OutboxState {
  count: number;
  bytes: number;
  syncing: boolean;
  storage: "device-keystore" | "volatile-web";
  lastError?: string;
}

type Listener = (state: OutboxState) => void;

let volatileWebItems: OutboxItem[] = [];
let syncing = false;
let lastError: string | undefined;
const listeners = new Set<Listener>();

function storageKind(): OutboxState["storage"] {
  return Platform.OS === "web" ? "volatile-web" : "device-keystore";
}

function makeId(): string {
  return `outbox-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function getKey(): Promise<AESEncryptionKey> {
  const available = await SecureStore.isAvailableAsync();
  if (!available) throw new Error("Secure device key storage is unavailable");
  let encoded = await SecureStore.getItemAsync(KEY_ALIAS);
  if (!encoded) {
    const generated = await AESEncryptionKey.generate();
    encoded = await generated.encoded("base64");
    await SecureStore.setItemAsync(KEY_ALIAS, encoded, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    return generated;
  }
  return AESEncryptionKey.import(encoded, "base64");
}

async function readNativeItems(): Promise<OutboxItem[]> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (!stored) return [];
  const envelope = JSON.parse(stored) as { version?: number; ciphertext?: string };
  if (envelope.version !== 1 || !envelope.ciphertext) throw new Error("Offline queue format is invalid");
  const key = await getKey();
  const sealed = AESSealedData.fromCombined(envelope.ciphertext);
  const decrypted = await aesDecryptAsync(sealed, key);
  const bytes = typeof decrypted === "string" ? Uint8Array.from(atob(decrypted), (char) => char.charCodeAt(0)) : decrypted;
  const parsed = JSON.parse(new TextDecoder().decode(bytes));
  return Array.isArray(parsed) ? parsed as OutboxItem[] : [];
}

async function writeNativeItems(items: OutboxItem[]): Promise<void> {
  if (items.length === 0) {
    await AsyncStorage.removeItem(STORAGE_KEY);
    return;
  }
  const plaintext = new TextEncoder().encode(JSON.stringify(items));
  if (plaintext.byteLength > MAX_PLAINTEXT_BYTES) throw new Error("Offline queue reached its encrypted storage limit");
  const key = await getKey();
  const sealed = await aesEncryptAsync(plaintext, key);
  const ciphertext = await sealed.combined("base64");
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ciphertext }));
}

async function readItems(): Promise<OutboxItem[]> {
  return Platform.OS === "web" ? volatileWebItems : readNativeItems();
}

async function writeItems(items: OutboxItem[]): Promise<void> {
  if (Platform.OS === "web") {
    volatileWebItems = items;
    return;
  }
  await writeNativeItems(items);
}

async function currentState(): Promise<OutboxState> {
  let count = 0;
  let bytes = 0;
  try {
    const items = await readItems();
    count = items.length;
    bytes = items.length ? new TextEncoder().encode(JSON.stringify(items)).byteLength : 0;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
  }
  return { count, bytes, syncing, storage: storageKind(), lastError };
}

async function notify(): Promise<void> {
  const state = await currentState();
  listeners.forEach((listener) => listener(state));
}

export async function getOutboxState(): Promise<OutboxState> {
  return currentState();
}

export function subscribeOutbox(listener: Listener): () => void {
  listeners.add(listener);
  void currentState().then(listener);
  return () => listeners.delete(listener);
}

export async function enqueueOutbox(payload: OutboxPayload): Promise<OutboxItem> {
  const items = await readItems();
  if (items.length >= MAX_ITEMS) throw new Error("Offline queue is full; reconnect before capturing more records");
  const item: OutboxItem = {
    ...payload,
    id: makeId(),
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  await writeItems([...items, item]);
  lastError = undefined;
  await notify();
  return item;
}

export async function flushOutbox(
  deliver: (payload: OutboxPayload) => Promise<void>
): Promise<{ delivered: number; remaining: number }> {
  if (syncing) return { delivered: 0, remaining: (await readItems()).length };
  syncing = true;
  lastError = undefined;
  await notify();
  let delivered = 0;
  let items = await readItems();

  try {
    while (items.length > 0) {
      const [item, ...rest] = items;
      try {
        await deliver({ entry: item.entry, corrections: item.corrections });
        delivered += 1;
        items = rest;
        await writeItems(items);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        items[0] = { ...item, attempts: item.attempts + 1, lastError: message };
        await writeItems(items);
        lastError = message;
        break;
      }
    }
  } finally {
    syncing = false;
    await notify();
  }

  return { delivered, remaining: items.length };
}
