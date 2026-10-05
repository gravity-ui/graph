export const generateRandomId: (key?: string) => string = ((): (() => string) => {
  let idCounter = 0;

  return function generateRandomIdImpl(key = "model"): string {
    idCounter += 1;

    return `${key}-${Date.now()}-${idCounter}`;
  };
})();
