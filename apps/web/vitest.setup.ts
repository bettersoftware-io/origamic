import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Unmounts whatever a test rendered, so one test's screen never leaks into the
// next. The testing library does this by itself only when the test runner's
// globals are switched on, which they are not here.
afterEach(() => {
  cleanup();
});

// A test of the build runs in Node, where there is no page to fill in.
if (typeof window !== "undefined") {
  standInForLayout();
}

/**
 * jsdom lays nothing out, and has none of what Radix's Select calls when it
 * opens (pointer capture, scrolling an option into view) or what its
 * Checkbox and dockview measure themselves with (a ResizeObserver). A real
 * browser has them all; here they do nothing.
 */
function standInForLayout(): void {
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
}
