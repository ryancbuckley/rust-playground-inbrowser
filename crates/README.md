# The crates

The crates programs can use: play.rust-lang.org's, but for those that cannot
work in the browser.

```sh
python3 crates/top-crates.py   # Cargo.toml, from the Rust Playground's list (when updating it)
python3 crates/build.py        # build them for wasm, into web/dist/crates
```

`top-crates.py` takes the Rust Playground's generated list
(`compiler/base/Cargo.toml`, at the commit in `frontend/package.json`) and
leaves out, with their reasons, the crates in `EXCLUDED` and those that
depend on them. When `build.py` names a crate that did not build, add it
there.
