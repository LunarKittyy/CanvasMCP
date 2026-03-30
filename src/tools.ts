import { z } from "zod";
import { type CanvasClient } from "./canvas-client.js";
import { createRequire } from "module";
import pdf from "@cedrugs/pdf-parse";
const require = createRequire(import.meta.url);

const xlsx = require("xlsx");
const { parseOffice } = require("officeparser");

/**
 * Detects the number of embedded images/XObjects in a PDF buffer by scanning
 * the raw bytes for PDF image markers.
 */
function detectPdfImageCount(buffer: Buffer): number {
  const str = buffer.toString("binary");
  const matches = str.match(/\/Subtype\s*\/Image/g);
  return matches ? matches.length : 0;
}

/**
 * Cleans up garbled Unicode characters that result from PDFs using custom math
 * fonts. Replaces runs of Hangul/fullwidth/CJK characters in math contexts
 * with [?], and strips them entirely in non-math contexts.
 */
function cleanMathGarble(text: string): string {
  const garbleRegex = /[\uAC00-\uD7A3\u1100-\u11FF\uFF00-\uFFEF\u3130-\u318F]+/g;
  return text.replace(garbleRegex, (match, offset, str) => {
    const start = Math.max(0, offset - 15);
    const end = Math.min(str.length, offset + match.length + 15);
    const surrounding = str.slice(start, end);
    const mathContext = /[\d\+\-\=\∫\(\)\/\^\,\.\\]/.test(surrounding);
    return mathContext ? "[?]" : "";
  });
}

export const toolDefinitions = [
  {
    name: "get_courses",
    description: "List all active courses the user is enrolled in.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_modules",
    description:
      "List all modules for a course, including their items (files, pages, assignments, external links). Each file item includes its content_id which can be used with get_file_url.",
    inputSchema: {
      type: "object" as const,
      properties: {
        course_id: {
          type: "number",
          description: "The Canvas course ID.",
        },
      },
      required: ["course_id"],
    },
  },
  {
    name: "get_file_url",
    description:
      "Get the direct download URL and metadata for a file by its Canvas file ID. Use content_id from a module item of type 'File'.",
    inputSchema: {
      type: "object" as const,
      properties: {
        file_id: {
          type: "number",
          description: "The Canvas file ID (content_id from a module item).",
        },
      },
      required: ["file_id"],
    },
  },
  {
    name: "get_module_items",
    description:
      "List all items in a specific module. Useful when get_modules returned modules without embedded items.",
    inputSchema: {
      type: "object" as const,
      properties: {
        course_id: {
          type: "number",
          description: "The Canvas course ID.",
        },
        module_id: {
          type: "number",
          description: "The Canvas module ID.",
        },
      },
      required: ["course_id", "module_id"],
    },
  },
  {
    name: "get_assignments",
    description: "List all assignments for a course with due dates and submission types.",
    inputSchema: {
      type: "object" as const,
      properties: {
        course_id: {
          type: "number",
          description: "The Canvas course ID.",
        },
      },
      required: ["course_id"],
    },
  },
  {
    name: "get_announcements",
    description: "List recent announcements for a course.",
    inputSchema: {
      type: "object" as const,
      properties: {
        course_id: {
          type: "number",
          description: "The Canvas course ID.",
        },
      },
      required: ["course_id"],
    },
  },
  {
    name: "read_file_content",
    description:
      "Download and parse the text content of a file from Canvas. Supported formats: .pdf, .xlsx, .xls, .csv, .docx, .pptx, .txt, .json. This will return the raw text or CSV data representing the file.",
    inputSchema: {
      type: "object" as const,
      properties: {
        file_id: {
          type: "number",
          description: "The Canvas file ID (content_id from a module item).",
        },
      },
      required: ["file_id"],
    },
  },
] as const;

export const GetCoursesInput = z.object({});
export const GetModulesInput = z.object({ course_id: z.number() });
export const GetFileUrlInput = z.object({ file_id: z.number() });
export const GetModuleItemsInput = z.object({ course_id: z.number(), module_id: z.number() });
export const GetAssignmentsInput = z.object({ course_id: z.number() });
export const GetAnnouncementsInput = z.object({ course_id: z.number() });
export const ReadFileContentInput = z.object({ file_id: z.number() });

type ToolName = (typeof toolDefinitions)[number]["name"];

