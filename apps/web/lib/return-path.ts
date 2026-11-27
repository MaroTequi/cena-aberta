export function returnPath(value: string | null | undefined) {
  return value && /^\/salas(?:\?sala=[a-f0-9-]{36})?$/.test(value) ? value : "/";
}
