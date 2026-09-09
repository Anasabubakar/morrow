import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'morrow.processed-request-ids.v1';

export async function wasProcessed(requestId: string) {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return (JSON.parse(raw ?? '[]') as string[]).includes(requestId);
  } catch {
    return false;
  }
}

export async function markProcessed(requestId: string) {
  let current: string[] = [];
  try { current = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? '[]'); } catch { /* reset malformed local state */ }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([requestId, ...current.filter(id => id !== requestId)].slice(0, 100)));
}

export async function clearProcessed() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
