/**
 * Rule Engine Expression System
 *
 * AST-based expressions for data-driven rule evaluation.
 * All expressions are defined in data (JSON), not code.
 *
 * @example
 * ```json
 * {
 *   "type": "op",
 *   "op": "<",
 *   "left": { "type": "field", "path": "context.health" },
 *   "right": { "type": "literal", "value": 0.3 }
 * }
 * ```
 */

// =============================================================================
// EXPRESSION AST
// =============================================================================

/**
 * Literal value expression
 */
export interface LiteralExpr {
  readonly type: "literal";
  readonly value: number | string | boolean;
}

/**
 * Field access expression - reads from evaluation context
 *
 * Path format: "namespace.key" (e.g., "context.health", "room.traits.dangerous")
 */
export interface FieldExpr {
  readonly type: "field";
  readonly path: string;
}

/**
 * Binary operation expression
 */
export interface BinaryOpExpr {
  readonly type: "op";
  readonly op: BinaryOperator;
  readonly left: Expression;
  readonly right: Expression;
}

/**
 * Supported binary operators
 */
export type BinaryOperator =
  | "+" // Addition
  | "-" // Subtraction
  | "*" // Multiplication
  | "/" // Division
  | "%" // Modulo
  | "==" // Equality
  | "!=" // Inequality
  | "<" // Less than
  | "<=" // Less or equal
  | ">" // Greater than
  | ">=" // Greater or equal
  | "&&" // Logical AND
  | "||" // Logical OR
  | "^" // Power/exponentiation
  | "min" // Minimum
  | "max"; // Maximum

/**
 * Unary operation expression
 */
export interface UnaryOpExpr {
  readonly type: "unary";
  readonly op: UnaryOperator;
  readonly operand: Expression;
}

/**
 * Supported unary operators
 */
export type UnaryOperator =
  | "-" // Negation
  | "!" // Logical NOT
  | "abs" // Absolute value
  | "floor" // Floor
  | "ceil" // Ceiling
  | "round" // Round
  | "sqrt"; // Square root

/**
 * Function call expression
 */
export interface FunctionExpr {
  readonly type: "fn";
  readonly name: string;
  readonly args: readonly Expression[];
}

/**
 * Conditional expression (ternary)
 */
export interface ConditionalExpr {
  readonly type: "cond";
  readonly condition: Expression;
  readonly thenBranch: Expression;
  readonly elseBranch: Expression;
}

/**
 * Reference to another rule's result
 */
export interface RuleRefExpr {
  readonly type: "ref";
  readonly ruleId: string;
}

/**
 * Array/list literal
 */
export interface ArrayExpr {
  readonly type: "array";
  readonly elements: readonly Expression[];
}

/**
 * Object literal
 */
export interface ObjectExpr {
  readonly type: "object";
  readonly properties: Readonly<Record<string, Expression>>;
}

/**
 * Range check expression (value in [min, max])
 */
export interface RangeExpr {
  readonly type: "range";
  readonly value: Expression;
  readonly min: Expression;
  readonly max: Expression;
  readonly inclusive?: boolean; // Default: true
}

/**
 * "In" check expression (value in array)
 */
export interface InExpr {
  readonly type: "in";
  readonly value: Expression;
  readonly array: Expression;
}

/**
 * Union type of all expression types
 */
export type Expression =
  | LiteralExpr
  | FieldExpr
  | BinaryOpExpr
  | UnaryOpExpr
  | FunctionExpr
  | ConditionalExpr
  | RuleRefExpr
  | ArrayExpr
  | ObjectExpr
  | RangeExpr
  | InExpr;

// =============================================================================
// EXPRESSION BUILDERS (for TypeScript convenience)
// =============================================================================

/**
 * Create a literal expression
 */
export function literal(value: number | string | boolean): LiteralExpr {
  return { type: "literal", value };
}

/**
 * Create a field access expression
 */
export function field(path: string): FieldExpr {
  return { type: "field", path };
}

/**
 * Create a binary operation expression
 */
export function op(
  operator: BinaryOperator,
  left: Expression,
  right: Expression,
): BinaryOpExpr {
  return { type: "op", op: operator, left, right };
}

/**
 * Create a unary operation expression
 */
export function unary(
  operator: UnaryOperator,
  operand: Expression,
): UnaryOpExpr {
  return { type: "unary", op: operator, operand };
}

/**
 * Create a function call expression
 */
export function fn(name: string, ...args: Expression[]): FunctionExpr {
  return { type: "fn", name, args };
}

/**
 * Create a conditional expression
 */
export function cond(
  condition: Expression,
  thenExpr: Expression,
  elseExpr: Expression,
): ConditionalExpr {
  return {
    type: "cond",
    condition,
    thenBranch: thenExpr,
    elseBranch: elseExpr,
  };
}

/**
 * Create a rule reference expression
 */
export function ref(ruleId: string): RuleRefExpr {
  return { type: "ref", ruleId };
}

/**
 * Create an array expression
 */
export function array(...elements: Expression[]): ArrayExpr {
  return { type: "array", elements };
}

/**
 * Create an object expression
 */
export function object(properties: Record<string, Expression>): ObjectExpr {
  return { type: "object", properties };
}

/**
 * Create a range check expression
 */
export function range(
  value: Expression,
  min: Expression,
  max: Expression,
  inclusive: boolean = true,
): RangeExpr {
  return { type: "range", value, min, max, inclusive };
}

/**
 * Create an "in" check expression
 */
