import "@testing-library/jest-dom";

// Mock DOMMatrix for pdfjs-dist (needed in jsdom environment)
class DOMMatrixMock {
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
  m11 = 1; m12 = 0; m13 = 0; m14 = 0;
  m21 = 0; m22 = 1; m23 = 0; m24 = 0;
  m31 = 0; m32 = 0; m33 = 1; m34 = 0;
  m41 = 0; m42 = 0; m43 = 0; m44 = 1;
  is2D = true;
  isIdentity = true;

  constructor(init?: string | number[]) {
    if (Array.isArray(init) && init.length >= 6) {
      [this.a, this.b, this.c, this.d, this.e, this.f] = init;
    }
  }

  inverse() { return new DOMMatrixMock(); }
  multiply() { return new DOMMatrixMock(); }
  translate() { return new DOMMatrixMock(); }
  scale() { return new DOMMatrixMock(); }
  rotate() { return new DOMMatrixMock(); }
  transformPoint() { return { x: 0, y: 0, z: 0, w: 1 }; }
  toFloat32Array() { return new Float32Array(16); }
  toFloat64Array() { return new Float64Array(16); }

  static fromMatrix() { return new DOMMatrixMock(); }
  static fromFloat32Array() { return new DOMMatrixMock(); }
  static fromFloat64Array() { return new DOMMatrixMock(); }
}

// @ts-ignore
globalThis.DOMMatrix = DOMMatrixMock;
// @ts-ignore
globalThis.DOMMatrixReadOnly = DOMMatrixMock;

// Mock Path2D for canvas operations
class Path2DMock {
  constructor() {}
  addPath() {}
  arc() {}
  arcTo() {}
  bezierCurveTo() {}
  closePath() {}
  ellipse() {}
  lineTo() {}
  moveTo() {}
  quadraticCurveTo() {}
  rect() {}
  roundRect() {}
}
// @ts-ignore
globalThis.Path2D = Path2DMock;

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
