export default {
  process() {
    return {
      code: "export default {};\nexport const __esModule = true;",
    };
  },
  getCacheKey() {
    return "css-transform";
  },
};
