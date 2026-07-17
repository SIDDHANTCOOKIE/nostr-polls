import { TextDecoder, TextEncoder } from "util";
import "@testing-library/jest-dom";

Object.assign(globalThis, { TextDecoder, TextEncoder });

window.matchMedia = function matchMedia(query: string): MediaQueryList {
  return {
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  } as MediaQueryList;
};