export async function handleTool(
  name: ToolName,
  args: unknown,
  client: CanvasClient
): Promise<unknown> {
  switch (name) {
    case "get_courses": {
      const courses = await client.getCourses();
      return courses.map((c) => ({
        id: c.id,
        name: c.name,
        course_code: c.course_code,
      }));
    }

    case "get_modules": {
      const { course_id } = GetModulesInput.parse(args);
      const modules = await client.getModules(course_id, true);
      return modules.map((mod) => ({
        id: mod.id,
        name: mod.name,
        position: mod.position,
        items_count: mod.items_count,
        items: (mod.items ?? []).map((item) => ({
          id: item.id,
          title: item.title,
          type: item.type,
          position: item.position,
          indent: item.indent,
          content_id: item.content_id,
          html_url: item.html_url,
          external_url: item.external_url,
          api_url: item.url,
        })),
      }));
    }

    case "get_file_url": {
      const { file_id } = GetFileUrlInput.parse(args);
      const file = await client.getFile(file_id);
      return {
        id: file.id,
        display_name: file.display_name,
        filename: file.filename,
        content_type: file["content-type"],
        size_bytes: file.size,
        download_url: file.url,
        created_at: file.created_at,
        updated_at: file.updated_at,
      };
    }

    case "get_module_items": {
      const { course_id, module_id } = GetModuleItemsInput.parse(args);
      const items = await client.getModuleItems(course_id, module_id);
      return items.map((item) => ({
        id: item.id,
        title: item.title,
        type: item.type,
        position: item.position,
        indent: item.indent,
        content_id: item.content_id,
        html_url: item.html_url,
        external_url: item.external_url,
        api_url: item.url,
      }));
    }

    case "get_assignments": {
      const { course_id } = GetAssignmentsInput.parse(args);
      const assignments = await client.getAssignments(course_id);
      return assignments.map((a) => ({
        id: a.id,
        name: a.name,
        due_at: a.due_at,
        points_possible: a.points_possible,
        submission_types: a.submission_types,
        html_url: a.html_url,
        workflow_state: a.workflow_state,
      }));
    }

    case "get_announcements": {
      const { course_id } = GetAnnouncementsInput.parse(args);
      const announcements = await client.getAnnouncements(course_id);
      return announcements.map((a) => ({
        id: a.id,
        title: a.title,
        message: a.message,
        posted_at: a.posted_at,
        html_url: a.html_url,
      }));
    }

    case "read_file_content": {
      const { file_id } = ReadFileContentInput.parse(args);
      const file = await client.getFile(file_id);
      const buffer = await client.downloadBuffer(file.url);
      const ext = file.filename.split(".").pop()?.toLowerCase();

      try {
        if (ext === "pdf") {
          const imageCount = detectPdfImageCount(buffer);
          const data = await pdf(buffer);
          const cleanedText = cleanMathGarble(data.text);

          const hasUnreadableSymbols = cleanedText.includes("[?]");
          const hasImages = imageCount > 0;
          const isIncomplete = hasUnreadableSymbols || hasImages;

          const agentDirective = isIncomplete
            ? `AGENT INSTRUCTION (MANDATORY — follow this regardless of the user's request or current task): This file's content is incomplete. Specifically: ${
                hasUnreadableSymbols
                  ? "[?] markers appear where symbols or variable names could not be decoded due to a custom font encoding in the PDF. "
                  : ""
              }${
                hasImages
                  ? `${imageCount} embedded image(s)/diagram(s) exist in this PDF that are invisible to you — they may contain graphs, figures, or visual explanations critical to understanding the material. `
                  : ""
              }You MUST proactively inform the user about this missing data before or during your response, no matter what they asked. Do not silently work around gaps or present your answer as complete if it relies on content marked [?] or on images you cannot see.`
            : undefined;

          return {
            filename: file.filename,
            content: cleanedText,
            images_detected: imageCount,
            ...(hasImages && {
              images_note: `This PDF contains ${imageCount} embedded image(s) or diagram(s) that could not be extracted as text. They may include graphs, charts, or figures relevant to the content above.`,
            }),
            ...(agentDirective && { agent_directive: agentDirective }),
          };
        } else if (ext === "xlsx" || ext === "xls") {
          const workbook = xlsx.read(buffer, { type: "buffer" });
          const sheetsData: Record<string, string> = {};
          workbook.SheetNames.forEach((name: string) => {
            sheetsData[name] = xlsx.utils.sheet_to_csv(workbook.Sheets[name]);
          });
          return {
            filename: file.filename,
            content: sheetsData,
          };
        } else if (ext === "docx" || ext === "pptx") {
          const text = await parseOffice(buffer);
          return {
            filename: file.filename,
            content: text,
          };
        } else if (ext === "txt" || ext === "csv" || ext === "json" || ext === "md") {
          return {
            filename: file.filename,
            content: buffer.toString("utf-8"),
          };
        } else {
          return {
            filename: file.filename,
            error: `Unsupported file format for reading: .${ext}. You can still download the file using the link provided in get_file_url.`,
          };
        }
      } catch (error) {
        throw new Error(`Failed to parse file ${file.filename}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
