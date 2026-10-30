import React from 'react';

import Example from './HelpExample';
import Link from './uss-router/Link';

import * as styles from './Help.module.css';

import { navigateToIndex } from './reducers/page';
import { useAppSelector } from './hooks';
import { baseUrlSelector } from './selectors';

const ACE_URL = 'https://github.com/ajaxorg/ace';
const MONACO_URL = 'https://microsoft.github.io/monaco-editor/';
const CLIPPY_URL = 'https://github.com/rust-lang/rust-clippy';
const RUSTFMT_URL = 'https://github.com/rust-lang/rustfmt';
const LOCALSTORAGE_URL = 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API';
const RUST_PLAYGROUND_URL = 'https://github.com/rust-lang/rust-playground';
const PLAY_URL = 'https://play.rust-lang.org/';
const SHEPMASTER_URL = 'https://github.com/shepmaster/';
const CG_CLIF_URL = 'https://github.com/rust-lang/rustc_codegen_cranelift';
const WILD_URL = 'https://github.com/wild-linker/wild';
const CRATES_IO_URL = 'https://crates.io/';
const RUST_COOKBOOK_URL = 'https://rust-lang-nursery.github.io/rust-cookbook/';
const RUST_EDITION_2018_URL = 'https://doc.rust-lang.org/edition-guide/rust-2018/index.html';
const LICENSES_URL = 'dist/licenses.html';

const CRATE_EXAMPLE = `use rand::prelude::*;

fn main() {
    let mut rng = rand::rng();
    println!("{}", rng.random::<u8>());
}`;

const CLIPPY_EXAMPLE = `fn main() {
    match true {
        true => println!("true"),
        false => println!("false"),
    }
}`;

const RUSTFMT_EXAMPLE = `// wow, this is ugly!
fn main ()
{ struct Foo { a: u8, b: String, }
match 4 {2=>{},_=>{}} }`;

const THREADS_EXAMPLE = `use std::thread;

fn main() {
    let handles: Vec<_> = (0..4)
        .map(|i| thread::spawn(move || i * i))
        .collect();
    for h in handles {
        println!("{}", h.join().unwrap());
    }
}`;

const LINK_EXAMPLE_CODE = 'fn main() { println!("hello world!"); }';

const TEST_EXAMPLE = `#[test]
fn test_something() {
    assert_ne!(42, 0);
}`;

const LIBRARY_EXAMPLE = `#![crate_type="lib"]

pub fn library_fn() -> u8 {
    42
}`;

const OUTPUT_EXAMPLE = `#[inline(never)]
pub fn a_loop() -> i32 {
    let mut sum = 0;
    for i in 0..100 {
        sum += i;
    }
    sum
}

fn main() {
    println!("{}", a_loop());
}`;

