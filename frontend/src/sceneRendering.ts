import type { Application } from 'playcanvas';

const FRAME_INTERVAL_MS = 1000 / 30;

/** Browser/OS hint: actual GPU selection is controlled by the user's graphics settings. */
export const SCENE_GRAPHICS_OPTIONS = {
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
} as const;

/** Limit GPU submissions, not updates: short effects and game presentation keep their clocks. */
export function configureSceneRendering(
  app: Application,
  visibility: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'> = document,
  now: () => number = () => performance.now(),
) {
  // Keep the DOM interface at native sharpness while avoiding supersampling the 3D scene.
  app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1);
  const previousAutoRender = app.autoRender;
  app.autoRender = false;
  app.renderNextFrame = false;
  let nextFrameAt: number | undefined;
  let disposed = false;

  const scheduleFrame = () => {
    const time = now();
    const due = !visibility.hidden && (nextFrameAt === undefined || time + .01 >= nextFrameAt);
    // Run after scene updates, immediately before PlayCanvas decides whether to render.
    app.renderNextFrame = due;
    if (due) {
      nextFrameAt = nextFrameAt === undefined || time - nextFrameAt > FRAME_INTERVAL_MS
        ? time + FRAME_INTERVAL_MS
        : nextFrameAt + FRAME_INTERVAL_MS;
    }
  };
  const visibilityChanged = () => {
    nextFrameAt = undefined;
    app.renderNextFrame = false;
  };
  app.on('framerender', scheduleFrame);
  visibility.addEventListener('visibilitychange', visibilityChanged);

  return () => {
    if (disposed) return;
    disposed = true;
    app.off('framerender', scheduleFrame);
    visibility.removeEventListener('visibilitychange', visibilityChanged);
    app.autoRender = previousAutoRender;
    app.renderNextFrame = false;
  };
}
