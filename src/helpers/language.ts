const fileExtensionToMonacoLanguage: { [key: string]: string } = {
  ".abap": "abap",
  ".cls": "apex",
  ".azcli": "azcli",
  ".bat": "bat",
  ".bicep": "bicep",
  ".c": "c",
  ".coffeescript": "coffeescript",
  ".coffee": "coffeescript",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".h": "cpp",
  ".hpp": "cpp",
  ".hh": "cpp",
  ".hxx": "cpp",
  ".cs": "csharp",
  ".csx": "csharp",
  ".css": "css",
  ".dockerfile": "dockerfile",
  ".fs": "fsharp",
  ".fsharp": "fsharp",
  ".go": "go",
  ".graphql": "graphql",
  ".gql": "graphql",
  ".html": "html",
  ".htm": "html",
  ".ini": "ini",
  ".java": "java",
  ".js": "javascript",
  ".es6": "javascript",
  ".jsx": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".json": "json",
  ".jl": "julia",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".less": "less",
  ".lua": "lua",
  ".md": "markdown",
  ".markdown": "markdown",
  ".m": "objective-c",
  ".mm": "objective-c",
  ".php": "php",
  ".pug": "pug",
  ".py": "python",
  ".r": "r",
  ".cshtml": "razor",
  ".rb": "ruby",
  ".rs": "rust",
  ".scss": "scss",
  ".sh": "shell",
  ".sol": "solidity",
  ".sql": "sql",
  ".swift": "swift",
  ".tcl": "tcl",
  ".twig": "twig",
  ".vb": "vb",
  ".xml": "xml",
  ".pl": "perl",
  ".raku": "perl6",
  ".pl6": "perl6",
  ".p6": "perl6",
  ".ex": "elixir",
  ".exs": "elixir",
  ".erl": "erlang",
  ".hrl": "erlang",
  ".prisma": "prisma",
  ".sc": "scala",
  ".scm": "scheme",
  ".sld": "scheme",
  ".sls": "scheme",
  ".sps": "scheme",
  ".ss": "scheme",
  ".scala": "scala",
  ".v": "verilog",
  ".sv": "systemverilog",
  ".svh": "systemverilog",
  ".tla": "tla",
  ".toml": "toml",
  ".yaml": "yaml",
  ".yml": "yaml",
};

// Example usage:
export const getMonacoLanguage = (extension: string) => {
  return fileExtensionToMonacoLanguage[`.${extension}`] || "plaintext";
};
