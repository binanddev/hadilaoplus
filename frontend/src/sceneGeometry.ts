import * as pc from 'playcanvas';

/** Only pass geometry whose transforms, visibility and material identity stay fixed. */
export function batchStaticGeometry(app: pc.Application, candidates: pc.Entity[], name: string) {
  const meshes = candidates.filter(entity => {
    const render = entity.render;
    if (!render || !render.enabled || render.batchGroupId !== -1) return false;
    if (render.meshInstances.some(mesh => mesh.material?.blendType !== pc.BLEND_NONE)) return false;
    for (let node: pc.GraphNode | null = entity; node; node = node.parent) {
      if (!node.enabled || node.tags.has('moving-scenery')) return false;
    }
    return true;
  });
  if (!meshes.length || !app.batcher) return;
  // Local groups retain useful camera culling instead of one room-sized bounding box.
  const batch = app.batcher.addGroup(name, false, 12);
  if (!batch) return;
  for (const entity of meshes) entity.render!.batchGroupId = batch.id;
  app.batcher.generate([batch.id]);
}

/** Reuse a lighter smooth sphere for tiny details, keeping full geometry for large objects. */
export function createDetailPrimitives(app: pc.Application) {
  let sphere: pc.Mesh | undefined;
  let disposed = false;
  return {
    addRender(entity: pc.Entity, type: 'box' | 'sphere' | 'cylinder' | 'cone' | 'plane',
      scale: number[], material: pc.StandardMaterial, castShadows = true, allowDetailMesh = true) {
      if (allowDetailMesh && type === 'sphere' && Math.max(...scale.map(Math.abs)) <= .16) {
        if (!sphere) {
          sphere = pc.Mesh.fromGeometry(app.graphicsDevice,
            new pc.SphereGeometry({latitudeBands: 8, longitudeBands: 12}));
          // Retain across character rebuilds even if all current users disappear.
          sphere.incRefCount();
        }
        entity.addComponent('render', {type: 'asset',
          meshInstances: [new pc.MeshInstance(sphere, material)], castShadows});
      } else {
        entity.addComponent('render', {type, material, castShadows});
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (sphere) {
        sphere.decRefCount();
        // Live instances release the last reference during app.root.destroy().
        if (sphere.refCount === 0) sphere.destroy();
      }
    },
  };
}

/** Budget for every local light, including currently disabled muzzle flashes. */
export function configureSceneLighting(app: pc.Application) {
  const localLights = (app.root.findComponents('light') as pc.LightComponent[])
    .filter(light => light.type !== 'directional');
  const lighting = app.scene.lighting;
  lighting.maxLightsPerCell = Math.max(1, localLights.length);
  lighting.maxLights = Math.max(1, localLights.length);
  // Directional sun/moon shadows use their own path and remain enabled.
  lighting.shadowsEnabled = localLights.some(light => light.castShadows);
  lighting.cookiesEnabled = localLights.some(light => Boolean(light.cookie));
  lighting.areaLightsEnabled = localLights.some(light => light.shape !== pc.LIGHTSHAPE_PUNCTUAL);
}
