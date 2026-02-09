export interface WorldCoordinates {
  x: number;
  y: number;
}

export interface ScreenCoordinates {
  x: number;
  y: number;
}

export interface CameraState {
  x: number;
  y: number;
  scale: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class CoordinateTransformer {
  /**
   * Transforms world coordinates to screen coordinates  
   * Formula: screenX = worldX * scale + cameraX
   * (inverse of CameraService.applyToPoint)
   */
  static worldToScreen(
    world: WorldCoordinates,
    camera: CameraState
  ): ScreenCoordinates {
    return {
      x: world.x * camera.scale + camera.x,
      y: world.y * camera.scale + camera.y,
    };
  }

  /**
   * Transforms screen coordinates to world coordinates
   * Formula: worldX = (screenX - cameraX) / scale
   */
  static screenToWorld(
    screen: ScreenCoordinates,
    camera: CameraState
  ): WorldCoordinates {
    return {
      x: (screen.x - camera.x) / camera.scale,
      y: (screen.y - camera.y) / camera.scale,
    };
  }

  /**
   * Get center of a rect in world coordinates
   */
  static getRectCenter(rect: Rect): WorldCoordinates {
    return {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    };
  }
}
