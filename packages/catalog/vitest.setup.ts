import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Unmounts whatever a test rendered, so one test's screen never leaks into the
// next. The testing library does this by itself only when the test runner's
// globals are switched on, which they are not here.
afterEach(() => {
  cleanup();
});

// jsdom lays nothing out, and has none of what Radix's Select calls when it
// opens (pointer capture, scrolling an option into view) or what its
// Checkbox measures itself with (a ResizeObserver). A real browser has them
// all; here they do nothing.
Element.prototype.hasPointerCapture = function hasPointerCapture(): boolean {
  return false;
};

Element.prototype.releasePointerCapture =
  function releasePointerCapture(): void {
    // Nothing captured the pointer.
  };

Element.prototype.scrollIntoView = function scrollIntoView(): void {
  // Nothing is laid out to scroll.
};

globalThis.ResizeObserver = class {
  observe(): void {
    // Nothing is laid out to measure.
  }

  unobserve(): void {
    // Nothing was observed.
  }

  disconnect(): void {
    // Nothing was observed.
  }
};
