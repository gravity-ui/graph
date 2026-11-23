import type { Buffer, Device, Texture } from "@luma.gl/core";
import { DynamicBuffer } from "@luma.gl/engine";
import { WEBGLTexture } from "@luma.gl/webgl";

import { STYLE_ROW_TEXELS } from "../instances/tables";

import { BUFFER_USAGE, FLOAT_BYTES, INITIAL_INSTANCES, TABLE_SAMPLER, TEXTURE_USAGE } from "./programs";

export function createTemplate(device: Device, data: Float32Array): Buffer {
  return device.createBuffer({ usage: BUFFER_USAGE, data });
}

export function createInstanceBuffer(device: Device, floats: number): DynamicBuffer {
  return new DynamicBuffer(device, {
    usage: BUFFER_USAGE,
    byteLength: INITIAL_INSTANCES * floats * FLOAT_BYTES,
  });
}

export function createTableTexture(device: Device, width: number, height: number, usage = TEXTURE_USAGE): Texture {
  return device.createTexture({
    format: "rgba32float",
    width,
    height,
    usage,
    sampler: TABLE_SAMPLER,
  });
}

/** Only vertical growth preserves every resident record's texel coordinates. */
export function copyPathRecordRows(gl: WebGL2RenderingContext, previous: Texture, next: Texture): boolean {
  if (!(previous instanceof WEBGLTexture && next instanceof WEBGLTexture)) return false;
  const framebuffer = gl.createFramebuffer();
  if (!framebuffer) return false;
  const read = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
  const bound = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
  try {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, previous.handle, 0);
    if (gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return false;
    gl.bindTexture(gl.TEXTURE_2D, next.handle);
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, previous.width, previous.height);
    return true;
  } finally {
    gl.bindTexture(gl.TEXTURE_2D, bound);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read);
    gl.deleteFramebuffer(framebuffer);
  }
}

/** Rows of style texels without overrides and base colours (alpha -1) and without dim (r 0). */
export function noStyles(rows: number): Float32Array {
  const data = new Float32Array(rows * STYLE_ROW_TEXELS * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = -1;
  return data;
}
