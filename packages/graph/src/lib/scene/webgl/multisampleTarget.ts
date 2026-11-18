import type { Device } from "@luma.gl/core";

/** A single-sample canvas can still rasterize a stroke union with per-sample color and depth. */
export function createMultisampleTarget(device: Device, gl: WebGL2RenderingContext, width: number, height: number) {
  const handle = gl.createFramebuffer();
  const color = gl.createRenderbuffer();
  const depth = gl.createRenderbuffer();
  const release = () => {
    gl.deleteRenderbuffer(depth);
    gl.deleteRenderbuffer(color);
    gl.deleteFramebuffer(handle);
  };
  if (!handle || !color || !depth) {
    release();
    return undefined;
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, handle);
  gl.bindRenderbuffer(gl.RENDERBUFFER, color);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, 4, gl.RGBA8, width, height);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
  gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, 4, gl.DEPTH_COMPONENT24, width, height);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
  const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (!complete) {
    release();
    return undefined;
  }
  const framebuffer = device.createFramebuffer({ handle, width, height });
  return {
    framebuffer,
    resolve() {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, handle);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    },
    destroy() {
      framebuffer.destroy();
      release();
    },
  };
}
