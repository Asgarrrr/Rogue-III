/**
 * Prefab System Tests
 *
 * Comprehensive tests for room template creation, transformation, and selection.
 */

import { describe, expect, it } from "bun:test";
import {
  ALL_TEMPLATES,
  CROSS_BASE,
  createTemplate,
  generateAllRotations,
  generateAllVariants,
  getTemplateAbsoluteCells,
  getTemplateArea,
  getTemplateCenter,
  L_SHAPE_BASE,
  mirrorTemplate,
  type RoomTemplate,
  rotateTemplate,
  scaleTemplate,
  selectTemplateForLeaf,
  T_SHAPE_BASE,
  templateFitsInBounds,
} from "../src/prefabs";

// =============================================================================
// createTemplate Tests
// =============================================================================

describe("createTemplate", () => {
  it("creates a template from valid pattern", () => {
    const template = createTemplate("test", "l-shape", [
      [1, 1, 0],
      [1, 0, 0],
      [1, 0, 0],
    ]);

    expect(template.id).toBe("test");
    expect(template.shape).toBe("l-shape");
    expect(template.width).toBe(3);
    expect(template.height).toBe(3);
    expect(template.cells.length).toBe(4);
  });

  it("calculates correct anchor point (centroid)", () => {
    const template = createTemplate("test", "l-shape", [
      [1, 1, 0],
      [1, 0, 0],
      [1, 0, 0],
    ]);

    // Cells: (0,0), (1,0), (0,1), (0,2)
    // Centroid: x = (0+1+0+0)/4 = 0.25 -> floor = 0
    //           y = (0+0+1+2)/4 = 0.75 -> floor = 0
    expect(template.anchorX).toBe(0);
    expect(template.anchorY).toBe(0);
  });

  it("accepts optional configuration", () => {
    const template = createTemplate(
      "test",
      "l-shape",
      [
        [1, 1, 0],
        [1, 0, 0],
      ],
      {
        minLeafSize: 10,
        compatibleTypes: ["boss", "treasure"],
        tags: ["test", "asymmetric"],
      },
    );

    expect(template.minLeafSize).toBe(10);
    expect(template.compatibleTypes).toEqual(["boss", "treasure"]);
    expect(template.tags).toEqual(["test", "asymmetric"]);
  });

  it("uses default minLeafSize if not provided", () => {
    const template = createTemplate("test", "l-shape", [
      [1, 1, 0],
      [1, 0, 0],
      [1, 0, 0],
    ]);

    // Default should be max(width, height) + 2 = 3 + 2 = 5
    expect(template.minLeafSize).toBe(5);
  });

  it("throws on empty pattern", () => {
    expect(() => createTemplate("test", "l-shape", [])).toThrow(
      'Template "test": pattern cannot be empty',
    );
  });

  it("throws on empty first row", () => {
    expect(() => createTemplate("test", "l-shape", [[]])).toThrow(
      'Template "test": first row cannot be empty',
    );
  });

  it("throws on jagged arrays", () => {
    expect(() =>
      createTemplate("test", "l-shape", [
        [1, 1, 0],
        [1, 0], // Too short!
        [1, 0, 0],
      ]),
    ).toThrow('Template "test": jagged pattern detected at row 1');
  });

  it("throws on pattern with no floor cells", () => {
    expect(() =>
      createTemplate("test", "l-shape", [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ]),
    ).toThrow(
      'Template "test": pattern must contain at least one floor cell (1)',
    );
  });
});

// =============================================================================
// rotateTemplate Tests
// =============================================================================

