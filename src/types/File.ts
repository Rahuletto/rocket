export interface File {
  id: string;
  name: string;
  kind: 'file' | 'directory';
  path: string;
}
