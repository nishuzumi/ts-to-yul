import { Project, SourceFile, ClassDeclaration } from "ts-morph";

const BASE_COMPILER_OPTIONS = {
  target: 99, // ESNext
  module: 99, // ESNext
  strict: true,
  experimentalDecorators: true,
};

const FILE_SYSTEM_OPTIONS = {
  moduleResolution: 100, // Bundler
  esModuleInterop: true,
  skipLibCheck: true,
};

export class Parser {
  private project: Project;
  private useFileSystem: boolean;

  constructor(useFileSystem = false) {
    this.useFileSystem = useFileSystem;
    this.project = new Project({
      useInMemoryFileSystem: !useFileSystem,
      compilerOptions: {
        ...BASE_COMPILER_OPTIONS,
        ...(useFileSystem ? FILE_SYSTEM_OPTIONS : {}),
      },
    });
  }

  parse(source: string, fileName = "contract.ts"): SourceFile {
    return this.project.createSourceFile(fileName, source, { overwrite: true });
  }

  parseFile(filePath: string): SourceFile {
    if (!this.useFileSystem) {
      throw new Error("Parser must be initialized with useFileSystem=true to parse files");
    }
    return this.project.addSourceFileAtPath(filePath);
  }

  getContracts(sourceFile: SourceFile): ClassDeclaration[] {
    return sourceFile.getClasses().filter((c) => c.isExported());
  }
}