describe("rotateTemplate", () => {
  it("rotates 90 degrees correctly", () => {
    const original = createTemplate("test", "l-shape", [
      [1, 1, 0],
      [1, 0, 0],
      [1, 0, 0],
    ]);

    const rotated = rotateTemplate(original, 90);

    // 90° rotation: (x, y) -> (height - 1 - y, x)
    // Original cells: (0,0), (1,0), (0,1), (0,2)
    // Rotated cells:  (2,0), (2,1), (1,0), (0,0)
    expect(rotated.id).toBe("test_r90");
    expect(rotated.width).toBe(3); // height of original
    expect(rotated.height).toBe(3); // width of original
    expect(rotated.cells.length).toBe(4);

    // Check that specific cells are in correct positions
    const cellSet = new Set(rotated.cells.map((c) => `${c.dx},${c.dy}`));
    expect(cellSet.has("2,0")).toBe(true);
    expect(cellSet.has("2,1")).toBe(true);
    expect(cellSet.has("1,0")).toBe(true);
    expect(cellSet.has("0,0")).toBe(true);
  });

  it("rotates 180 degrees correctly", () => {
    const original = createTemplate("test", "l-shape", [
      [1, 1, 0],
      [1, 0, 0],
      [1, 0, 0],
    ]);

    const rotated = rotateTemplate(original, 180);

    // 180° rotation: (x, y) -> (width - 1 - x, height - 1 - y)
    // Original cells: (0,0), (1,0), (0,1), (0,2)
    // Rotated cells:  (2,2), (1,2), (2,1), (2,0)
    expect(rotated.id).toBe("test_r180");
    expect(rotated.width).toBe(3); // same
    expect(rotated.height).toBe(3); // same

    const cellSet = new Set(rotated.cells.map((c) => `${c.dx},${c.dy}`));
    expect(cellSet.has("2,2")).toBe(true);
    expect(cellSet.has("1,2")).toBe(true);
    expect(cellSet.has("2,1")).toBe(true);
    expect(cellSet.has("2,0")).toBe(true);
  });

  it("rotates 270 degrees correctly", () => {
    const original = createTemplate("test", "l-shape", [
      [1, 1, 0],
      [1, 0, 0],
      [1, 0, 0],
    ]);

    const rotated = rotateTemplate(original, 270);

    // 270° rotation: (x, y) -> (y, width - 1 - x)
    // Original cells: (0,0), (1,0), (0,1), (0,2)
    // Rotated cells:  (0,2), (0,1), (1,2), (2,2)
    expect(rotated.id).toBe("test_r270");
    expect(rotated.width).toBe(3); // height of original
    expect(rotated.height).toBe(3); // width of original

    const cellSet = new Set(rotated.cells.map((c) => `${c.dx},${c.dy}`));
    expect(cellSet.has("0,2")).toBe(true);
    expect(cellSet.has("0,1")).toBe(true);
    expect(cellSet.has("1,2")).toBe(true);
    expect(cellSet.has("2,2")).toBe(true);
  });

  it("preserves cell count after rotation", () => {
    const original = createTemplate("test", "custom", [
      [1, 1, 1],
      [0, 1, 0],
    ]);

    const r90 = rotateTemplate(original, 90);
    const r180 = rotateTemplate(original, 180);
    const r270 = rotateTemplate(original, 270);

    expect(r90.cells.length).toBe(original.cells.length);
    expect(r180.cells.length).toBe(original.cells.length);
    expect(r270.cells.length).toBe(original.cells.length);
  });

  it("swaps dimensions for 90/270 rotation", () => {
    const original = createTemplate("test", "custom", [
      [1, 1, 1, 1],
      [0, 1, 0, 0],
    ]);

    expect(original.width).toBe(4);
    expect(original.height).toBe(2);

    const r90 = rotateTemplate(original, 90);
    expect(r90.width).toBe(2);
    expect(r90.height).toBe(4);

    const r270 = rotateTemplate(original, 270);
    expect(r270.width).toBe(2);
    expect(r270.height).toBe(4);
  });

  it("keeps dimensions for 180 rotation", () => {
    const original = createTemplate("test", "custom", [
      [1, 1, 1, 1],
      [0, 1, 0, 0],
    ]);

    const r180 = rotateTemplate(original, 180);
    expect(r180.width).toBe(4);
    expect(r180.height).toBe(2);
  });

  it("recalculates anchor after rotation", () => {
    const original = createTemplate("test", "custom", [
      [1, 1, 1],
      [0, 0, 1],
    ]);

    const rotated = rotateTemplate(original, 90);

    // Anchor should be recalculated based on new cell positions
    expect(typeof rotated.anchorX).toBe("number");
    expect(typeof rotated.anchorY).toBe("number");
    expect(rotated.anchorX).toBeGreaterThanOrEqual(0);
    expect(rotated.anchorY).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// mirrorTemplate Tests
// =============================================================================

describe("mirrorTemplate", () => {
  it("mirrors along X axis correctly", () => {
    const original = createTemplate("test", "l-shape", [
      [1, 1, 0],
      [1, 0, 0],
      [1, 0, 0],
    ]);

    const mirrored = mirrorTemplate(original, "x");

    // Mirror X: (x, y) -> (width - 1 - x, y)
    // Original cells: (0,0), (1,0), (0,1), (0,2)
    // Mirrored cells: (2,0), (1,0), (2,1), (2,2)
    expect(mirrored.id).toBe("test_mx");
    expect(mirrored.width).toBe(3);
    expect(mirrored.height).toBe(3);

    const cellSet = new Set(mirrored.cells.map((c) => `${c.dx},${c.dy}`));
    expect(cellSet.has("2,0")).toBe(true);
    expect(cellSet.has("1,0")).toBe(true);
    expect(cellSet.has("2,1")).toBe(true);
    expect(cellSet.has("2,2")).toBe(true);
  });

  it("mirrors along Y axis correctly", () => {
    const original = createTemplate("test", "l-shape", [
      [1, 1, 0],
      [1, 0, 0],
      [1, 0, 0],
    ]);

    const mirrored = mirrorTemplate(original, "y");

    // Mirror Y: (x, y) -> (x, height - 1 - y)
    // Original cells: (0,0), (1,0), (0,1), (0,2)
    // Mirrored cells: (0,2), (1,2), (0,1), (0,0)
    expect(mirrored.id).toBe("test_my");
    expect(mirrored.width).toBe(3);
    expect(mirrored.height).toBe(3);

    const cellSet = new Set(mirrored.cells.map((c) => `${c.dx},${c.dy}`));
    expect(cellSet.has("0,2")).toBe(true);
    expect(cellSet.has("1,2")).toBe(true);
    expect(cellSet.has("0,1")).toBe(true);
    expect(cellSet.has("0,0")).toBe(true);
  });

  it("preserves dimensions", () => {
    const original = createTemplate("test", "custom", [
      [1, 1, 1, 1],
      [0, 1, 0, 0],
    ]);

    const mx = mirrorTemplate(original, "x");
    const my = mirrorTemplate(original, "y");

    expect(mx.width).toBe(4);
    expect(mx.height).toBe(2);
    expect(my.width).toBe(4);
    expect(my.height).toBe(2);
  });

  it("preserves cell count", () => {
    const original = createTemplate("test", "custom", [
      [1, 1, 1],
      [0, 1, 0],
      [1, 1, 1],
    ]);

    const mx = mirrorTemplate(original, "x");
    const my = mirrorTemplate(original, "y");

    expect(mx.cells.length).toBe(original.cells.length);
    expect(my.cells.length).toBe(original.cells.length);
  });
});

// =============================================================================
// scaleTemplate Tests
// =============================================================================

describe("scaleTemplate", () => {
  it("scales by factor 1 returns same template", () => {
    const original = createTemplate("test", "custom", [
      [1, 1],
      [1, 0],
    ]);

    const scaled = scaleTemplate(original, 1);

    expect(scaled).toBe(original); // Same reference
  });

  it("scales by factor 2 correctly", () => {
    const original = createTemplate("test", "custom", [
      [1, 1],
      [1, 0],
    ]);

    const scaled = scaleTemplate(original, 2);

    expect(scaled.id).toBe("test_s2");
    expect(scaled.width).toBe(4); // 2 * 2
    expect(scaled.height).toBe(4); // 2 * 2

    // Original has 3 cells, scaled should have 3 * 2 * 2 = 12 cells
    expect(scaled.cells.length).toBe(12);
  });

  it("scales by factor 3 correctly", () => {
    const original = createTemplate("test", "custom", [
      [1, 1],
      [1, 0],
    ]);

    const scaled = scaleTemplate(original, 3);

    expect(scaled.width).toBe(6); // 2 * 3
    expect(scaled.height).toBe(6); // 2 * 3

    // Original has 3 cells, scaled should have 3 * 3 * 3 = 27 cells
    expect(scaled.cells.length).toBe(27);
  });

  it("scales dimensions correctly", () => {
    const original = createTemplate("test", "custom", [
      [1, 1, 1],
      [0, 1, 0],
    ]);

    expect(original.width).toBe(3);
    expect(original.height).toBe(2);

    const scaled = scaleTemplate(original, 2);

    expect(scaled.width).toBe(6);
    expect(scaled.height).toBe(4);
  });

  it("scales anchor point correctly", () => {
    const original = createTemplate("test", "custom", [
      [1, 1, 1],
      [0, 1, 0],
    ]);

    const scaled = scaleTemplate(original, 2);

    expect(scaled.anchorX).toBe(original.anchorX * 2);
    expect(scaled.anchorY).toBe(original.anchorY * 2);
  });

  it("scales minLeafSize correctly", () => {
    const original = createTemplate(
      "test",
      "custom",
      [
        [1, 1],
        [1, 0],
      ],
      { minLeafSize: 10 },
    );

    const scaled = scaleTemplate(original, 2);

    expect(scaled.minLeafSize).toBe(20); // 10 * 2
  });

  it("creates correct cell positions when scaled", () => {
    const original = createTemplate("test", "custom", [
      [1, 0],
      [0, 0],
    ]);

    // Original cell at (0, 0)
    const scaled = scaleTemplate(original, 2);

    // Scaled should have cells at (0,0), (1,0), (0,1), (1,1)
    const cellSet = new Set(scaled.cells.map((c) => `${c.dx},${c.dy}`));
    expect(cellSet.has("0,0")).toBe(true);
    expect(cellSet.has("1,0")).toBe(true);
    expect(cellSet.has("0,1")).toBe(true);
    expect(cellSet.has("1,1")).toBe(true);
  });

  it("throws on non-integer scale factor", () => {
    const original = createTemplate("test", "custom", [
      [1, 1],
      [1, 0],
    ]);

    expect(() => scaleTemplate(original, 2.5)).toThrow(
      "Scale factor must be a positive integer",
    );
  });

  it("throws on scale factor < 1", () => {
    const original = createTemplate("test", "custom", [
      [1, 1],
      [1, 0],
    ]);

    expect(() => scaleTemplate(original, 0)).toThrow(
      "Scale factor must be a positive integer",
    );
  });
});

// =============================================================================
// templateFitsInBounds Tests
// =============================================================================

describe("templateFitsInBounds", () => {
  it("returns true when template fits exactly", () => {
    const template = createTemplate("test", "custom", [
      [1, 1, 1],
      [1, 1, 1],
    ]);

    expect(templateFitsInBounds(template, 3, 2)).toBe(true);
  });

  it("returns true when template fits with room to spare", () => {
    const template = createTemplate("test", "custom", [
      [1, 1],
      [1, 1],
    ]);

    expect(templateFitsInBounds(template, 5, 5)).toBe(true);
  });

  it("returns false when width exceeds bounds", () => {
    const template = createTemplate("test", "custom", [
      [1, 1, 1, 1],
      [1, 1, 1, 1],
    ]);

    expect(templateFitsInBounds(template, 3, 5)).toBe(false);
  });

  it("returns false when height exceeds bounds", () => {
    const template = createTemplate("test", "custom", [
      [1, 1],
      [1, 1],
      [1, 1],
    ]);

    expect(templateFitsInBounds(template, 5, 2)).toBe(false);
  });

  it("returns false when both dimensions exceed bounds", () => {
    const template = createTemplate("test", "custom", [
      [1, 1, 1, 1],
      [1, 1, 1, 1],
      [1, 1, 1, 1],
    ]);

    expect(templateFitsInBounds(template, 2, 2)).toBe(false);
  });
});

// =============================================================================
// getTemplateAbsoluteCells Tests
// =============================================================================

describe("getTemplateAbsoluteCells", () => {
  it("converts relative positions to absolute", () => {
    const template = createTemplate("test", "custom", [
      [1, 1],
      [1, 0],
    ]);

    const absoluteCells = getTemplateAbsoluteCells(template, 10, 20);

    // Template cells: (0,0), (1,0), (0,1)
    // Absolute should be: (10,20), (11,20), (10,21)
    expect(absoluteCells.length).toBe(3);
    expect(absoluteCells.some((c) => c.x === 10 && c.y === 20)).toBe(true);
    expect(absoluteCells.some((c) => c.x === 11 && c.y === 20)).toBe(true);
    expect(absoluteCells.some((c) => c.x === 10 && c.y === 21)).toBe(true);
  });

  it("handles origin position (0, 0)", () => {
    const template = createTemplate("test", "custom", [
      [1, 1],
      [1, 0],
    ]);

    const absoluteCells = getTemplateAbsoluteCells(template, 0, 0);

    // Should be same as relative positions
    expect(absoluteCells.length).toBe(3);
    expect(absoluteCells.some((c) => c.x === 0 && c.y === 0)).toBe(true);
    expect(absoluteCells.some((c) => c.x === 1 && c.y === 0)).toBe(true);
    expect(absoluteCells.some((c) => c.x === 0 && c.y === 1)).toBe(true);
  });

  it("handles negative positions", () => {
    const template = createTemplate("test", "custom", [
      [1, 1],
      [1, 0],
    ]);

    const absoluteCells = getTemplateAbsoluteCells(template, -5, -10);

    expect(absoluteCells.length).toBe(3);
    expect(absoluteCells.some((c) => c.x === -5 && c.y === -10)).toBe(true);
    expect(absoluteCells.some((c) => c.x === -4 && c.y === -10)).toBe(true);
    expect(absoluteCells.some((c) => c.x === -5 && c.y === -9)).toBe(true);
  });
});

// =============================================================================
// getTemplateArea Tests
// =============================================================================

describe("getTemplateArea", () => {
  it("returns number of floor cells", () => {
    const template = createTemplate("test", "custom", [
      [1, 1, 1],
      [0, 1, 0],
    ]);

    expect(getTemplateArea(template)).toBe(4);
  });

  it("returns correct area for L-shape", () => {
    const template = createTemplate("test", "l-shape", [
      [1, 1, 0],
      [1, 0, 0],
      [1, 0, 0],
    ]);

    expect(getTemplateArea(template)).toBe(4);
  });

  it("returns correct area for filled rectangle", () => {
    const template = createTemplate("test", "rectangle", [
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
    ]);

    expect(getTemplateArea(template)).toBe(9);
  });

  it("returns correct area for single cell", () => {
    const template = createTemplate("test", "custom", [[1]]);

    expect(getTemplateArea(template)).toBe(1);
  });
});

// =============================================================================
// getTemplateCenter Tests
// =============================================================================

describe("getTemplateCenter", () => {
  it("calculates center correctly", () => {
    const template = createTemplate("test", "custom", [
      [1, 1],
      [1, 1],
    ]);

    // Cells: (0,0), (1,0), (0,1), (1,1)
    // With room at (10, 20):
    // Absolute: (10,20), (11,20), (10,21), (11,21)
    // Center: (10+11+10+11)/4 = 10.5 -> 10, (20+20+21+21)/4 = 20.5 -> 20
    const center = getTemplateCenter(template, 10, 20);

    expect(center.x).toBe(10);
    expect(center.y).toBe(20);
  });

  it("handles single cell template", () => {
    const template = createTemplate("test", "custom", [[1]]);

    const center = getTemplateCenter(template, 5, 7);

    expect(center.x).toBe(5);
    expect(center.y).toBe(7);
  });

  it("handles L-shape center", () => {
    const template = createTemplate("test", "l-shape", [
      [1, 1, 0],
      [1, 0, 0],
      [1, 0, 0],
    ]);

    // Cells: (0,0), (1,0), (0,1), (0,2)
    // With room at (0, 0):
    // Center: (0+1+0+0)/4 = 0.25 -> 0, (0+0+1+2)/4 = 0.75 -> 0
    const center = getTemplateCenter(template, 0, 0);

    expect(center.x).toBe(0);
    expect(center.y).toBe(0);
  });

  it("returns room position for empty template (edge case)", () => {
    // This is an edge case that shouldn't happen in practice
    // but the function handles it gracefully
    const template: RoomTemplate = {
      id: "empty",
      shape: "custom",
      cells: [],
      width: 1,
      height: 1,
      anchorX: 0,
      anchorY: 0,
      minLeafSize: 1,
    };

    const center = getTemplateCenter(template, 10, 20);

    expect(center.x).toBe(10);
    expect(center.y).toBe(20);
  });
});

// =============================================================================
// selectTemplateForLeaf Tests
// =============================================================================

describe("selectTemplateForLeaf", () => {
  const simpleTemplate = createTemplate("small", "custom", [
    [1, 1],
    [1, 1],
  ]);

  const largeTemplate = createTemplate(
    "large",
    "custom",
    [
      [1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1],
    ],
    { minLeafSize: 20 },
  );

  const bossTemplate = createTemplate(
    "boss-room",
    "custom",
    [
      [1, 1, 1],
      [1, 1, 1],
    ],
    { compatibleTypes: ["boss"] },
  );

  const taggedTemplate = createTemplate(
    "tagged",
    "custom",
    [
      [1, 1],
      [1, 1],
    ],
    { tags: ["special", "unique"] },
  );

  it("returns null when RNG exceeds templateChance", () => {
    const templates = [simpleTemplate];
    const rng = () => 0.9; // Always returns high value

    const result = selectTemplateForLeaf(templates, 10, 10, rng, {
      templateChance: 0.5,
      minLeafSize: 8,
    });

    expect(result).toBeNull();
  });

  it("selects template when RNG is within templateChance", () => {
    const templates = [simpleTemplate];
    const rng = () => 0.1; // Always returns low value

    const result = selectTemplateForLeaf(templates, 10, 10, rng, {
      templateChance: 0.5,
      minLeafSize: 8,
    });

    expect(result).toBe(simpleTemplate);
  });

  it("filters templates by minLeafSize", () => {
    const templates = [simpleTemplate, largeTemplate];
    const rng = () => 0.1; // Pass templateChance check

    // Leaf too small for largeTemplate
    const result = selectTemplateForLeaf(templates, 15, 15, rng, {
      templateChance: 1.0,
      minLeafSize: 8,
    });

    expect(result).toBe(simpleTemplate);
  });

  it("returns null when no templates fit", () => {
    const templates = [largeTemplate];
    const rng = () => 0.1;

    const result = selectTemplateForLeaf(templates, 5, 5, rng, {
      templateChance: 1.0,
      minLeafSize: 8,
    });

    expect(result).toBeNull();
  });

  it("respects padding when checking bounds", () => {
    const tightTemplate = createTemplate("tight", "custom", [
      [1, 1, 1, 1, 1, 1, 1, 1, 1], // 9 wide
      [1, 1, 1, 1, 1, 1, 1, 1, 1],
    ]);

    const templates = [tightTemplate];
    const rng = () => 0.1;

    // Leaf is exactly 10x10, but padding requires 2 extra
    // Available space: 10 - 2 = 8, template is 9, so it won't fit
    const result = selectTemplateForLeaf(templates, 10, 10, rng, {
      templateChance: 1.0,
      minLeafSize: 8,
    });

    // Template is 9 wide, but only 8 available (10 - 2 padding), should NOT fit
    expect(result).toBeNull();
  });

  it("filters by room type compatibility", () => {
    const templates = [bossTemplate, simpleTemplate];
    const rng = () => 0.1;

    const result = selectTemplateForLeaf(templates, 10, 10, rng, {
      templateChance: 1.0,
      minLeafSize: 8,
      roomType: "normal",
    });

    // Should only select simpleTemplate (no type restriction)
    expect(result).toBe(simpleTemplate);
  });

  it("selects compatible room type", () => {
    const templates = [bossTemplate];
    const rng = () => 0.1;

    const result = selectTemplateForLeaf(templates, 10, 10, rng, {
      templateChance: 1.0,
      minLeafSize: 8,
      roomType: "boss",
    });

    expect(result).toBe(bossTemplate);
  });

  it("filters by required tags", () => {
    const templates = [taggedTemplate, simpleTemplate];
    const rng = () => 0.1;

    const result = selectTemplateForLeaf(templates, 10, 10, rng, {
      templateChance: 1.0,
      minLeafSize: 8,
      requiredTags: ["special"],
    });

    expect(result).toBe(taggedTemplate);
  });

  it("returns null when tags don't match", () => {
    const templates = [taggedTemplate];
    const rng = () => 0.1;

    const result = selectTemplateForLeaf(templates, 10, 10, rng, {
      templateChance: 1.0,
      minLeafSize: 8,
      requiredTags: ["nonexistent"],
    });

    expect(result).toBeNull();
  });

  it("handles multiple required tags", () => {
    const templates = [taggedTemplate];
    const rng = () => 0.1;

    const resultSuccess = selectTemplateForLeaf(templates, 10, 10, rng, {
      templateChance: 1.0,
      minLeafSize: 8,
      requiredTags: ["special", "unique"],
    });

    expect(resultSuccess).toBe(taggedTemplate);

    const resultFailure = selectTemplateForLeaf(templates, 10, 10, rng, {
      templateChance: 1.0,
      minLeafSize: 8,
      requiredTags: ["special", "missing"],
    });

    expect(resultFailure).toBeNull();
  });

  it("guards against RNG returning exactly 1.0", () => {
    const templates = [simpleTemplate];
    const rng = () => 1.0; // Edge case

    const result = selectTemplateForLeaf(templates, 10, 10, rng, {
      templateChance: 1.0,
      minLeafSize: 8,
    });

    // Should still work (Math.min guards against out of bounds)
    expect(result).toBe(simpleTemplate);
  });

  it("randomly selects from multiple fitting templates", () => {
    const template1 = createTemplate("t1", "custom", [
      [1, 1],
      [1, 1],
    ]);
    const template2 = createTemplate("t2", "custom", [
      [1, 1],
      [1, 1],
    ]);
    const templates = [template1, template2];

    // RNG that passes chance check, then selects index 1
    let callCount = 0;
    const rng = () => {
      callCount++;
      return callCount === 1 ? 0.1 : 0.6; // First call passes chance, second selects index
    };

    const result = selectTemplateForLeaf(templates, 10, 10, rng, {
      templateChance: 1.0,
      minLeafSize: 8,
    });

    // Should select template at index floor(0.6 * 2) = 1
    expect(result).toBe(template2);
  });
});

// =============================================================================
// generateAllRotations Tests
// =============================================================================

describe("generateAllRotations", () => {
  it("generates 4 rotations for non-symmetric shapes", () => {
    const lShape = createTemplate("l", "l-shape", [
      [1, 1, 0],
      [1, 0, 0],
      [1, 0, 0],
    ]);

    const rotations = generateAllRotations(lShape);

    expect(rotations.length).toBe(4);
    expect(rotations[0]).toBe(lShape);
    expect(rotations[1].id).toBe("l_r90");
    expect(rotations[2].id).toBe("l_r180");
    expect(rotations[3].id).toBe("l_r270");
  });

  it("generates 4 rotations for T-shape", () => {
    const tShape = createTemplate("t", "t-shape", [
      [1, 1, 1],
      [0, 1, 0],
    ]);

    const rotations = generateAllRotations(tShape);

    expect(rotations.length).toBe(4);
  });

  it("generates only 1 rotation for cross shape (rotationally symmetric)", () => {
    const cross = createTemplate("cross", "cross", [
      [0, 1, 0],
      [1, 1, 1],
      [0, 1, 0],
    ]);

    const rotations = generateAllRotations(cross);

    expect(rotations.length).toBe(1);
    expect(rotations[0]).toBe(cross);
  });

  it("generates only 1 rotation for plus shape (rotationally symmetric)", () => {
    const plus = createTemplate("plus", "plus", [
      [0, 1, 1, 1, 0],
      [1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1],
      [0, 1, 1, 1, 0],
    ]);

    const rotations = generateAllRotations(plus);

    expect(rotations.length).toBe(1);
    expect(rotations[0]).toBe(plus);
  });

  it("generates 4 rotations for custom shapes", () => {
    const custom = createTemplate("custom", "custom", [
      [1, 1, 0],
      [0, 1, 1],
    ]);

    const rotations = generateAllRotations(custom);

    expect(rotations.length).toBe(4);
  });
});

// =============================================================================
// generateAllVariants Tests
// =============================================================================

describe("generateAllVariants", () => {
  it("generates 8 variants for L-shape (4 rotations * 2 mirrors)", () => {
    const lShape = createTemplate("l", "l-shape", [
      [1, 1, 0],
      [1, 0, 0],
      [1, 0, 0],
    ]);

    const variants = generateAllVariants(lShape);

    // 4 rotations + 4 mirrored rotations = 8
    expect(variants.length).toBe(8);
  });

  it("generates 4 variants for T-shape (no mirrors)", () => {
    const tShape = createTemplate("t", "t-shape", [
      [1, 1, 1],
      [0, 1, 0],
    ]);

    const variants = generateAllVariants(tShape);

    // Only rotations, no mirrors for T-shape
    expect(variants.length).toBe(4);
  });

  it("generates 1 variant for cross (symmetric)", () => {
    const cross = createTemplate("cross", "cross", [
      [0, 1, 0],
      [1, 1, 1],
      [0, 1, 0],
    ]);

    const variants = generateAllVariants(cross);

    expect(variants.length).toBe(1);
  });

  it("generates 4 variants for custom shapes (no mirrors)", () => {
    const custom = createTemplate("custom", "custom", [
      [1, 1, 0],
      [0, 1, 1],
    ]);

    const variants = generateAllVariants(custom);

    // Only rotations, no mirrors for custom shapes
    expect(variants.length).toBe(4);
  });

  it("L-shape variants include both rotations and mirrors", () => {
    const lShape = createTemplate("l", "l-shape", [
      [1, 1, 0],
      [1, 0, 0],
      [1, 0, 0],
    ]);

    const variants = generateAllVariants(lShape);

    // Check we have both rotations and mirrors
    const ids = variants.map((v) => v.id);

    // Original rotations
    expect(ids).toContain("l");
    expect(ids).toContain("l_r90");
    expect(ids).toContain("l_r180");
    expect(ids).toContain("l_r270");

    // Mirrored rotations
    expect(ids).toContain("l_mx");
    expect(ids).toContain("l_r90_mx");
    expect(ids).toContain("l_r180_mx");
    expect(ids).toContain("l_r270_mx");
  });
});

// =============================================================================
// Predefined Shapes Tests
// =============================================================================

describe("predefined shapes", () => {
  it("L_SHAPE_BASE has correct dimensions", () => {
    expect(L_SHAPE_BASE.shape).toBe("l-shape");
    expect(L_SHAPE_BASE.width).toBe(3);
    expect(L_SHAPE_BASE.height).toBe(3);
    expect(L_SHAPE_BASE.cells.length).toBe(4);
  });

  it("T_SHAPE_BASE has correct dimensions", () => {
    expect(T_SHAPE_BASE.shape).toBe("t-shape");
    expect(T_SHAPE_BASE.width).toBe(3);
    expect(T_SHAPE_BASE.height).toBe(3);
    expect(T_SHAPE_BASE.cells.length).toBe(5);
  });

  it("CROSS_BASE has correct dimensions", () => {
    expect(CROSS_BASE.shape).toBe("cross");
    expect(CROSS_BASE.width).toBe(3);
    expect(CROSS_BASE.height).toBe(3);
    expect(CROSS_BASE.cells.length).toBe(5);
  });

  it("ALL_TEMPLATES contains no duplicate IDs", () => {
    const ids = ALL_TEMPLATES.map((t) => t.id);
    const uniqueIds = new Set(ids);

    expect(ids.length).toBe(uniqueIds.size);
  });

  it("ALL_TEMPLATES contains expected base shapes", () => {
    const shapes = ALL_TEMPLATES.map((t) => t.shape);

    expect(shapes).toContain("l-shape");
    expect(shapes).toContain("t-shape");
    expect(shapes).toContain("cross");
    expect(shapes).toContain("plus");
    expect(shapes).toContain("custom");
  });

  it("ALL_TEMPLATES has reasonable size", () => {
    // Should have multiple variants
    expect(ALL_TEMPLATES.length).toBeGreaterThan(10);
    // But not an unreasonable number
    expect(ALL_TEMPLATES.length).toBeLessThan(100);
  });
});
