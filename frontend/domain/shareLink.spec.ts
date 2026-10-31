import { decodeFile, encodeFile } from './shareLink';

describe('share link files', () => {
  test('round trip through a query string', () => {
    const files = [
      { name: 'src/main.rs', content: 'mod greet;\n\nfn main() {\n    greet::hi();\n}\n' },
      { name: 'src/greet.rs', content: 'pub fn hi() { println!("a & b + c = 100%"); }\n' },
      { name: 'src/empty.rs', content: '' },
    ];

    const params = new URLSearchParams();
    for (const f of files) {
      params.append('file', encodeFile(f));
    }
    const parsed = new URLSearchParams(params.toString()).getAll('file').map(decodeFile);

    expect(parsed).toEqual(files);
  });

  test('a parameter without a newline is not a file', () => {
    expect(decodeFile('src/main.rs')).toBeNull();
  });
});
