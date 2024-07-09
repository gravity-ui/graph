class FpsManager {
  public fps = 0;

  public averageFPS = 0;

  private history: number[] = [];

  public constructor() {
    const times = [];

    const refreshLoop = () => {
      const now = performance.now();
      while (times.length > 0 && times[0] <= now - 1000) {
        times.shift();
      }
      times.push(now);

      this.fps = times.length;
      this.history.push(this.fps);

      if (this.history.length === 11) {
        this.history.shift();
      }

      let sum = 0;

      for (let i = 0; i < this.history.length; i += 1) {
        sum += this.history[i];
      }

      this.averageFPS = Math.floor(sum / 10);

      window.requestAnimationFrame(refreshLoop);
    };

    refreshLoop();
  }
}

export const fpsManager = new FpsManager();
