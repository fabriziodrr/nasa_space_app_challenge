/** Percorsi di asset pubblici locali, risolti rispetto alla base Vite. */
function publicPath(path: string): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith('//') || path.includes('\\')) {
    throw new Error('Gli asset di inferenza devono usare percorsi locali al server.');
  }

  return path.startsWith('/') ? path : `${import.meta.env.BASE_URL}${path}`;
}

export const runtimeAssets = Object.freeze({
  modelPath: publicPath(import.meta.env.VITE_MODEL_PATH?.trim() || 'models/face_landmarker.task'),
  wasmPath: publicPath(import.meta.env.VITE_WASM_PATH?.trim() || 'models/wasm/'),
});
