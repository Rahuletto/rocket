export interface File {
  id: string;
  name: string;
  kind: 'file';
  path: string;
}

export interface Folder {
  id: string;
  name: string;
  kind: 'directory';
  path: string;
  children: (File | Folder)[];
}