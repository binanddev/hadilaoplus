import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as pc from 'playcanvas';
import { createSceneDisposer } from '../src/secretHitler/sceneLifecycle.ts';

test('Secret Hitler releases real PlayCanvas textures while their device is alive', () => {
  const canvas = { id: 'secret-scene-lifecycle', width: 800, height: 600 };
  const device = new pc.NullGraphicsDevice(canvas);
  const app = new pc.AppBase(canvas);
  const options = new pc.AppOptions();
  options.graphicsDevice = device;
  options.componentSystems = [pc.RenderComponentSystem, pc.LightComponentSystem];
  options.resourceHandlers = [];
  app.init(options);

  const texture = new pc.Texture(device, { width: 32, height: 32 });
  const material = new pc.StandardMaterial();
  material.diffuseMap = texture;
  material.update();
  let released = 0;
  const original = device.onTextureDestroyed.bind(device);
  device.onTextureDestroyed = value => {
    if (value === texture) {
      assert.ok(app.graphicsDevice, 'Texture destruction after app.destroy causes the black screen');
      released++;
    }
    original(value);
  };
  const materials = new Set([material]), textures = new Set([texture]);
  const dispose = createSceneDisposer(app, materials, textures);
  dispose();
  assert.equal(released, 1);
  assert.equal(app.graphicsDevice, null);
  assert.equal(materials.size, 0);
  assert.equal(textures.size, 0);
  assert.doesNotThrow(dispose, 'Repeated cleanup must not access an already destroyed device');
});

test('Secret Hitler StrictMode cleanup leaves a fresh scene independent', () => {
  const events = [];
  const create = id => {
    let alive = true;
    const resource = name => ({ destroy() {
      assert.ok(alive, `${id}: ${name} accessed a closed graphics device`);
      events.push(`${id}:${name}`);
    } });
    return createSceneDisposer({
      off(name) { events.push(`${id}:stop-${name}`); },
      destroy() { alive = false; events.push(`${id}:device`); },
    }, new Set([resource('material')]), new Set([resource('texture')]));
  };
  const first = create('first');
  first();
  const second = create('second');
  first();
  second();
  assert.deepEqual(events, [
    'first:stop-update', 'first:material', 'first:texture', 'first:device',
    'second:stop-update', 'second:material', 'second:texture', 'second:device',
  ]);
});
