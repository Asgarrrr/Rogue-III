/**
 * Room Template Utilities
 *
 * Functions for creating, transforming, and selecting room templates.
 */

import type { RoomType } from "../pipeline/types";
import type {
  RoomTemplate,
  TemplateCell,
  TemplateSelectionConfig,
  TemplateShape,
} from "./types";
import { DEFAULT_TEMPLATE_SELECTION } from "./types";

/**
 * Create a template from a 2D pattern array
 *
 * @param id - Unique template identifier
 * @param shape - Shape classification
 * @param pattern - 2D array where 1 = floor, 0 = wall
 * @param options - Additional template options
 * @returns RoomTemplate
 *
 * @example
 * ```typescript
 * const lShape = createTemplate('l-shape', 'l-shape', [
 *   [1, 1, 0],
 *   [1, 0, 0],
 *   [1, 0, 0],
 * ]);
 * ```
 */
export function createTemplate(
  id: string,
  shape: TemplateShape,
  pattern: readonly (readonly number[])[],
  options?: {
    minLeafSize?: number;
    compatibleTypes?: readonly RoomType[];
    tags?: readonly string[];
  },
): RoomTemplate {
  // Validate pattern is not empty
  if (pattern.length === 0) {
    throw new Error(`Template "${id}": pattern cannot be empty`);
  }

  const height = pattern.length;
  const firstRow = pattern[0];
  if (!firstRow || firstRow.length === 0) {
    throw new Error(`Template "${id}": first row cannot be empty`);
  }

  const width = firstRow.length;

  // Validate all rows have the same length (no jagged arrays)
  for (let y = 0; y < height; y++) {
    const row = pattern[y];
    if (!row || row.length !== width) {
      throw new Error(
        `Template "${id}": jagged pattern detected at row ${y} (expected ${width} columns, got ${row?.length ?? 0})`,
      );
    }
  }

  const cells: TemplateCell[] = [];

  for (let y = 0; y < height; y++) {
    const row = pattern[y];
    if (!row) continue;
    for (let x = 0; x < width; x++) {
      if (row[x] === 1) {
        cells.push({ dx: x, dy: y });
      }
    }
  }

  // Validate pattern has at least one floor cell
  if (cells.length === 0) {
    throw new Error(
      `Template "${id}": pattern must contain at least one floor cell (1)`,
    );
  }

  // Find centroid for anchor
  let sumX = 0;
  let sumY = 0;
  for (const cell of cells) {
    sumX += cell.dx;
    sumY += cell.dy;
  }
  const anchorX = cells.length > 0 ? Math.floor(sumX / cells.length) : 0;
  const anchorY = cells.length > 0 ? Math.floor(sumY / cells.length) : 0;

  return {
    id,
    shape,
    cells,
    width,
    height,
    anchorX,
    anchorY,
    minLeafSize: options?.minLeafSize ?? Math.max(width, height) + 2,
    compatibleTypes: options?.compatibleTypes,
    tags: options?.tags,
  };
}

/**
 * Rotate a template by 90, 180, or 270 degrees
 *
 * @param template - Original template
 * @param degrees - Rotation angle
 * @returns New rotated template
 */
export function rotateTemplate(
  template: RoomTemplate,
  degrees: 90 | 180 | 270,
): RoomTemplate {
  const rotatedCells: TemplateCell[] = [];

  for (const cell of template.cells) {
    let newDx: number;
    let newDy: number;

    switch (degrees) {
      case 90:
        // (x, y) -> (height - 1 - y, x)
        newDx = template.height - 1 - cell.dy;
        newDy = cell.dx;
        break;
      case 180:
        // (x, y) -> (width - 1 - x, height - 1 - y)
        newDx = template.width - 1 - cell.dx;
        newDy = template.height - 1 - cell.dy;
        break;
      case 270:
        // (x, y) -> (y, width - 1 - x)
        newDx = cell.dy;
        newDy = template.width - 1 - cell.dx;
        break;
    }

    rotatedCells.push({ dx: newDx, dy: newDy });
  }

  // Recalculate dimensions after rotation
  const newWidth = degrees === 180 ? template.width : template.height;
  const newHeight = degrees === 180 ? template.height : template.width;

  // Recalculate anchor
  let sumX = 0;
  let sumY = 0;
  for (const cell of rotatedCells) {
    sumX += cell.dx;
    sumY += cell.dy;
  }
  const newAnchorX =
    rotatedCells.length > 0 ? Math.floor(sumX / rotatedCells.length) : 0;
  const newAnchorY =
    rotatedCells.length > 0 ? Math.floor(sumY / rotatedCells.length) : 0;

  return {
    ...template,
    id: `${template.id}_r${degrees}`,
    cells: rotatedCells,
    width: newWidth,
    height: newHeight,
    anchorX: newAnchorX,
    anchorY: newAnchorY,
  };
}

/**
 * Mirror a template along X or Y axis
 *
 * @param template - Original template
 * @param axis - Axis to mirror along
 * @returns New mirrored template
 */
export function mirrorTemplate(
  template: RoomTemplate,
  axis: "x" | "y",
): RoomTemplate {
  const mirroredCells: TemplateCell[] = [];

  for (const cell of template.cells) {
    if (axis === "x") {
      mirroredCells.push({
        dx: template.width - 1 - cell.dx,
        dy: cell.dy,
      });
    } else {
      mirroredCells.push({
        dx: cell.dx,
        dy: template.height - 1 - cell.dy,
      });
    }
  }

  return {
    ...template,
    id: `${template.id}_m${axis}`,
    cells: mirroredCells,
  };
}

