import axios, { type AxiosInstance } from "axios";

export interface CanvasConfig {
  baseUrl: string;
  apiToken: string;
}

export interface Course {
  id: number;
  name: string;
  course_code: string;
  enrollment_state: string;
  workflow_state: string;
}

export interface Module {
  id: number;
  name: string;
  position: number;
  unlock_at: string | null;
  require_sequential_progress: boolean;
  items_count: number;
  items_url: string;
  items?: ModuleItem[];
}

export interface ModuleItem {
  id: number;
  title: string;
  position: number;
  indent: number;
  type: "File" | "Page" | "Assignment" | "Quiz" | "ExternalUrl" | "ExternalTool" | "Attachment" | "SubHeader";
  module_id: number;
  html_url: string;
  content_id?: number;
  url?: string;
  external_url?: string;
}

export interface CanvasFile {
  id: number;
  display_name: string;
  filename: string;
  "content-type": string;
  url: string;
  size: number;
  created_at: string;
  updated_at: string;
  mime_class: string;
  folder_id: number;
}

export interface Assignment {
  id: number;
  name: string;
  description: string | null;
  due_at: string | null;
  points_possible: number | null;
  html_url: string;
  submission_types: string[];
  workflow_state: string;
}

export interface Announcement {
  id: number;
  title: string;
  message: string;
  posted_at: string;
  html_url: string;
}

export class CanvasClient {
  private http: AxiosInstance;

  constructor(config: CanvasConfig) {
    this.http = axios.create({
      baseURL: `${config.baseUrl.replace(/\/$/, "")}/api/v1`,
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        "Content-Type": "application/json",
      },
    });
  }

  private async paginate<T>(path: string, params: Record<string, unknown> = {}): Promise<T[]> {
    const results: T[] = [];
    let nextUrl: string | null = path;
    while (nextUrl) {
      const isAbsolute = nextUrl.startsWith("http");
      const response = await (isAbsolute
        ? axios.get<T[]>(nextUrl, { headers: this.http.defaults.headers.common })
        : this.http.get<T[]>(nextUrl, { params }));
      results.push(...response.data);
      const linkHeader = response.headers["link"] as string | undefined;
      nextUrl = this.parseNextLink(linkHeader);
      params = {};
    }
    return results;
  }

  private parseNextLink(linkHeader: string | undefined): string | null {
    if (!linkHeader) return null;
    const parts = linkHeader.split(",");
    for (const part of parts) {
      const [urlPart, relPart] = part.split(";");
      if (relPart?.trim() === 'rel="next"') {
        return urlPart.trim().slice(1, -1);
      }
    }
    return null;
  }

  async getCourses(): Promise<Course[]> {
    return this.paginate<Course>("/courses", {
      enrollment_state: "active",
      per_page: 100,
    });
  }

  async getModules(courseId: number, includeItems = true): Promise<Module[]> {
    return this.paginate<Module>(`/courses/${courseId}/modules`, {
      ...(includeItems ? { "include[]": "items" } : {}),
      per_page: 100,
    });
  }

  async getModuleItems(courseId: number, moduleId: number): Promise<ModuleItem[]> {
    return this.paginate<ModuleItem>(
      `/courses/${courseId}/modules/${moduleId}/items`,
      { per_page: 100 }
    );
  }

  async getFile(fileId: number): Promise<CanvasFile> {
    const response = await this.http.get<CanvasFile>(`/files/${fileId}`);
    return response.data;
  }

  async getAssignments(courseId: number): Promise<Assignment[]> {
    return this.paginate<Assignment>(`/courses/${courseId}/assignments`, {
      per_page: 100,
      order_by: "due_at",
    });
  }

  async getAnnouncements(courseId: number): Promise<Announcement[]> {
    return this.paginate<Announcement>("/announcements", {
      "context_codes[]": `course_${courseId}`,
      per_page: 50,
    });
  }

  async downloadBuffer(url: string): Promise<Buffer> {
    const response = await axios.get(url, {
      headers: this.http.defaults.headers.common,
      responseType: "arraybuffer",
    });
    return Buffer.from(response.data);
  }
}
