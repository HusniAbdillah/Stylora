import { descriptionPieceSchema, type Garment } from "./fashion-schema";
import type { z } from "zod";

export function safeValidationIssues(issues: readonly z.core.$ZodIssue[]) {
  return issues.slice(0, 12).map((issue) => ({
    code: issue.code,
    path: issue.path
      .map((segment) =>
        typeof segment === "number"
          ? String(segment)
          : typeof segment === "string" &&
              /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(segment)
            ? segment
            : "field",
      )
      .join(".")
      .slice(0, 240),
  }));
}

export class PieceStreamError extends Error {
  constructor(
    public readonly reason = "stream_structure",
    public readonly validationIssues: Array<{
      code: string;
      path: string;
    }> = [],
  ) {
    super("The provider did not return complete valid garment objects.");
  }
}

export class PieceStreamParser {
  private buffer = "";
  private cursor = 0;
  private initialized = false;
  private objectStart = -1;
  private depth = 0;
  private inString = false;
  private escaped = false;
  private ended = false;

  append(delta: string): Garment[] {
    this.buffer += delta;
    if (this.buffer.length > 2_000_000) throw new PieceStreamError();
    if (!this.initialized) {
      const opening = /^\s*\{\s*"pieces"\s*:\s*\[/.exec(this.buffer);
      if (!opening) return [];
      this.initialized = true;
      this.cursor = opening[0].length;
    }
    const completed: Garment[] = [];
    while (this.cursor < this.buffer.length && !this.ended) {
      const character = this.buffer[this.cursor];
      if (this.objectStart === -1) {
        if (character === "{") {
          this.objectStart = this.cursor;
          this.depth = 1;
          this.inString = false;
          this.escaped = false;
        } else if (character === "]") {
          this.ended = true;
        } else if (!/[\s,]/.test(character)) {
          throw new PieceStreamError();
        }
      } else if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (character === "\\") this.escaped = true;
        else if (character === '"') this.inString = false;
      } else if (character === '"') {
        this.inString = true;
      } else if (character === "{") {
        this.depth++;
      } else if (character === "}") {
        this.depth--;
        if (this.depth === 0) {
          let candidate: unknown;
          try {
            candidate = JSON.parse(
              this.buffer.slice(this.objectStart, this.cursor + 1),
            );
          } catch {
            throw new PieceStreamError("invalid_json");
          }
          const parsed = descriptionPieceSchema.safeParse(candidate);
          if (!parsed.success)
            throw new PieceStreamError(
              "garment_schema",
              safeValidationIssues(parsed.error.issues),
            );
          completed.push(parsed.data);
          this.objectStart = -1;
        }
      }
      this.cursor++;
    }
    return completed;
  }
}
