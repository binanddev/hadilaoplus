type Resource = { destroy(): void };
type Scene = Resource & { off(name: string): unknown };

/** Textures must release their GPU state before PlayCanvas destroys its device. */
export function createSceneDisposer(
  app: Scene,
  materials: Set<Resource>,
  textures: Set<Resource>,
) {
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    app.off('update');
    materials.forEach(material => material.destroy());
    materials.clear();
    textures.forEach(texture => texture.destroy());
    textures.clear();
    app.destroy();
  };
}
