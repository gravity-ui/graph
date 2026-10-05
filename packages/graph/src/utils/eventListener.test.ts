import { addTypedEventListener } from "./eventListener";

test("DOM adapter preserves native function this, object this and passive behavior", () => {
  const element = document.createElement("div");
  const functionContext = jest.fn();
  const removeFunction = addTypedEventListener<MouseEvent, HTMLDivElement>(
    element,
    "click",
    function (event) {
      functionContext(this, event);
      event.preventDefault();
    },
    { passive: true }
  );
  const objectContext = jest.fn();
  const object = {
    handleEvent(event: MouseEvent) {
      objectContext(this, event);
    },
  };
  const removeObject = addTypedEventListener(element, "click", object);
  const event = new MouseEvent("click", { cancelable: true });
  element.dispatchEvent(event);
  expect(functionContext).toHaveBeenCalledWith(element, event);
  expect(objectContext).toHaveBeenCalledWith(object, event);
  expect(event.defaultPrevented).toBe(false);
  removeFunction();
  removeObject();
  element.dispatchEvent(new MouseEvent("click"));
  expect(functionContext).toHaveBeenCalledTimes(1);
  expect(objectContext).toHaveBeenCalledTimes(1);
});