const Help: React.FC = () => {
  const baseUrl = useAppSelector(baseUrlSelector);
  const crates = useAppSelector((state) => state.crates);

  // Deliberately **not** using normal tools that would escape
  // characters. The example code we use is fine for URLs, and
  // skipping the escaping makes the docs prettier.
  const linkExample = `${baseUrl}?code=${LINK_EXAMPLE_CODE}`;

  return (
    <section className={styles.container}>
      <h1>Rust in the Browser</h1>
      <Link action={navigateToIndex}>Return to the playground</Link>

      <LinkableSection id="about" header="About" level="h2">
        <p>
          This playground compiles and runs Rust entirely in your browser. The compiler
          (rustc, with <a href={CG_CLIF_URL}>Cranelift</a> generating WebAssembly), the
          linker (<a href={WILD_URL}>wild</a>) and your program all run on this page, as
          WebAssembly. Nothing you write is sent anywhere.
        </p>

        <p>
          Its interface is that of the <a href={RUST_PLAYGROUND_URL}>Rust Playground</a>,
          which runs <a href={PLAY_URL}>play.rust-lang.org</a>, created by
          {' '}
          <a href={SHEPMASTER_URL}>Jake Goulding</a> and its contributors, and used here under
          its MIT license. We owe them a great debt. Where that playground asks its server to
          compile and run code, this one asks the compiler in your browser.
        </p>

        <p>
          The playground ships a lot of open-source software to your
          browser. See the <a href={LICENSES_URL}>licenses</a> for all of it.
        </p>
      </LinkableSection>

      <LinkableSection id="features" header="Features" level="h2">
        <LinkableSection id="features-crates" header="Crates" level="h3">
          <p>
            Like play.rust-lang.org, the playground provides the top 100 most downloaded
            crates from <a href={CRATES_IO_URL}>crates.io</a>, the crates from
            the <a href={RUST_COOKBOOK_URL}>Rust Cookbook</a>, and all of their dependencies,
            but for those that cannot work in a browser: network clients like reqwest and
            hyper, and crates that need OpenSSL. They are prebuilt for WebAssembly. Each is
            downloaded the first time a program uses it, and kept by your browser; to
            download them all at once, see <strong>Crates</strong> in
            the <strong>Config</strong> menu.
          </p>

          <p>
            To use a crate, add the appropriate
            {' '}
            <Code>extern crate foo</Code> line to the code, or, since
            {' '}
            <a href={RUST_EDITION_2018_URL}>Rust Edition 2018</a>, just
            {' '}
            <Code>use</Code> any item from that crate.
          </p>

          <Example code={CRATE_EXAMPLE} />

          <details>
            <summary>The {crates.length} crates</summary>
            <p>
              {crates
                .map((c) => (c.id === c.name.replace(/-/g, '_') ? `${c.name} ${c.version}` : `${c.id} (${c.name} ${c.version})`))
                .join(', ')}
            </p>
          </details>
        </LinkableSection>

        <LinkableSection id="features-threads" header="Threads" level="h3">
          <p>
            Programs can start threads with <Code>std::thread</Code>. Each runs in
            its own web worker, sharing the program&rsquo;s memory.
          </p>

          <Example code={THREADS_EXAMPLE} />
        </LinkableSection>

        <LinkableSection id="features-formatting" header="Formatting code" level="h3">
          <p>
            <a href={RUSTFMT_URL}>rustfmt</a> is a tool for formatting Rust code
            according to the Rust style guidelines. Click on the <strong>Rustfmt</strong>
            {' '}
            button in the <strong>Tools</strong> menu to automatically reformat your code.
          </p>

          <Example code={RUSTFMT_EXAMPLE} />
        </LinkableSection>

        <LinkableSection id="features-linting" header="Linting code" level="h3">
          <p>
            <a href={CLIPPY_URL}>Clippy</a> is a collection of lints to catch common
          mistakes and improve your Rust code. Its lints are added to the compiler&rsquo;s
          warnings when you run the code (turn this off in the advanced options), and
          clicking on the <strong>Clippy</strong>
            {' '}
            button in the <strong>Tools</strong> menu shows them on their own.
          </p>

          <Example code={CLIPPY_EXAMPLE} />
        </LinkableSection>

        <LinkableSection id="features-auto-run" header="Auto-run" level="h3">
          <p>
            The code runs again after every change, replacing the run in
            progress. Turn this off in the advanced options (the
            {' '}
            <strong>⋮</strong> button), where you can also change how long programs
            may run.
          </p>
        </LinkableSection>

        <LinkableSection id="features-sharing" header="Sharing code" level="h3">
          <p>
            Click on the <strong>Share</strong> button for a link with
            your code in it. Nothing is uploaded: whoever opens the link
            compiles the code in their own browser. Keep the code short, as
            URLs have limitations on the maximum length.
          </p>
        </LinkableSection>

        <LinkableSection id="features-linking" header="Linking to the playground with initial code" level="h3">
          <p>
            If you have a web page with Rust code that you’d like to
            show in action, you can link to the playground with the
          Rust code in the query parameter <Code>code</Code>. Make sure to
                                        escape any special characters. Keep the code short, as URLs have
                                        limitations on the maximum length.
          </p>

          <pre className={styles.code}><code>{linkExample}</code></pre>
        </LinkableSection>

        <LinkableSection id="features-tests" header="Executing tests" level="h3">
          <p>
            If your code contains the <Code>#[test]</Code> attribute and does not
          contain a <Code>main</Code> method, the tests are run instead of
          the program, as <Code>cargo test</Code> would.
          </p>

          <Example code={TEST_EXAMPLE} />
        </LinkableSection>

        <LinkableSection id="features-library" header="Compiling as a library" level="h3">
          <p>
            If your code contains the <Code>#![crate_type=&quot;lib&quot;]</Code> attribute,
            it is only built, as <Code>cargo build</Code> would.
          </p>

          <Example code={LIBRARY_EXAMPLE} />
        </LinkableSection>

        <LinkableSection id="features-output-formats" header="Output formats" level="h3">
          <p>
            Instead of executing the code, you can also see intermediate
            output of the compiler: Rust MIR or HIR (in the menu next to
            {' '}
            <strong>Run</strong>), or the code with its macros expanded (in
            the <strong>Tools</strong> menu). MIR is often used in conjunction with the
            {' '}
            <a href="#features-modes">mode</a> set to “Release” to see how the
            compiler has chosen to optimize some specific piece of code.
          </p>

          <Example code={OUTPUT_EXAMPLE} />
        </LinkableSection>

        <LinkableSection id="features-modes" header="Compilation modes" level="h3">
          <p>
            Rust has two primary compilation modes: <strong>Debug</strong> and
            {' '}
            <strong>Release</strong>. Debug compiles code faster while Release
            performs more aggressive optimizations.
          </p>

          <p>
            You can choose which mode to compile in using the <strong>Mode</strong>
            {' '}
            menu.
          </p>
        </LinkableSection>

        <LinkableSection id="features-channels" header="Rust channels" level="h3">
          <p>
            The compiler is built from a <strong>nightly</strong> version of
            Rust, so experimental features are available. There is no
            {' '}
            <strong>stable</strong> or <strong>beta</strong> channel.
          </p>
        </LinkableSection>

        <LinkableSection id="features-customization" header="Customization" level="h3">
          <p>
            The <a href={ACE_URL}>Ajax.org Cloud9 Editor (Ace)</a> is used to
            provide a better interface for editing code. Ace comes with
            several keybinding options (such as Emacs and Vim) as well as many
            themes.
          </p>

          <p>
            You may choose to use the <a href={MONACO_URL}>Monaco</a> editor instead.
            This editor is used in VS Code and may be more familiar to people who
            use VS Code.
          </p>

          <p>
            You may also disable Ace and Monaco completely, falling back to a
            simple HTML text area.
          </p>

          <p>
            These options can be configured via the <strong>Config</strong> menu.
          </p>
        </LinkableSection>

        <LinkableSection id="features-persistence" header="Persistence" level="h3">
          <p>
            The most recently entered code will be automatically saved in your browser’s
            {' '}
            <a href={LOCALSTORAGE_URL}>local storage</a>. This allows you to recover
            your last work even if you close the browser.
          </p>

          <p>
            Local storage is a singleton resource, so if you use multiple windows,
            only the most recently saved code will be persisted.
          </p>
        </LinkableSection>
      </LinkableSection>

      <LinkableSection id="limitations" header="Limitations" level="h2">
        <dl>
          <dt>Download</dt>
          <dd>
            The compiler, linker and standard library are downloaded when the
            page opens, about 60 MB compressed. Crates are downloaded when a
            program first uses them: a few MB each with their dependencies,
            about 23 MB for tokio, and 124 MB for all of them.
          </dd>

          <dt>Crates</dt>
          <dd>
            Programs are a single crate (or a few files of one, with the
            multiple-file view) and can only use the prebuilt crates. They
            cannot define proc macros of their own. A program is given the
            crates it names, so a crate used only by a macro from another
            crate must be named too.
          </dd>

          <dt>Standard input</dt>
          <dd>
            Programs have no standard input: reading it finds it empty.
          </dd>

          <dt>Network</dt>
          <dd>
            There is no network connection available to programs.
          </dd>

          <dt>Panics</dt>
          <dd>
            Panics abort the program, and there are no backtraces.
          </dd>

          <dt>Memory</dt>
          <dd>
            Programs can use up to 4 GiB, as much as the browser allows a
            page. Some browsers allow less.
          </dd>

          <dt>Execution Time</dt>
          <dd>
            Programs are stopped after the run limit, 10 seconds unless you
            change it in the advanced options. Compiling has no limit.
          </dd>
        </dl>
      </LinkableSection>
    </section>
  );
};

const LinkableSection: React.FC<LinkableSectionProps> = ({
  id, header, level: Level, children,
}) => (
  <div id={id}>
    <Level>
      <span className={styles.header}>
        <a className={styles.headerLink} href={`#${id}`}>{header}</a>
      </span>
    </Level>
    {children}
  </div>
);

interface LinkableSectionProps {
  children: React.ReactNode;
  id: string;
  header: string;
  level: React.ElementType;
}

const Code: React.FC<React.PropsWithChildren<unknown>> = ({ children }) => (
  <code className={styles.code}>{children}</code>
);

export default Help;