export function inArray(value: Expression, arr: Expression): InExpr {
  return { type: "in", value, array: arr };
}

// =============================================================================
// COMMON EXPRESSION SHORTCUTS
// =============================================================================

/**
 * Create an addition expression
 */
export function add(left: Expression, right: Expression): BinaryOpExpr {
  return op("+", left, right);
}

/**
 * Create a subtraction expression
 */
export function sub(left: Expression, right: Expression): BinaryOpExpr {
  return op("-", left, right);
}

/**
 * Create a multiplication expression
 */
export function mul(left: Expression, right: Expression): BinaryOpExpr {
  return op("*", left, right);
}

/**
 * Create a division expression
 */
export function div(left: Expression, right: Expression): BinaryOpExpr {
  return op("/", left, right);
}

/**
 * Create a less-than expression
 */
export function lt(left: Expression, right: Expression): BinaryOpExpr {
  return op("<", left, right);
}

/**
 * Create a greater-than expression
 */
export function gt(left: Expression, right: Expression): BinaryOpExpr {
  return op(">", left, right);
}

/**
 * Create an equality expression
 */
export function eq(left: Expression, right: Expression): BinaryOpExpr {
  return op("==", left, right);
}

/**
 * Create an inequality expression
 */
export function neq(left: Expression, right: Expression): BinaryOpExpr {
  return op("!=", left, right);
}

/**
 * Create a logical AND expression
 */
export function and(left: Expression, right: Expression): BinaryOpExpr {
  return op("&&", left, right);
}

/**
 * Create a logical OR expression
 */
export function or(left: Expression, right: Expression): BinaryOpExpr {
  return op("||", left, right);
}

/**
 * Create a logical NOT expression
 */
export function not(operand: Expression): UnaryOpExpr {
  return unary("!", operand);
}

// =============================================================================
// EXPRESSION VALIDATION
// =============================================================================

/**
 * Expression validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate an expression structure
 */
export function validateExpression(expr: unknown): ValidationResult {
  const errors: string[] = [];

  function validate(e: unknown, path: string = "root"): void {
    if (!e || typeof e !== "object") {
      errors.push(`${path}: Expected object, got ${typeof e}`);
      return;
    }

    const obj = e as Record<string, unknown>;
    const type = obj.type;

    if (typeof type !== "string") {
      errors.push(`${path}: Missing or invalid 'type' field`);
      return;
    }

    switch (type) {
      case "literal":
        if (!["number", "string", "boolean"].includes(typeof obj.value)) {
          errors.push(
            `${path}: Invalid literal value type: ${typeof obj.value}`,
          );
        }
        break;

      case "field":
        if (typeof obj.path !== "string" || obj.path.length === 0) {
          errors.push(`${path}: Invalid field path`);
        }
        break;

      case "op":
        if (typeof obj.op !== "string") {
          errors.push(`${path}: Missing operator`);
        }
        validate(obj.left, `${path}.left`);
        validate(obj.right, `${path}.right`);
        break;

      case "unary":
        if (typeof obj.op !== "string") {
          errors.push(`${path}: Missing operator`);
        }
        validate(obj.operand, `${path}.operand`);
        break;

      case "fn":
        if (typeof obj.name !== "string") {
          errors.push(`${path}: Missing function name`);
        }
        if (!Array.isArray(obj.args)) {
          errors.push(`${path}: Invalid function arguments`);
        } else {
          for (let i = 0; i < obj.args.length; i++) {
            validate(obj.args[i], `${path}.args[${i}]`);
          }
        }
        break;

      case "cond":
        validate(obj.condition, `${path}.condition`);
        validate(obj.thenBranch, `${path}.thenBranch`);
        validate(obj.elseBranch, `${path}.elseBranch`);
        break;

      case "ref":
        if (typeof obj.ruleId !== "string") {
          errors.push(`${path}: Missing rule ID`);
        }
        break;

      case "array":
        if (!Array.isArray(obj.elements)) {
          errors.push(`${path}: Invalid array elements`);
        } else {
          for (let i = 0; i < obj.elements.length; i++) {
            validate(obj.elements[i], `${path}.elements[${i}]`);
          }
        }
        break;

      case "object":
        if (typeof obj.properties !== "object" || obj.properties === null) {
          errors.push(`${path}: Invalid object properties`);
        } else {
          const entries = Object.entries(
            obj.properties as Record<string, unknown>,
          );
          for (const [key, value] of entries) {
            validate(value, `${path}.properties.${key}`);
          }
        }
        break;

      case "range":
        validate(obj.value, `${path}.value`);
        validate(obj.min, `${path}.min`);
        validate(obj.max, `${path}.max`);
        break;

      case "in":
        validate(obj.value, `${path}.value`);
        validate(obj.array, `${path}.array`);
        break;

      default:
        errors.push(`${path}: Unknown expression type: ${type}`);
    }
  }

  validate(expr);

  return {
    valid: errors.length === 0,
    errors,
  };
}

// =============================================================================
// EXPRESSION SERIALIZATION
// =============================================================================

/**
 * Parse an expression from JSON string
 */
export function parseExpression(json: string): Expression {
  const parsed = JSON.parse(json);
  const result = validateExpression(parsed);

  if (!result.valid) {
    throw new Error(`Invalid expression: ${result.errors.join(", ")}`);
  }

  return parsed as Expression;
}

/**
 * Serialize an expression to JSON string
 */
export function stringifyExpression(expr: Expression): string {
  return JSON.stringify(expr);
}