/**
 * Scale a template by integer factor
 *
 * @param template - Original template
 * @param factor - Scale factor (integer)
 * @returns New scaled template
 */
export function scaleTemplate(
  template: RoomTemplate,
  factor: number,
): RoomTemplate {
  if (factor < 1 || !Number.isInteger(factor)) {
    throw new Error("Scale factor must be a positive integer");
  }

  if (factor === 1) {
    return template;
  }

  const scaledCells: TemplateCell[] = [];

  for (const cell of template.cells) {
    // Each original cell becomes a factor x factor block
    for (let dy = 0; dy < factor; dy++) {
      for (let dx = 0; dx < factor; dx++) {
        scaledCells.push({
          dx: cell.dx * factor + dx,
          dy: cell.dy * factor + dy,
        });
      }
    }
  }

  return {
    ...template,
    id: `${template.id}_s${factor}`,
    cells: scaledCells,
    width: template.width * factor,
    height: template.height * factor,
    anchorX: template.anchorX * factor,
    anchorY: template.anchorY * factor,
    minLeafSize: template.minLeafSize * factor,
  };
}

/**
 * Check if a template fits within given bounds
 *
 * @param template - Template to check
 * @param maxWidth - Maximum width
 * @param maxHeight - Maximum height
 * @returns True if template fits
 */
export function templateFitsInBounds(
  template: RoomTemplate,
  maxWidth: number,
  maxHeight: number,
): boolean {
  return template.width <= maxWidth && template.height <= maxHeight;
}

/**
 * Get all cells of a template as absolute positions
 *
 * @param template - Template
 * @param x - Room X position
 * @param y - Room Y position
 * @returns Array of absolute positions
 */
export function getTemplateAbsoluteCells(
  template: RoomTemplate,
  x: number,
  y: number,
): { x: number; y: number }[] {
  return template.cells.map((cell) => ({
    x: x + cell.dx,
    y: y + cell.dy,
  }));
}

/**
 * Calculate template floor area (number of floor cells)
 *
 * @param template - Template
 * @returns Number of floor cells
 */
export function getTemplateArea(template: RoomTemplate): number {
  return template.cells.length;
}

/**
 * Calculate template center point
 *
 * @param template - Template
 * @param x - Room X position
 * @param y - Room Y position
 * @returns Center point
 */
export function getTemplateCenter(
  template: RoomTemplate,
  x: number,
  y: number,
): { x: number; y: number } {
  if (template.cells.length === 0) {
    return { x, y };
  }

  let sumX = 0;
  let sumY = 0;
  for (const cell of template.cells) {
    sumX += x + cell.dx;
    sumY += y + cell.dy;
  }

  return {
    x: Math.floor(sumX / template.cells.length),
    y: Math.floor(sumY / template.cells.length),
  };
}

/**
 * Select a template that fits the given leaf dimensions
 *
 * @param templates - Available templates
 * @param leafWidth - BSP leaf width
 * @param leafHeight - BSP leaf height
 * @param rng - Random number generator
 * @param config - Selection configuration
 * @returns Selected template or null if none fit
 */
export function selectTemplateForLeaf(
  templates: readonly RoomTemplate[],
  leafWidth: number,
  leafHeight: number,
  rng: () => number,
  config: TemplateSelectionConfig = DEFAULT_TEMPLATE_SELECTION,
): RoomTemplate | null {
  // Check template chance
  if (rng() > config.templateChance) {
    return null;
  }

  // Filter templates that fit
  // Note: leafWidth/leafHeight should be the AVAILABLE space (after room padding from caller)
  const fitting = templates.filter((t) => {
    // Check minimum dimension requirement
    if (Math.min(leafWidth, leafHeight) < t.minLeafSize) {
      return false;
    }

    // Check if template dimensions fit in available space
    if (!templateFitsInBounds(t, leafWidth, leafHeight)) {
      return false;
    }

    // Check room type compatibility
    if (config.roomType && t.compatibleTypes) {
      if (!t.compatibleTypes.includes(config.roomType)) {
        return false;
      }
    }

    // Check required tags
    if (config.requiredTags && config.requiredTags.length > 0) {
      if (
        !t.tags ||
        !config.requiredTags.every((tag) => t.tags?.includes(tag))
      ) {
        return false;
      }
    }

    return true;
  });

  if (fitting.length === 0) {
    return null;
  }

  // Random selection
  const index = Math.min(
    Math.floor(rng() * fitting.length),
    fitting.length - 1,
  );
  return fitting[index] ?? null;
}

/**
 * Generate all rotation variants of a template
 *
 * @param template - Base template
 * @returns Array of all rotation variants (including original)
 */
export function generateAllRotations(template: RoomTemplate): RoomTemplate[] {
  // Cross/plus shapes are rotationally symmetric at 90 degrees
  if (template.shape === "cross" || template.shape === "plus") {
    return [template];
  }

  return [
    template,
    rotateTemplate(template, 90),
    rotateTemplate(template, 180),
    rotateTemplate(template, 270),
  ];
}

/**
 * Generate all variants (rotations + mirrors) of a template
 *
 * @param template - Base template
 * @returns Array of all variants
 */
export function generateAllVariants(template: RoomTemplate): RoomTemplate[] {
  const rotations = generateAllRotations(template);
  const variants: RoomTemplate[] = [...rotations];

  // Add mirrored versions (only for asymmetric shapes)
  if (template.shape === "l-shape") {
    for (const rot of rotations) {
      variants.push(mirrorTemplate(rot, "x"));
    }
  }

  return variants;
}
