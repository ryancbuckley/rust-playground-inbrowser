// A share link from the multiple-file view has a `file` query parameter
// for each file: its path, a newline, then its contents. (A path cannot
// contain a newline.) The single-file view's links have `code` instead.

export interface SharedFile {
  name: string;
  content: string;
}

export const encodeFile = ({ name, content }: SharedFile): string => `${name}\n${content}`;

export const decodeFile = (param: string): SharedFile | null => {
  const newline = param.indexOf('\n');
  if (newline < 0) {
    return null;
  }
  return { name: param.slice(0, newline), content: param.slice(newline + 1) };
};
