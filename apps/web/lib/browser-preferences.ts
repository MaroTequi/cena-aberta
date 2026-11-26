const consentKey = "cena.preference-storage";
const keys = ["cena-theme", "cena-christmas", "cenaaberta.rating-control"] as const;
type PreferenceKey = typeof keys[number];
type Duration = "persistent" | "session" | "memory";
type StorageKind = "localStorage" | "sessionStorage";

function available(kind: StorageKind) {
  try {
    const storage = window[kind];
    const probe = "cena.preference-probe." + Math.random();
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch { return null; }
}

function createPreferences() {
  let shared = available("localStorage");
  let tab = available("sessionStorage");
  let persistent = false;
  const values = new Map<PreferenceKey, string>();
  const listeners = new Set<()=>void>();
  function notify() { listeners.forEach(listener => listener()); }
  function save(storage: Storage, key: string, value: string | null) {
    try {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
      return true;
    } catch {
      if (storage === tab) tab = null;
      if (storage === shared) { shared = null; persistent = false; }
      return false;
    }
  }
  function snapshot(storage: Storage) {
    const entries = keys.map(key => [key, storage.getItem(key)] as const);
    for (const [key, value] of entries) {
      if (value === null) values.delete(key);
      else values.set(key, value);
      if (storage === shared && tab) save(tab, key, value);
    }
  }
  function sync(initial: boolean) {
    try {
      persistent = !!shared && shared.getItem(consentKey) !== "off";
      if (persistent && shared) snapshot(shared);
      else if (initial && tab) snapshot(tab);
    } catch {
      if (persistent) shared = null;
      else tab = null;
      persistent = false;
    }
  }
  sync(true);
  window.addEventListener("storage", event => {
    if (!shared || event.storageArea !== shared ||
        (event.key !== null && event.key !== consentKey && !keys.some(key => key === event.key))) return;
    sync(false);
    notify();
  });
  return {
    duration(): Duration { return persistent ? "persistent" : tab ? "session" : "memory"; },
    canPersist() { return !!shared; },
    read(key: PreferenceKey) { return values.get(key) ?? null; },
    write(key: PreferenceKey, value: string) {
      values.set(key, value);
      if (persistent && shared) save(shared, key, value);
      if (tab) save(tab, key, value);
      notify();
    },
    setDuration(allow: boolean) {
      const storage = shared;
      if (!storage) return;
      if (allow) {
        for (const key of keys) if (!save(storage, key, values.get(key) ?? null)) { notify(); return; }
        persistent = save(storage, consentKey, "on");
      } else {
        if (save(storage, consentKey, "off")) {
          persistent = false;
          for (const key of keys) save(storage, key, null);
        }
      }
      notify();
    },
    subscribe(listener: ()=>void) {
      listeners.add(listener);
      return ()=>{ listeners.delete(listener); };
    },
  };
}

// A separate in-memory snapshot per tab also keeps controls usable without Web Storage.
let preferences: ReturnType<typeof createPreferences> | undefined;
function store() { return preferences ??= createPreferences(); }
export function preferenceDuration() { return store().duration(); }
export function canPersistPreferences() { return store().canPersist(); }
export function subscribePreferences(listener: ()=>void) { return store().subscribe(listener); }
export function readPreference(key: PreferenceKey) { return store().read(key); }
export function writePreference(key: PreferenceKey, value: string) { store().write(key, value); }
export function allowPreferences(allow: boolean) { store().setDuration(allow); }
